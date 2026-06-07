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
  AnalyzeHtmlResponseSchema,
  ExtractedCourseMetadata,
  ImportFileSchema,
  SaveParsedCourseSchema,
} from '#/schemas/import-file.schema'
import { orderInfo } from '#/lib/udemy.lib'
import { resolveTagIds } from '#/lib/tag-helpers.lib.server'
import { UDEMY_SELECTORS } from '#/lib/constants.lib.server'
import { prepareAndConvertHtmlToMarkdown } from '#/lib/convertHtmlToMarkdown.lib'
import { getVisualCourseTitle } from '#/lib/utils.lib'
// import { imageUploadHandler$ } from '@mdxeditor/editor'

// #region allgemeines
export type IntegrityStatus =
  | 'INTEGRITY_OK'
  | 'INTEGRITY_MISMATCH'
  | 'NO_METADATA'

export interface CheckImportResult {
  status: IntegrityStatus
  totalNotes: number
  courseTitle: string
  udemyCourseId?: string
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
  udemyCourseId?: string
  description?: string
  courseUrl?: string
  imageUrl?: string
  trainerUrl?: string
  extractedInstructors?: ExtractedCourseMetadata['instructors']
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
/**
 * Führt eine Integritätsprüfung für eine Markdown-Importdatei durch.
 *
 * Die Funktion prüft:
 * 1. Ob die erforderlichen Metadaten (udemy-course-meta) vorhanden sind.
 * 2. Ob die kryptografischen Signaturen (`sig`) der Metadaten mit dem Inhalt übereinstimmen.
 * 3. Ob die visuell lesbaren Header (H1, Kurs-Sektionen) mit den versteckten Metadaten kongruent sind.
 *
 * Dies verhindert den Import von manuell manipulierten Dateien, die zu Datenkorruption
 * in der Datenbank führen könnten.
 *
 * @param mdContent - Der rohe Textinhalt der Markdown-Datei.
 * @returns Ein Objekt mit dem `status` (OK, Mismatch, No Metadata), der Anzahl der Notizen
 *          und dem extrahierten Kurstitel.
 */
export const checkImportFileLogic = (mdContent: string): CheckImportResult => {
  let status: IntegrityStatus = 'NO_METADATA'

  // 1. Text splitten (identisch zum Parser)
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

  // FIX: Visuellen Titel aus der H1 auslesen und eventuelle Markdown-Links bereinigen
  let courseTitle = 'Unbekannter Kurs'
  const visualCourseTitle = getVisualCourseTitle(headerContent)

  if (courseMetaMatch) {
    status = 'INTEGRITY_OK'
    try {
      const meta = JSON.parse(courseMetaMatch[1])
      const { sig, ...dataWithoutSig } = meta
      courseTitle = meta.courseTitle

      // Check A: Wurde die Signatur im JSON gebrochen?
      // (generateSignature nutzt jetzt intern normalizeObject)
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
    courseTitle = visualCourseTitle || 'Unbekannter Kurs'
  }

  // --- 3. Notiz-Level prüfen ---
  const noteMetaRegex = new RegExp(
    `${HTML_COMMENT_START} udemy-note-meta:\\s*(\\{.*?\\})\\s*${HTML_COMMENT_END}`,
  )

  for (const block of noteBlocks) {
    const noteMetaMatch = block.match(noteMetaRegex)

    if (noteMetaMatch) {
      status = 'INTEGRITY_OK'
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

        // Check B: Kongruenz-Prüfung
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

/**
 * Analysiert den HTML-Inhalt eines Udemy-Kurs-Payloads vor dem eigentlichen Import.
 *
 * Schritte:
 * 1. Konvertierung des HTML in Markdown unter Verwendung der definierten CSS-Selektoren.
 * 2. Daten-Merge: Überschreiben von ungenauen Scraping-Daten mit präzisen JSON-Metadaten (Beta-Format).
 * 3. Prüfung, ob der Trainer des Kurses bereits global in der Datenbank existiert.
 * 4. Ermittlung, wie viele Kurse der aktuelle Benutzer bereits von diesem Trainer besitzt.
 */
export const analyzeHtmlPayloadLogic = async (
  data: AnalyzeHtmlPayloadSchema,
  userId: string,
): Promise<AnalyzeHtmlResponseSchema> => {
  const conversionResult = prepareAndConvertHtmlToMarkdown(
    data.content,
    UDEMY_SELECTORS,
    data.format,
  )

  if (conversionResult.status === 'ERROR') {
    throw new ServerActionError(
      conversionResult.message || 'Error parsing HTML',
    )
  }

  const { course } = conversionResult

  // ==========================================
  // 🟢 SCHRITT 1: Daten-Merge (Metadaten schlagen DOM-Scraping)
  // ==========================================
  if (data.courseMetadata) {
    const { courseMetadata } = data

    // Die echte Udemy-ID für spätere Kurs-Aktualisierungen (Deduplizierung)
    if (courseMetadata.udemyCourseId) {
      // Da wir in `ImportCourse` evtl. noch kein `courseId` haben,
      // übergeben wir es direkt weiter unten ins Return-Objekt
    }

    if (courseMetadata.courseTitle) {
      // Der echte Titel aus der API (ohne lästige "Course: " Präfixe)
      course.title = courseMetadata.courseTitle
    }

    if (courseMetadata.images?.px480x270) {
      // Hochauflösendes Bild direkt aus den Metadaten übernehmen
      course.imageUrl = courseMetadata.images.px480x270
    }
  }

  // ==========================================
  // 🟢 SCHRITT 2: Trainer-Logik (mit Beta-Support)
  // ==========================================
  let knownTrainer = false
  let relatedCoursesCount = 0
  let matchedTrainerName: string | undefined = undefined

  // Wir nutzen primär die URL des ERSTEN Trainers aus den Metadaten (Beta),
  // mit Fallback auf die geparste URL aus dem Legacy-Format.
  const primaryTrainerUrl =
    data.courseMetadata?.instructors?.[0]?.url || data.parsedTrainerUrl

  if (primaryTrainerUrl) {
    // 1. Zuerst prüfen: Existiert die URL global in der Trainer-Tabelle?
    const existingTrainer = await prisma.trainer.findUnique({
      where: { profileUrl: primaryTrainerUrl },
      select: { name: true },
    })

    if (existingTrainer) {
      // Trainer existiert global! Wir merken uns den Namen für das GUI.
      knownTrainer = true
      matchedTrainerName = existingTrainer.name

      // 2. Dann prüfen: Wie viele Kurse hat DIESER User schon mit diesem Trainer?
      relatedCoursesCount = await prisma.course.count({
        where: {
          userId: userId,
          trainers: {
            some: {
              trainer: {
                profileUrl: primaryTrainerUrl,
              },
            },
          },
        },
      })
    }
  }

  return {
    parsedCourse: {
      udemyCourseId: data.courseMetadata?.udemyCourseId, // NEU: Wir schleifen die ID durch!
      courseTitle: course.title,
      courseDescription: course.description,
      courseUrl: course.courseUrl,
      imageUrl: course.imageUrl,
      trainerUrl: primaryTrainerUrl, // NEU: Aktualisierte Trainer-URL
      extractedInstructors: data.courseMetadata?.instructors,
      notes: course.notes.map((note: any) => ({
        section: note.section,
        lecture: note.lecture,
        timestamp: note.timestamp,
        content: note.content,
      })),
      notesCount: course.notes.length,
    },
    trainerMatch: {
      url: primaryTrainerUrl,
      isKnown: knownTrainer,
      existingCoursesCount: relatedCoursesCount,
      nameInDb: matchedTrainerName,
    },
  }
}

/**
 * Die zentrale "Workhorse"-Funktion zur Synchronisation von Kursdaten mit der Datenbank.
 *
 * Diese Funktion nutzt eine interaktive Prisma-Transaktion, um atomar:
 * 1. Trainer-Daten abzugleichen: Bevorzugt hochpräzise Beta-Metadaten, Fallback auf Legacy-URL-Check.
 * 2. Den Kurs per "Eisernem DNA-Check" (interne ID -> Udemy ID -> Titel) zu finden oder zu erstellen.
 * 3. Kurs-Tags und neu erstellte private Tags zu verschmelzen.
 * 4. Notizen zu verarbeiten: Existierende Notizen werden aktualisiert (inkl. Konflikterkennung).
 * 5. Tags auf Notiz-Ebene zu synchronisieren.
 *
 * @param parsedData - Die aus der Datei extrahierten strukturierten Daten (inkl. neuer Beta-Felder).
 * @param data - Die Metadaten aus dem Import-Formular (Trainer-Auswahl, Tag-IDs).
 * @param userId - Die ID des Benutzers, dem der Kurs zugeordnet wird.
 * @returns Ein Promise mit der `courseId` und der Anzahl der erkannten Inhaltskonflikte.
 * @internal
 */
export const syncCourseToDatabase = async (
  parsedData: ParsedCourseData,
  data: ImportFileSchema,
  userId: string,
) => {
  console.log('syncCourseToDatabase,parsedData:', parsedData)
  return await prisma.$transaction(
    async (tx) => {
      // ==========================================
      // 1. TRAINER LOGIK (Beta vs. Legacy)
      // ==========================================
      const trainerIdsToConnect: string[] = []

      if (
        parsedData.extractedInstructors &&
        parsedData.extractedInstructors.length > 0
      ) {
        // 🟢 NEUES BETA-FORMAT: Wir haben perfekte Daten, also direkt Upsert!
        for (const inst of parsedData.extractedInstructors) {
          const upsertedTrainer = await tx.trainer.upsert({
            // Wenn eine URL existiert, ist sie der sicherste Identifikator, sonst der Name
            where: inst.url ? { profileUrl: inst.url } : { name: inst.name },
            update: {
              name: inst.name, // Falls der Trainer umbenannt wurde
              imageUrl: inst.image && inst.image,
              ...(inst.url && { profileUrl: inst.url }), // Falls er vorher keine URL hatte
              ...(inst.image && { imageUrl: inst.image }),
            },
            create: {
              name: inst.name,
              profileUrl: inst.url,
              imageUrl: inst.image,
            },
          })
          trainerIdsToConnect.push(upsertedTrainer.id)
        }
      } else {
        // 🟠 ALTES LEGACY-FORMAT (oder Markdown-Import): Die bekannte Logik
        const formTrainers = data.trainers
          .filter((t): t is string => typeof t === 'string')
          .map((t) => t.trim())
          .filter((t) => t.length > 0)

        let allTrainerNames = Array.from(
          new Set([...formTrainers, ...parsedData.courseTrainers]),
        )

        let finalTrainerUrl: string | undefined = undefined

        if (parsedData.trainerUrl) {
          const existingTrainerByUrl = await tx.trainer.findUnique({
            where: { profileUrl: parsedData.trainerUrl },
            select: { name: true },
          })

          if (existingTrainerByUrl) {
            // TEST 8: URL gehört wem anders -> Strikte Überschreibung aller Eingaben
            allTrainerNames = [existingTrainerByUrl.name]
          } else {
            finalTrainerUrl = parsedData.trainerUrl

            const dbTrainers = await tx.trainer.findMany({
              where: { name: { in: allTrainerNames } },
              select: { name: true, profileUrl: true },
            })

            const knownNames = dbTrainers.map((t) => t.name)
            const newNames = allTrainerNames.filter(
              (n) => !knownNames.includes(n),
            )
            const existingWithoutUrl = dbTrainers.filter((t) => !t.profileUrl)

            const unmappedCount = newNames.length + existingWithoutUrl.length

            if (unmappedCount === 1) {
              if (existingWithoutUrl.length === 1) {
                // TEST 6 & 7: Genau ein bestehender Trainer ohne URL -> gezieltes Update
                await tx.trainer.update({
                  where: { name: existingWithoutUrl[0].name },
                  data: { profileUrl: finalTrainerUrl },
                })
              }
            } else {
              finalTrainerUrl = undefined
            }
          }
        }

        // Legacy-Trainer anlegen / referenzieren
        for (const trainerName of allTrainerNames) {
          const upsertedTrainer = await tx.trainer.upsert({
            where: { name: trainerName },
            update: {}, // Nichts überschreiben, wenn er nur über den Namen gefunden wurde
            create: {
              name: trainerName,
              profileUrl: finalTrainerUrl,
            },
          })
          trainerIdsToConnect.push(upsertedTrainer.id)
        }
      }

      // ==========================================
      // 2. KURS LADEN ("Eiserner DNA-Check")
      // ==========================================
      let existingCourse = null

      if (parsedData.courseId) {
        // 1. Check: Explizite interne ID (User hat einen bestehenden Kurs im UI zum Überschreiben gewählt)
        existingCourse = await tx.course.findFirst({
          where: { id: parsedData.courseId, userId },
          include: {
            tags: { include: { tag: true } },
            trainers: true, // Wir brauchen nur die Relation für den Abgleich
          },
        })
      } else if (parsedData.udemyCourseId) {
        // 2. Check: Udemy Course ID (NEU - Erkennt Duplikate auch wenn der Titel auf Udemy geändert wurde)
        existingCourse = await tx.course.findUnique({
          where: {
            userId_udemyCourseId: {
              userId: userId,
              udemyCourseId: parsedData.udemyCourseId,
            },
          },
          include: {
            tags: { include: { tag: true } },
            trainers: true,
          },
        })
      }

      if (!existingCourse) {
        // 3. Check: Legacy Fallback auf Titel (für alte HTMLs oder Markdown)
        existingCourse = await tx.course.findFirst({
          where: { userId, title: parsedData.title },
          include: {
            tags: { include: { tag: true } },
            trainers: true,
          },
        })
      }

      // ==========================================
      // 3. KURS-TAGS VERSCHMELZEN
      // ==========================================
      let formTagIds = [...data.tagIds]
      if (data.newPrivateTags.length > 0) {
        const createdTags = await Promise.all(
          data.newPrivateTags.map((name) =>
            tx.tag.create({
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
        tx,
      )

      const allCourseTagIds = Array.from(
        new Set([...formTagIds, ...resolvedParsedCourseTagIds]),
      )

      // ==========================================
      // 4. KURS UPSERT
      // ==========================================
      let finishedCourse
      let existingNotes: any[] | null = null

      if (existingCourse) {
        // --- UPDATE EXISTIERENDER KURS ---
        existingNotes = await tx.note.findMany({
          where: { courseId: existingCourse.id },
          include: { tags: { include: { tag: true } } },
        })

        const existingCourseTagIds = existingCourse.tags.map((t) => t.tagId)
        const courseTagsToCreate = allCourseTagIds.filter(
          (id) => !existingCourseTagIds.includes(id),
        )

        const existingTrainerIds = existingCourse.trainers.map(
          (t) => t.trainerId,
        )
        const trainersToCreate = trainerIdsToConnect.filter(
          (id) => !existingTrainerIds.includes(id),
        )

        finishedCourse = await tx.course.update({
          where: { id: existingCourse.id },
          data: {
            title: parsedData.title,
            udemyCourseId: parsedData.udemyCourseId, // Speichert die ID (wichtig falls sie bei alten Kursen fehlte!)
            description: parsedData.description,
            courseUrl: parsedData.courseUrl,
            imageUrl: parsedData.imageUrl,
            trainerUrl: parsedData.trainerUrl,
            trainers: {
              create: trainersToCreate.map((id) => ({
                trainer: { connect: { id } },
              })),
            },
            tags: {
              create: courseTagsToCreate.map((tagId) => ({ tagId })),
            },
          },
        })
      } else {
        // --- CREATE NEUER KURS ---
        finishedCourse = await tx.course.create({
          data: {
            title: parsedData.title,
            udemyCourseId: parsedData.udemyCourseId, // Neue Udemy ID speichern
            description: parsedData.description,
            courseUrl: parsedData.courseUrl,
            imageUrl: parsedData.imageUrl,
            trainerUrl: parsedData.trainerUrl,
            userId,
            trainers: {
              create: trainerIdsToConnect.map((id) => ({
                trainer: { connect: { id } },
              })),
            },
            tags: {
              create: allCourseTagIds.map((tagId) => ({ tagId })),
            },
          },
        })
      }

      const courseId = finishedCourse.id

      // ==========================================
      // 5. NOTIZEN-VERARBEITUNG (Keine Änderungen nötig)
      // ==========================================
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
          tx,
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
            tx.note.update({
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
            tx.note.create({
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
    },
    {
      maxWait: 5000,
      timeout: 20000,
    },
  )
}

// #region HTML
/**
 * Implementiert die Logik für den Import einer Udemy-HTML-Datei.
 *
 * Mappt den flachen UI-State des Import-Dialogs zurück in das interne
 * `ParsedCourseData` Format und delegiert die eigentliche Speicherung an
 * `syncCourseToDatabase`.
 *
 * @param payload - Der vom Benutzer bestätigte Import-Zustand.
 * @param userId - Die ID des Benutzers.
 * @returns Das Ergebnis der Synchronisation (IDs und Konfliktstatistik).
 */
export const importHtmlFileLogic = async (
  payload: SaveParsedCourseSchema, // Der bestätigte State aus dem Frontend
  userId: string,
) => {
  console.log('importHtmlFileLogic,payload:', payload)
  // 1. Mappe den Payload aus dem Client-State zurück in das Format für syncCourseToDatabase
  const parsedData: ParsedCourseData = {
    udemyCourseId: payload.parsedCourse.udemyCourseId,
    title: payload.parsedCourse.courseTitle,
    description: payload.parsedCourse.courseDescription,
    courseUrl: payload.parsedCourse.courseUrl,
    imageUrl: payload.parsedCourse.imageUrl,
    trainerUrl: payload.parsedCourse.trainerUrl,
    extractedInstructors: payload.parsedCourse.extractedInstructors,
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
/**
 * Zerlegt einen Markdown-String in ein strukturiertes Kurs-Objekt.
 *
 * Nutzt Regex-Parsing, um:
 * - Kurs- und URL-Metadaten aus HTML-Kommentaren zu extrahieren.
 * - Die Kursbeschreibung sowie Trainer- und Tag-Listen zu identifizieren.
 * - Einzelne Notiz-Blöcke inklusive ihrer Metadaten und Inhalts-Sektionen zu parsen.
 *
 * @param mdContent - Der Inhalt der Markdown-Datei.
 * @returns Ein strukturiertes `ParsedCourseData` Objekt.
 */
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
  let title = getVisualCourseTitle(headerContent)

  let courseId: string | undefined = undefined
  let description: string | undefined = undefined
  let courseUrl: string | undefined = undefined
  let imageUrl: string | undefined = undefined
  let trainerUrl: string | undefined = undefined

  // 3a. Kurs-Metadaten parsen (IDs und Titel)
  const courseMetaRegex = new RegExp(
    `${HTML_COMMENT_START} udemy-course-meta:\\s*(\\{.*?\\})\\s*${HTML_COMMENT_END}`,
  )
  const courseMetaMatch = headerContent.match(courseMetaRegex)

  if (courseMetaMatch) {
    try {
      const meta = JSON.parse(courseMetaMatch[1])
      const { sig, ...dataWithoutSig } = meta

      if (sig === generateSignature(dataWithoutSig)) {
        courseId = meta.courseId ? String(meta.courseId) : undefined
        if (meta.courseTitle) title = meta.courseTitle
      } else {
        console.warn('Signature verification failed for udemy-course-meta')
      }
    } catch (e) {
      console.error('Error parsing course metadata', e)
    }
  }

  // 3b. Kurs-URLs parsen (NEUER BLOCK)
  const courseUrlsRegex = new RegExp(
    `${HTML_COMMENT_START} udemy-course-urls:\\s*(\\{.*?\\})\\s*${HTML_COMMENT_END}`,
  )
  const courseUrlsMatch = headerContent.match(courseUrlsRegex)

  if (courseUrlsMatch) {
    try {
      const meta = JSON.parse(courseUrlsMatch[1])
      const { sig, ...dataWithoutSig } = meta

      if (sig === generateSignature(dataWithoutSig)) {
        if (meta.courseUrl) courseUrl = meta.courseUrl
        if (meta.imageUrl) imageUrl = meta.imageUrl

        // Die URL des ersten Trainers als Datenbank-Zuordnung nutzen
        if (
          meta.trainers &&
          Array.isArray(meta.trainers) &&
          meta.trainers.length > 0
        ) {
          trainerUrl = meta.trainers[0].url
        }
      } else {
        console.warn('Signature verification failed for udemy-course-urls')
      }
    } catch (e) {
      console.error('Error parsing course URLs', e)
    }
  }

  // 4. Description extrahieren (Editierbarer Bereich im Markdown)
  let textForDescription = headerContent
  // Die komplette H1-Zeile entfernen, da titleMatch ausgelagert wurde
  textForDescription = textForDescription.replace(/^#\s+.*$/m, '')

  if (courseMetaMatch)
    textForDescription = textForDescription.replace(courseMetaMatch[0], '')
  if (courseUrlsMatch)
    textForDescription = textForDescription.replace(courseUrlsMatch[0], '')

  // Alles was vor "Trainers:" steht, ist die Description
  const descriptionMatch = textForDescription.match(
    /^\s*([\s\S]*?)(?=Trainers:|$)/i,
  )
  if (descriptionMatch && descriptionMatch[1].trim() !== '') {
    description = descriptionMatch[1].trim()
  }

  // 5. Trainer und Tags (Unsigniert, direkt aus dem Markdown)
  const trainersSectionMatch = headerContent.match(
    /Trainers:\s*([\s\S]*?)(?=Tags:|$)/i,
  )
  let courseTrainers: string[] = []
  if (trainersSectionMatch) {
    courseTrainers = trainersSectionMatch[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('-') || line.startsWith('*'))
      .map((line) => {
        // Falls der Trainer ein Link ist e.g. * [Name](Url), holen wir nur den Namen
        const cleanLine = line.replace(/^[-*]\s*/, '').trim()
        const linkMatch = cleanLine.match(/\[([^\]]+)\]/)
        return linkMatch ? linkMatch[1] : cleanLine
      })
  }

  // Tags laufen vom "Tags:" Keyword bis zum nächsten Metadaten-Block oder Dateiende
  const tagsSectionMatch = headerContent.match(/Tags:\s*([\s\S]*?)(?=<!--|$)/i)
  let courseTags: string[] = []
  if (tagsSectionMatch) {
    courseTags = tagsSectionMatch[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('-') || line.startsWith('*'))
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter((tag) => tag.toLowerCase() !== 'no tags') // Fix: "no tags" ignorieren
  }

  // 6. Notizen parsen
  const noteMetaRegex = new RegExp(
    `${HTML_COMMENT_START} udemy-note-meta:\\s*(\\{.*?\\})\\s*${HTML_COMMENT_END}`,
  )

  const notes = noteBlocks.map((block) => {
    // Sichtbare Fallbacks
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

        if (sig === generateSignature(dataWithoutSig)) {
          if (meta.section) section = meta.section
          if (meta.lecture) lecture = meta.lecture
          if (meta.timestamp !== undefined) timestamp = String(meta.timestamp)
        }
      } catch (e) {
        console.error('Error parsing note metadata', e)
      }
    }

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
        .filter((tag) => tag.toLowerCase() !== 'no tags') // Fix: "no tags" ignorieren
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

  return {
    title,
    courseId,
    description,
    courseUrl,
    imageUrl,
    trainerUrl,
    courseTags,
    courseTrainers,
    notes,
  }
}

/**
 * Implementiert die Logik für den Import einer Markdown-Datei.
 *
 * Ablauf:
 * 1. Validierung der Dateigröße.
 * 2. Parsing des Markdowns in strukturierte Daten.
 * 3. Optional: "Tabula Rasa" Modus, bei dem ein existierender Kurs vor dem Re-Import
 *    gelöscht wird (basierend auf der ID in den Metadaten).
 * 4. Aufruf der Synchronisations-Logik.
 *
 * @param data - Enthält den Dateiinhalt und Flags (wie `forceReplace`).
 * @param userId - Die ID des Benutzers.
 * @returns Details zum Import-Vorgang für die Erfolgsmeldung im Frontend.
 * @throws ServerActionError bei zu großen Dateien oder ungültigem Inhalt.
 */
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
