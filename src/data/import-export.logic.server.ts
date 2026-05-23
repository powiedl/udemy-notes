import type { Note } from '#/generated/prisma/client'
import { prisma } from '#/lib/db.lib.server'
import type { Prisma } from '#/lib/db.lib.server'
import {
  HTML_COMMENT_END,
  HTML_COMMENT_START,
  MAX_FILE_SIZE_UPLOAD,
} from '#/lib/constants.lib'
import { ServerActionError } from '#/types/errors.type'
import {
  generateSignature,
  processNoteForMarkdown,
} from '#/lib/export-helper.lib'
import type { ExportMdFileSchema } from '#/schemas/export-file.schema'
import type {
  AnalyzeHtmlPayloadSchema,
  ImportFileSchema,
  SaveParsedCourseSchema,
} from '#/schemas/import-file.schema'
import { orderInfo } from '#/lib/udemy.lib'
import { resolveTagIds } from '#/lib/tag-helpers.lib.server'
import { UDEMY_SELECTORS } from '#/lib/constants.lib.server'
import { prepareAndConvertHtmlToMarkdown } from '#/lib/convertHtmlToMarkdown.lib'
import type { AnalysisResult } from '#/types/import-export.type'

// #region allgemeines
export type IntegrityStatus =
  | 'INTEGRITY_OK'
  | 'INTEGRITY_MISMATCH'
  | 'NO_METADATA'

export interface CheckImportResult {
  status: IntegrityStatus
  totalNotes: number
  courseTitle: string
}

type ExportCoursePayload = Prisma.CourseGetPayload<{
  include: {
    tags: { include: { tag: true } }
    trainers: { include: { trainer: true } }
    notes: {
      include: {
        tags: { include: { tag: true } }
      }
    }
  }
}>

// Datentyp für die aus einer Datei (HTML oder Markdown) ausgelesenen Informationen
export type ParsedCourseData = {
  title: string
  courseId?: string
  description?: string
  courseUrl?: string
  imageUrl?: string
  trainerUrl?: string
  courseTags: string[]
  courseTrainers: string[]
  notes: {
    section: string
    lecture: string
    timestamp: string // Format: "hh:mm:ss" oder "mm:ss"
    parsedContent: string
    parsedOriginalContent: string | null
    noteTags: string[]
  }[]
}

/**
 * Prüft, ob eine neue Notiz von Udemy im Konflikt mit einer lokal bearbeiteten Notiz steht.
 *
 * Ein Konflikt entsteht, wenn:
 * 1. Der neue Inhalt sich vom gespeicherten Original unterscheidet (Änderung auf Udemy).
 * 2. Lokal bereits manuell Änderungen im `editedContent` vorgenommen wurden.
 */
export function checkConflict(
  newOriginalContent: string,
  existingNote: Pick<Note, 'originalContent' | 'editedContent'>,
): boolean {
  // Der neue Udemy-Content und der Originalcontent in der DB sind gleich -> kein Konflikt
  if (newOriginalContent === existingNote.originalContent) return false

  // Der Content auf Udemy hat sich verändert ...
  // und es gibt auch einen editedContent -> Konflikt!
  const hasConflict =
    existingNote.editedContent !== '' &&
    (existingNote.editedContent || '').trim() !== ''

  return hasConflict
}
// #endregion

