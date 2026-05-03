import type { Note } from '#/generated/prisma/client'
import { prisma } from '#/lib/db.server'
import type { Prisma } from '#/lib/db.server'
import { MAX_FILE_SIZE_UPLOAD } from '#/lib/constants'
import { ServerActionError } from '#/types/errors'
import { processNoteForMarkdown } from '#/lib/export-helper'
import type { ExportMdFileSchema } from '#/schemas/export-file'
import type { ImportFileSchema } from '#/schemas/import-file'
import { orderInfo } from '#/lib/udemy'
import { resolveTagIds } from '#/lib/tag-helpers.server'

// #region allgemeines
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
export const syncCourseToDatabase = async (
  parsedData: ParsedCourseData,
  data: ImportFileSchema,
  userId: string,
) => {
  // 1. Trainer verschmelzen (Formular + Markdown)
  const formTrainers = data.trainers
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  const allTrainerNames = Array.from(
    new Set([...formTrainers, ...parsedData.courseTrainers]),
  )

  // 2. Kurs laden (inklusive bestehender Verknüpfungen)
  const existingCourse = await prisma.course.findFirst({
    where: { userId, title: parsedData.title },
    include: {
      tags: { include: { tag: true } },
      trainers: { include: { trainer: true } },
    },
  })

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

  // Markdown-Tags in IDs umwandeln (und bestehende berücksichtigen)
  const resolvedParsedCourseTagIds = await resolveTagIds(
    parsedData.courseTags,
    userId,
    existingCourse?.tags || [],
  )

  // Alle IDs zusammenwerfen (Set entfernt Duplikate)
  const allCourseTagIds = Array.from(
    new Set([...formTagIds, ...resolvedParsedCourseTagIds]),
  )

  let finishedCourse
  let existingNotes: any[] | null = null

  // 4. Kurs Upsert (Delta-Logik)
  if (existingCourse) {
    existingNotes = await prisma.note.findMany({
      where: { courseId: existingCourse.id },
      include: { tags: { include: { tag: true } } },
    })

    const existingCourseTagIds = (existingCourse.tags || []).map((t) => t.tagId)
    const courseTagsToCreate = allCourseTagIds.filter(
      (id) => !existingCourseTagIds.includes(id),
    )

    const existingTrainerNames = (existingCourse.trainers || []).map(
      (t) => t.trainer.name,
    )
    const trainersToCreate = allTrainerNames.filter(
      (name) => !existingTrainerNames.includes(name),
    )

    finishedCourse = await prisma.course.update({
      where: { id: existingCourse.id },
      data: {
        title: parsedData.title,
        trainers: {
          create: trainersToCreate.map((trainerName) => ({
            trainer: {
              connectOrCreate: {
                where: { name: trainerName },
                create: { name: trainerName },
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
    finishedCourse = await prisma.course.create({
      data: {
        title: parsedData.title,
        userId,
        trainers: {
          create: allTrainerNames.map((trainerName) => ({
            trainer: {
              connectOrCreate: {
                where: { name: trainerName },
                create: { name: trainerName },
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

  // 5. Notizen-Verarbeitung (Identisch mit letztem Schritt)
  const notePromises = []
  let numberOfConflicts = 0

  for (const note of parsedData.notes) {
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
    const finalOriginalContent =
      note.parsedOriginalContent !== null
        ? note.parsedOriginalContent
        : note.parsedContent
    const finalEditedContent =
      note.parsedOriginalContent !== null ? note.parsedContent : ''

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
} // #region HTML
/**
 * Kern-Logik für den Import einer Udemy-HTML-Datei.
 *
 * @param data - Die validierten Input-Daten (HTML-String, Metadaten, Tags).
 * @param userId - ID des aktuell angemeldeten Benutzers.
 */
export const importHtmlFileLogic = async (
  data: ImportFileSchema,
  userId: string,
) => {
  const { prepareAndConvertHtmlToMarkdown } =
    await import('#/lib/convertHtmlToMarkdown')

  // --- 1. Validierung ---
  if (data.fileSize > MAX_FILE_SIZE_UPLOAD) {
    throw new ServerActionError('File too large. Maximum size exceeded.')
  }
  if (!data.content.trim().toLowerCase().startsWith('<')) {
    throw new ServerActionError('Only HTML files are allowed.')
  }

  // --- 2. HTML parsen ---
  const conversionResult = prepareAndConvertHtmlToMarkdown(data.content)
  if (conversionResult.status === 'ERROR') {
    throw new ServerActionError(conversionResult.message)
  }
  const { course, markdown } = conversionResult

  // --- 3. Auf das gemeinsame Format mappen ---
  const parsedData: ParsedCourseData = {
    title: course.title,
    courseTags: [],
    courseTrainers: [],
    notes: course.notes.map((note) => ({
      section: note.section,
      lecture: note.lecture,
      timestamp: note.timestamp,
      // Bei HTML ist das, was rauskommt, IMMER das Original von Udemy
      parsedContent: note.content,
      parsedOriginalContent: null, // HTML hat nie bereits editierten Text
      noteTags: [], // Udemy HTML hat keine Notizen-Tags
    })),
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
    markdownContent: markdown,
    numberOfConflicts,
    courseId,
  }
}
// #endregion

// #region Markdown
export const parseMarkdownCourse = (mdContent: string): ParsedCourseData => {
  // 1. Text in Header (alles vor der ersten Notiz) und Notizen splitten
  const parts = mdContent.split(/^##\s+Note/m)
  const headerContent = parts[0]
  const noteBlocks = parts.slice(1)

  // 2. Header-Informationen parsen
  const titleMatch = headerContent.match(/^#\s+(.+)$/m)
  const title = titleMatch ? titleMatch[1].trim() : 'Unbekannter Kurs'

  // Trainer extrahieren (Sucht "Trainers:" und liest alle Listen-Elemente)
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

  // Kurs-Tags extrahieren
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

  // 3. Notizen parsen (unverändert)
  const notes = noteBlocks.map((block) => {
    const sectionMatch = block.match(/\*\s*Section:\s*(.+)/)
    const lectureMatch = block.match(/\*\s*Lecture:\s*(.+)/)
    const timeMatch = block.match(
      /\*\s*Timestamp:\s*(\d{1,2}:\d{2}(?::\d{2})?)/,
    )

    const tagsSectionMatch = block.match(/\*\s*Tags:\s*([\s\S]*?)(?=###|$)/)
    let noteTags: string[] = []
    if (tagsSectionMatch) {
      noteTags = tagsSectionMatch[1]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('-') || line.startsWith('*')) // Akzeptiert - und *
        .map((line) => line.replace(/^[-*]\s*/, '').trim())
    }

    const contentMatch = block.match(
      /###\s+Content\s*\n([\s\S]*?)(?=####\s+Original Content|$)/i,
    )
    const originalMatch = block.match(
      /####\s+Original Content[^\n]*\n([\s\S]*)$/i,
    )

    return {
      section: sectionMatch ? sectionMatch[1].trim() : '',
      lecture: lectureMatch ? lectureMatch[1].trim() : '',
      timestamp: timeMatch ? timeMatch[1].trim() : '00:00',
      parsedContent: contentMatch ? contentMatch[1].trim() : '',
      parsedOriginalContent: originalMatch ? originalMatch[1].trim() : null,
      noteTags,
    }
  })

  return { title, courseTags, courseTrainers, notes }
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

  // --- 3. Synchronisation ---
  const { courseId, numberOfConflicts } = await syncCourseToDatabase(
    parsedData,
    data,
    userId,
  )

  // --- 4. Rückgabe ---
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
  const { prisma } = await import('#/lib/db.server')
  const {
    courseId,
    includeNotesMetadata,
    includeNoteTags,
    includeCourseTags,
    includeTrainers,
    noteVersion,
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
  let markdown = `# ${course.title}\n\n`

  if (includeTrainers && course.trainers.length > 0) {
    markdown += `Trainers:\n`
    course.trainers.forEach((t) => {
      if (t.trainer.name) markdown += `* ${t.trainer.name}\n`
    })
    markdown += '\n'
  }

  if (includeCourseTags) {
    if (course.tags.length > 0) {
      markdown += `Tags:\n`
      course.tags.forEach((t) => {
        if (t.tag.name) markdown += `* ${t.tag.name}\n`
      })
      markdown += '\n'
    }
  }

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