// #region import
export const checkImportFileLogic = (mdContent: string): CheckImportResult => {
  let status: IntegrityStatus = 'NO_METADATA'

  // 1. Text splitten (identisch zum Parser), um Blöcke sauber untersuchen zu können
  const noteSplitRegex = new RegExp(
    `(?:${HTML_COMMENT_START} udemy-note-meta:\\s*\\{.*?\\}\\s*${HTML_COMMENT_END}\\s*)?^##\\s+Note`,
    'gm',
  )
  const normalizedContent = mdContent.replace(
    noteSplitRegex,
    (match) => `\n___NOTE_SPLIT___\n${match}`,
  )
  const parts = normalizedContent.split('\n___NOTE_SPLIT___\n')

  const headerContent = parts[0]
  const noteBlocks = parts.slice(1)

  // --- 2. Kurs-Level prüfen (Titel) ---
  const courseMetaRegex = new RegExp(
    `${HTML_COMMENT_START} udemy-course-meta:\\s*(\\{.*?\\})\\s*${HTML_COMMENT_END}`,
  )
  const courseMetaMatch = headerContent.match(courseMetaRegex)

  // Visuellen Titel aus der H1 auslesen
  let courseTitle = 'Unbekannter Kurs'
  const titleMatch = headerContent.match(/^#\s+(.+)$/m)
  const visualCourseTitle = titleMatch ? titleMatch[1].trim() : ''

  if (courseMetaMatch) {
    status = 'INTEGRITY_OK'
    try {
      const meta = JSON.parse(courseMetaMatch[1])
      const { sig, ...dataWithoutSig } = meta
      courseTitle = meta.courseTitle

      // Check A: Wurde die Signatur im JSON gebrochen?
      if (sig !== generateSignature(dataWithoutSig)) {
        return {
          status: 'INTEGRITY_MISMATCH',
          totalNotes: noteBlocks.length,
          courseTitle,
        }
      }

      // Check B: Kongruenz-Prüfung (Weicht die sichtbare H1 vom JSON ab?)
      if (meta.courseTitle && meta.courseTitle !== visualCourseTitle) {
        return {
          status: 'INTEGRITY_MISMATCH',
          totalNotes: noteBlocks.length,
          courseTitle,
        }
      }
    } catch (e) {
      return {
        status: 'INTEGRITY_MISMATCH',
        totalNotes: noteBlocks.length,
        courseTitle: 'Fehlerhaftes Format',
      }
    }
  } else {
    // Falls keine Kurs-Metadaten da sind, versuchen wir wenigstens den Titel zu retten
    courseTitle = visualCourseTitle || 'Unbekannter Kurs'
  }

  // --- 3. Notiz-Level prüfen ---
  const noteMetaRegex = new RegExp(
    `${HTML_COMMENT_START} udemy-note-meta:\\s*(\\{.*?\\})\\s*${HTML_COMMENT_END}`,
  )

  for (const block of noteBlocks) {
    const noteMetaMatch = block.match(noteMetaRegex)

    if (noteMetaMatch) {
      status = 'INTEGRITY_OK' // Sobald eine Notiz Metadaten hat, gilt das File als signiert
      try {
        const meta = JSON.parse(noteMetaMatch[1])
        const { sig, ...dataWithoutSig } = meta

        // Check A: Signatur gebrochen?
        if (sig !== generateSignature(dataWithoutSig)) {
          return {
            status: 'INTEGRITY_MISMATCH',
            totalNotes: noteBlocks.length,
            courseTitle,
          }
        }

        // Visuelle Werte aus dem Markdown-Block extrahieren
        const sectionMatch = block.match(/\*\s*Section:\s*(.+)/)
        const lectureMatch = block.match(/\*\s*Lecture:\s*(.+)/)
        const timeMatch = block.match(
          /\*\s*Timestamp:\s*(\d{1,2}:\d{2}(?::\d{2})?)/,
        )

        const visualSection = sectionMatch ? sectionMatch[1].trim() : ''
        const visualLecture = lectureMatch ? lectureMatch[1].trim() : ''
        const visualTimestamp = timeMatch ? timeMatch[1].trim() : ''

        // Check B: Kongruenz-Prüfung (Wurden Überschriften oder Zeiten visuell verändert?)
        if (meta.section && meta.section !== visualSection) {
          return {
            status: 'INTEGRITY_MISMATCH',
            totalNotes: noteBlocks.length,
            courseTitle,
          }
        }
        if (meta.lecture && meta.lecture !== visualLecture) {
          return {
            status: 'INTEGRITY_MISMATCH',
            totalNotes: noteBlocks.length,
            courseTitle,
          }
        }
        if (
          meta.timestamp !== undefined &&
          String(meta.timestamp) !== visualTimestamp
        ) {
          return {
            status: 'INTEGRITY_MISMATCH',
            totalNotes: noteBlocks.length,
            courseTitle,
          }
        }
      } catch (e) {
        return {
          status: 'INTEGRITY_MISMATCH',
          totalNotes: noteBlocks.length,
          courseTitle,
        }
      }
    }
  }

  return { status, totalNotes: noteBlocks.length, courseTitle }
}

export const analyzeHtmlPayloadLogic = async (
  data: AnalyzeHtmlPayloadSchema,
  userId: string,
): Promise<AnalysisResult> => {
  const conversionResult = prepareAndConvertHtmlToMarkdown(
    data.content,
    UDEMY_SELECTORS,
  )

  if (conversionResult.status === 'ERROR') {
    throw new ServerActionError(
      conversionResult.message || 'Error parsing HTML',
    )
  }

  const { course } = conversionResult

  let knownTrainer = false
  let relatedCoursesCount = 0
  let matchedTrainerName: string | undefined = undefined

  if (data.parsedTrainerUrl) {
    // 1. Zuerst prüfen: Existiert die URL global in der Trainer-Tabelle?
    const existingTrainer = await prisma.trainer.findUnique({
      where: { profileUrl: data.parsedTrainerUrl },
      select: { name: true },
    })

    if (existingTrainer) {
      // Trainer existiert global! Wir merken uns den Namen für das GUI.
      knownTrainer = true
      matchedTrainerName = existingTrainer.name

      // 2. Dann prüfen: Wie viele Kurse hat DIESER User schon mit diesem Trainer? (Für die UI-Info)
      relatedCoursesCount = await prisma.course.count({
        where: {
          userId: userId,
          trainers: {
            some: {
              trainer: {
                profileUrl: data.parsedTrainerUrl,
              },
            },
          },
        },
      })
    }
  }

  return {
    parsedCourse: {
      courseTitle: course.title,
      courseDescription: course.description,
      courseUrl: course.courseUrl,
      imageUrl: course.imageUrl,
      trainerUrl: course.trainerUrl,
      notes: course.notes.map((note: any) => ({
        section: note.section,
        lecture: note.lecture,
        timestamp: note.timestamp,
        content: note.content,
      })),
      notesCount: course.notes.length,
    },
    trainerMatch: {
      url: data.parsedTrainerUrl,
      isKnown: knownTrainer,
      existingCoursesCount: relatedCoursesCount,
      nameInDb: matchedTrainerName,
    },
  }
}

export const syncCourseToDatabase = async (
  parsedData: ParsedCourseData & { courseId?: string },
  data: ImportFileSchema,
  userId: string,
) => {
  // 1. Trainer verschmelzen
  const formTrainers = data.trainers
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  let allTrainerNames = Array.from(
    new Set([...formTrainers, ...parsedData.courseTrainers]),
  )

  // --- SICHERHEITS-CHECK FÜR DIE URL ---
  const isSingleTrainer = allTrainerNames.length === 1
  let finalTrainerUrl: string | undefined = undefined

  if (isSingleTrainer && parsedData.trainerUrl) {
    const existingTrainerByUrl = await prisma.trainer.findUnique({
      where: { profileUrl: parsedData.trainerUrl },
      select: { name: true },
    })

    if (existingTrainerByUrl) {
      // Die URL gehört bereits einem Trainer in der DB.
      // Wir verwerfen die aktuelle Eingabe und nutzen den korrekten DB-Namen.
      allTrainerNames = [existingTrainerByUrl.name]
    } else {
      // Die URL ist uns noch unbekannt, wir können sie sicher anlegen.
      finalTrainerUrl = parsedData.trainerUrl
    }
  }
  // ---------------------------------------

  // 2. Kurs laden (Der "Eiserne DNA-Check")
  let existingCourse = null

  if (parsedData.courseId) {
    // A) Moderne Datei mit Signatur: Wir suchen AUSSCHLIESSLICH über die DNA-ID.
    existingCourse = await prisma.course.findFirst({
      where: { id: parsedData.courseId, userId },
      include: {
        tags: { include: { tag: true } },
        trainers: { include: { trainer: true } },
      },
    })
  } else {
    // B) HTML-Import oder Legacy-Markdown ohne DNA: Hier ist die Suche nach Titel der einzige Weg.
    existingCourse = await prisma.course.findFirst({
      where: { userId, title: parsedData.title },
      include: {
        tags: { include: { tag: true } },
        trainers: { include: { trainer: true } },
      },
    })
  }

  // 3. Kurs-Tags verschmelzen
  let formTagIds = [...data.tagIds]
  if (data.newPrivateTags.length > 0) {
    const createdTags = await Promise.all(
      data.newPrivateTags.map((name) =>
        prisma.tag.create({
          data: { name, userId },
          select: { id: true },
        }),
      ),
    )
    formTagIds = [...formTagIds, ...createdTags.map((t) => t.id)]
  }

  const resolvedParsedCourseTagIds = await resolveTagIds(
    parsedData.courseTags,
    userId,
    existingCourse?.tags || [],
  )

  const allCourseTagIds = Array.from(
    new Set([...formTagIds, ...resolvedParsedCourseTagIds]),
  )

  let finishedCourse
  let existingNotes: any[] | null = null

  // 4. Kurs Upsert
  if (existingCourse) {
    existingNotes = await prisma.note.findMany({
      where: { courseId: existingCourse.id },
      include: { tags: { include: { tag: true } } },
    })

    const existingCourseTagIds = existingCourse.tags.map((t) => t.tagId)
    const courseTagsToCreate = allCourseTagIds.filter(
      (id) => !existingCourseTagIds.includes(id),
    )

    const existingTrainerNames = existingCourse.trainers.map(
      (t) => t.trainer.name,
    )
    const trainersToCreate = allTrainerNames.filter(
      (name) => !existingTrainerNames.includes(name),
    )

    finishedCourse = await prisma.course.update({
      where: { id: existingCourse.id },
      data: {
        // Wir schreiben den Titel aus parsedData (der dank unseres strengen Parsers
        // nun immer der "echte" signierte Titel ist, niemals der gefälschte H1-Titel)
        title: parsedData.title,
        description: parsedData.description,
        courseUrl: parsedData.courseUrl,
        imageUrl: parsedData.imageUrl,
        trainerUrl: parsedData.trainerUrl,
        trainers: {
          create: trainersToCreate.map((trainerName) => ({
            trainer: {
              connectOrCreate: {
                where: { name: trainerName },
                create: {
                  name: trainerName,
                  profileUrl: finalTrainerUrl, // Hier greift unsere bereinigte Variable
                },
              },
            },
          })),
        },
        tags: {
          create: courseTagsToCreate.map((tagId) => ({ tagId })),
        },
      },
    })
  } else {
    // Wenn es forceReplace war, wurde der Kurs vorher gelöscht. Er landet hier und wird neu erstellt.
    finishedCourse = await prisma.course.create({
      data: {
        title: parsedData.title, // Auch hier: Das ist der vertrauenswürdige DNA-Titel
        description: parsedData.description,
        courseUrl: parsedData.courseUrl,
        imageUrl: parsedData.imageUrl,
        trainerUrl: parsedData.trainerUrl,
        userId,
        trainers: {
          create: allTrainerNames.map((trainerName) => ({
            trainer: {
              connectOrCreate: {
                where: { name: trainerName },
                create: {
                  name: trainerName,
                  profileUrl: finalTrainerUrl, // Und auch hier
                },
              },
            },
          })),
        },
        tags: {
          create: allCourseTagIds.map((tagId) => ({ tagId })),
        },
      },
    })
  }

  const courseId = finishedCourse.id

  // 5. Notizen-Verarbeitung (String-basiert, wie gehabt)
  const notePromises = []
  let numberOfConflicts = 0

  for (const note of parsedData.notes) {
    const finalOriginalContent =
      note.parsedOriginalContent !== null
        ? note.parsedOriginalContent
        : note.parsedContent

    const finalEditedContent =
      note.parsedOriginalContent !== null ? note.parsedContent : ''

    if (!finalOriginalContent.trim() && !finalEditedContent.trim()) {
      continue
    }

    // Identifikation erfolgt auch hier nun über die eiserne DNA (Section, Lecture, Timestamp)
    const existingNote = existingNotes?.find(
      (n) =>
        n.timestamp === note.timestamp &&
        n.section === note.section &&
        n.lecture === note.lecture,
    )

    const calculatedOrderInfo = orderInfo(
      note.section,
      note.lecture,
      note.timestamp,
    )

    const resolvedTagIds = await resolveTagIds(
      note.noteTags,
      userId,
      existingNote?.tags || [],
    )

    if (existingNote) {
      const conflict = checkConflict(finalOriginalContent, existingNote)
      if (conflict) numberOfConflicts++

      const existingNoteTagIds = (existingNote.tags || []).map(
        (t: any) => t.tagId,
      )
      const noteTagsToCreate = resolvedTagIds.filter(
        (id) => !existingNoteTagIds.includes(id),
      )

      notePromises.push(
        prisma.note.update({
          where: { id: existingNote.id },
          data: {
            hasConflict: conflict,
            originalContent: finalOriginalContent,
            editedContent: finalEditedContent,
            orderInfo: calculatedOrderInfo,
            tags: { create: noteTagsToCreate.map((tagId) => ({ tagId })) },
          },
        }),
      )
    } else {
      notePromises.push(
        prisma.note.create({
          data: {
            courseId,
            userId,
            timestamp: note.timestamp,
            section: note.section,
            lecture: note.lecture,
            originalContent: finalOriginalContent,
            editedContent: finalEditedContent,
            orderInfo: calculatedOrderInfo,
            tags: { create: resolvedTagIds.map((tagId) => ({ tagId })) },
          },
        }),
      )
    }
  }

  await Promise.all(notePromises)
  return { courseId, numberOfConflicts }
}

// #region HTML
export const importHtmlFileLogic = async (
  payload: SaveParsedCourseSchema, // Der bestätigte State aus dem Frontend
  userId: string,
) => {
  // 1. Mappe den Payload aus dem Client-State zurück in das Format für syncCourseToDatabase
  const parsedData: ParsedCourseData & { courseId?: string } = {
    courseId: payload.parsedCourse.courseId,
    title: payload.parsedCourse.courseTitle,
    description: payload.parsedCourse.courseDescription,
    courseUrl: payload.parsedCourse.courseUrl,
    imageUrl: payload.parsedCourse.imageUrl,
    trainerUrl: payload.parsedCourse.trainerUrl,
    courseTags: [], // Werden über die Meta-Daten unten verknüpft
    courseTrainers: [], // Werden über die Meta-Daten unten verknüpft
    notes: payload.parsedCourse.notes.map((note) => ({
      section: note.section,
      lecture: note.lecture,
      timestamp: note.timestamp,
      parsedContent: note.content,
      parsedOriginalContent: null, // HTML hat keine vor-editierten Notizen
      noteTags: [],
    })),
  }

  // 2. Erstelle das Meta-Daten-Objekt für den Sync-Prozess
  const importMetadata: ImportFileSchema = {
    content: '', // Inhalt wurde in Schritt 1 geparst, hier nicht mehr relevant
    fileName: payload.fileName,
    fileSize: 0,
    trainers: payload.trainers.filter((t): t is string => !!t),
    tagIds: payload.tagIds,
    newPrivateTags: payload.newPrivateTags,
    forceReplace: payload.forceReplace,
  }

  // 3. Aufruf der bestehenden, massiv getesteten Workhorse-Funktion
  return await syncCourseToDatabase(parsedData, importMetadata, userId)
}
// #endregion

// #region Markdown
export const parseMarkdownCourse = (mdContent: string): ParsedCourseData => {
  // 1. Text in Header (vor der ersten Notiz) und Notizen splitten
  const noteSplitRegex = new RegExp(
    `(?:${HTML_COMMENT_START} udemy-note-meta:\\s*\\{.*?\\}\\s*${HTML_COMMENT_END}\\s*)?^##\\s+Note`,
    'gm',
  )

  const normalizedContent = mdContent.replace(
    noteSplitRegex,
    (match) => `\n___NOTE_SPLIT___\n${match}`,
  )
  const parts = normalizedContent.split('\n___NOTE_SPLIT___\n')
  const headerContent = parts[0]
  const noteBlocks = parts.slice(1)

  // 2. Initialwerte aus dem sichtbaren Markdown (Fallbacks)
  const titleMatch = headerContent.match(/^#\s+(.+)$/m)
  let title = titleMatch ? titleMatch[1].trim() : 'Unbekannter Kurs'
  let courseId: string | undefined = undefined

  // 3. Kurs-Metadaten parsen (Die eiserne Wahrheit)
  const courseMetaRegex = new RegExp(
    `${HTML_COMMENT_START} udemy-course-meta:\\s*(\\{.*?\\})\\s*${HTML_COMMENT_END}`,
  )
  const courseMetaMatch = headerContent.match(courseMetaRegex)

  if (courseMetaMatch) {
    try {
      const meta = JSON.parse(courseMetaMatch[1])
      const { sig, ...dataWithoutSig } = meta

      // Validierung: Nur wenn die Signatur stimmt, überschreiben wir die DNA
      if (sig === generateSignature(dataWithoutSig)) {
        courseId = meta.courseId ? String(meta.courseId) : undefined
        // Philosophie: Der signierte Titel sticht den visuellen H1-Titel
        if (meta.courseTitle) {
          title = meta.courseTitle
        }
      }
    } catch (e) {
      console.error('Fehler beim Parsen der Kurs-Metadaten', e)
    }
  }

  // 4. Trainer und Tags (Unsigniert, daher direkt aus dem Markdown)
  const trainersSectionMatch = headerContent.match(
    /Trainers:\s*([\s\S]*?)(?=Tags:|##|$)/i,
  )
  let courseTrainers: string[] = []
  if (trainersSectionMatch) {
    courseTrainers = trainersSectionMatch[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('-') || line.startsWith('*'))
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
  }

  const tagsSectionMatch = headerContent.match(
    /Tags:\s*([\s\S]*?)(?=Trainers:|##|$)/i,
  )
  let courseTags: string[] = []
  if (tagsSectionMatch) {
    courseTags = tagsSectionMatch[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('-') || line.startsWith('*'))
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
  }

  // 5. Notizen parsen
  const noteMetaRegex = new RegExp(
    `${HTML_COMMENT_START} udemy-note-meta:\\s*(\\{.*?\\})\\s*${HTML_COMMENT_END}`,
  )

  const notes = noteBlocks.map((block) => {
    // Sichtbare Fallbacks aus dem Markdown
    const sectionMatch = block.match(/\*\s*Section:\s*(.+)/)
    const lectureMatch = block.match(/\*\s*Lecture:\s*(.+)/)
    const timeMatch = block.match(
      /\*\s*Timestamp:\s*(\d{1,2}:\d{2}(?::\d{2})?)/,
    )

    let section = sectionMatch ? sectionMatch[1].trim() : ''
    let lecture = lectureMatch ? lectureMatch[1].trim() : ''
    let timestamp = timeMatch ? timeMatch[1].trim() : '00:00'

    // Metadaten-Check
    const noteMetaMatch = block.match(noteMetaRegex)
    if (noteMetaMatch) {
      try {
        const meta = JSON.parse(noteMetaMatch[1])
        const { sig, ...dataWithoutSig } = meta

        // Wenn die Signatur stimmt, ignorieren wir die visuellen Änderungen
        if (sig === generateSignature(dataWithoutSig)) {
          if (meta.section) section = meta.section
          if (meta.lecture) lecture = meta.lecture
          if (meta.timestamp !== undefined) timestamp = String(meta.timestamp)
        }
      } catch (e) {
        console.error('Fehler beim Parsen der Notiz-Metadaten', e)
      }
    }

    // Content und Original Content (dürfen verändert werden)
    const contentMatch = block.match(
      /###\s+Content\s*\n([\s\S]*?)(?=####\s+Original Content|$)/i,
    )
    const originalMatch = block.match(
      /####\s+Original Content[^\n]*\n([\s\S]*)$/i,
    )

    const noteTagsMatch = block.match(/\*\s*Tags:\s*([\s\S]*?)(?=###|$)/)
    let noteTags: string[] = []
    if (noteTagsMatch) {
      noteTags = noteTagsMatch[1]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('-') || line.startsWith('*'))
        .map((line) => line.replace(/^[-*]\s*/, '').trim())
    }

    return {
      section,
      lecture,
      timestamp,
      parsedContent: contentMatch ? contentMatch[1].trim() : '',
      parsedOriginalContent: originalMatch ? originalMatch[1].trim() : null,
      noteTags,
    }
  })

  return { courseId, title, courseTags, courseTrainers, notes }
}

export const importMdFileLogic = async (
  data: ImportFileSchema,
  userId: string,
) => {
  // --- 1. Validierung ---
  if (data.fileSize > MAX_FILE_SIZE_UPLOAD) {
    throw new ServerActionError('File too large. Maximum size exceeded.')
  }

  // --- 2. Markdown parsen ---
  const parsedData = parseMarkdownCourse(data.content)

  if (parsedData.notes.length === 0) {
    throw new ServerActionError('Markdown does not contain any valid notes.')
  }

  // --- 3. Tabula Rasa (Sicherheits-Overwrite) ---
  if (data.forceReplace) {
    // Wir verlassen uns für das Überschreiben strikt auf die manipulierte ID.
    // Wer die ID fälscht und dann das Überschreiben bestätigt, überschreibt exakt diesen Kurs.
    const courseToDeleteId = parsedData.courseId
      ? String(parsedData.courseId)
      : null

    if (courseToDeleteId) {
      // Sicherheits-Check: Gehört der manipulierte Kurs überhaupt diesem User?
      const courseToOverwrite = await prisma.course.findFirst({
        where: { id: courseToDeleteId, userId },
        select: { id: true },
      })

      if (courseToOverwrite) {
        // Zur absoluten Sicherheit löschen wir zuerst die Notizen explizit
        await prisma.note.deleteMany({
          where: { courseId: courseToOverwrite.id },
        })

        // Danach löschen wir den Kurs selbst
        await prisma.course.delete({
          where: { id: courseToOverwrite.id },
        })
      }
    }
  }

  // --- 4. Synchronisation ---
  const { courseId, numberOfConflicts } = await syncCourseToDatabase(
    parsedData,
    data,
    userId,
  )

  // --- 5. Rückgabe ---
  return {
    originalFileName: data.fileName,
    size: data.fileSize,
    timestamp: Date.now(),
    markdownContent: data.content,
    numberOfConflicts,
    courseId,
  }
}
// #endregion
// #endregion
// #endregion

// #region export
/**
 * Kern-Logik für den Markdown-Export eines Kurses (Business Logic).
 * Sammelt alle Kursdaten und Notizen und generiert daraus einen formatierten Markdown-String.
 *
 * Diese Funktion ist für Unit-Tests zugänglich und unabhängig vom Request-Handling.
 */
export const exportMdFileLogic = async (
  data: ExportMdFileSchema,
  userId: string,
) => {
  const {
    courseId,
    includeNotesMetadata,
    includeNoteTags,
    includeCourseTags,
    includeTrainers,
    noteVersion,
    includeCourseDescription,
    includeCourseLinks,
  } = data

  const prismaParameters = {
    where: {
      id: courseId,
      userId: userId,
    },
    include: {
      // 1. Kurs-Tags (holt die Join-Tabelle CourseTag und inkludiert das eigentliche Tag)
      tags: includeCourseTags ? { include: { tag: true } } : false,

      // 2. Trainer (holt die Join-Tabelle CourseTrainer und inkludiert den eigentlichen Trainer)
      trainers: includeTrainers ? { include: { trainer: true } } : false,

      // 3. Notizen (immer inkludieren, aber bedingt filtern und verschachteln)
      notes: {
        where: {
          isDeleted: false,
        },
        orderBy: {
          orderInfo: 'desc',
        },
        include: {
          // Notiz-Tags (holt die Join-Tabelle NoteTag und inkludiert das eigentliche Tag)
          tags: includeNoteTags ? { include: { tag: true } } : false,
        },
      },
    },
  } satisfies Prisma.CourseFindUniqueArgs

  const course = (await prisma.course.findUnique(
    prismaParameters,
  )) as ExportCoursePayload | null

  if (!course) throw new ServerActionError('Course not found')

  // --- Markdown-Generierung ---

  // 1. Standard Kurs-Metadaten (ohne URLs)
  const courseMetaData = {
    courseId: course.id,
    courseTitle: course.title,
  }
  const courseSignature = generateSignature(courseMetaData)
  const courseMetaWithSig = { ...courseMetaData, sig: courseSignature }

  const courseMetaTag =
    HTML_COMMENT_START +
    ' udemy-course-meta: ' +
    JSON.stringify(courseMetaWithSig) +
    ' ' +
    HTML_COMMENT_END

  // 2. Neue URL-Metadaten (inkl. Trainer-Links und Kurs-Bild)
  const urlMetaData: {
    courseUrl?: string
    imageUrl?: string
    trainers?: { name: string; url?: string }[]
  } = {}

  if (includeCourseLinks) {
    if (course.courseUrl) {
      urlMetaData.courseUrl = course.courseUrl
    }
    if (course.imageUrl) {
      urlMetaData.imageUrl = course.imageUrl
    }
  }

  if (includeTrainers) {
    urlMetaData.trainers = course.trainers.map((t) => ({
      name: t.trainer.name,
      url:
        includeCourseLinks && t.trainer.profileUrl
          ? t.trainer.profileUrl
          : undefined,
    }))
  }
  const urlSignature = generateSignature(urlMetaData)
  const urlMetaWithSig = { ...urlMetaData, sig: urlSignature }

  const urlMetaTag =
    HTML_COMMENT_START +
    ' udemy-course-urls: ' +
    JSON.stringify(urlMetaWithSig) +
    ' ' +
    HTML_COMMENT_END

  // 3. Markdown zusammensetzen (Tags und Überschrift)
  let markdown = `${courseMetaTag}\n${urlMetaTag}\n`

  // H1 Überschrift: Entweder als Markdown-Link oder reiner Text
  if (course.courseUrl && includeCourseLinks) {
    markdown += `# [${course.title}](${course.courseUrl})\n\n`
  } else {
    markdown += `# ${course.title}\n\n`
  }

  // 4. Kursbeschreibung
  if (includeCourseDescription && course.description) {
    markdown += `${course.description}\n\n`
  }

  // 5. Trainer
  if (includeTrainers && course.trainers.length > 0) {
    markdown += `Trainers:\n`
    course.trainers.forEach((t) => {
      // Prüfen, ob wir die Links generieren sollen und ob eine URL vorhanden ist
      if (includeCourseLinks && t.trainer.profileUrl) {
        markdown += `* [${t.trainer.name}](${t.trainer.profileUrl})\n`
      } else if (t.trainer.name) {
        markdown += `* ${t.trainer.name}\n`
      }
    })
    markdown += '\n'
  }

  // 6. Tags
  if (includeCourseTags) {
    if (course.tags.length > 0) {
      markdown += `Tags:\n`
      course.tags.forEach((t) => {
        if (t.tag.name) markdown += `* ${t.tag.name}\n`
      })
      markdown += '\n'
    }
  }

  // 7. Notizen
  const notesMarkdownArray: string[] = []

  if (course.notes.length > 0) {
    course.notes.forEach((n) => {
      notesMarkdownArray.push(
        processNoteForMarkdown(n, {
          includeNotesMetadata,
          noteVersion,
        }),
      )
    })
    markdown += notesMarkdownArray.join('\n\n---\n\n')
  } else {
    markdown += '## Notes\n\nNo notes found...'
  }

  markdown = markdown.replace(/\n\n---\n\n$/, '')
  return { markdown }
}

// #endregion
