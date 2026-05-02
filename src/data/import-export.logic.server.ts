import type { Course, Note, Prisma } from '#/generated/prisma/client'
import type { ImportNote } from '#/types/course'
import { MAX_FILE_SIZE_UPLOAD } from '#/lib/constants'
import { ServerActionError } from '#/types/errors'
import { processNoteForMarkdown } from '#/lib/export-helper'
import type { ExportMdFileSchema } from '#/schemas/export-file'
import type { ImportHtmlFileSchema } from '#/schemas/import-file'
import { orderInfo } from '#/lib/udemy'

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

/**
 * Prüft, ob eine neue Notiz von Udemy im Konflikt mit einer lokal bearbeiteten Notiz steht.
 *
 * Ein Konflikt entsteht, wenn:
 * 1. Der neue Inhalt sich vom gespeicherten Original unterscheidet (Änderung auf Udemy).
 * 2. Lokal bereits manuell Änderungen im `editedContent` vorgenommen wurden.
 */
function checkConflict(
  newNote: ImportNote,
  existingNote: Pick<Note, 'originalContent' | 'editedContent'>,
): boolean {
  if (newNote.content === existingNote.originalContent) return false // der neue Content und der Originalcontent sind gleich - es kann kein Konflikt sein

  // der Content auf Udemy hat sich verändert ...
  const hasConflict =
    existingNote.editedContent !== '' &&
    existingNote.editedContent.trim() !== '' // und es gibt auch einen editedContent --> Konflikt
  return hasConflict
}

/**
 * Kern-Logik für den Import einer Udemy-HTML-Datei.
 *
 * @param data - Die validierten Input-Daten (HTML-String, Metadaten, Tags).
 * @param userId - ID des aktuell angemeldeten Benutzers.
 */
export const importHtmlFileLogic = async (
  data: ImportHtmlFileSchema,
  userId: string,
) => {
  const { prisma } = await import('#/lib/db.server')
  const { prepareAndConvertHtmlToMarkdown } =
    await import('#/lib/convertHtmlToMarkdown')
  // const { orderInfo } = await import('#/lib/udemy')

  const { htmlContent, fileName, fileSize, trainers, tagIds, newPrivateTags } =
    data

  // --- 1. Validierung (Sicherheit & Integrität) ---
  if (fileSize > MAX_FILE_SIZE_UPLOAD) {
    throw new ServerActionError('File too large. Maximum size exceeded.')
  }
  if (!htmlContent.trim().toLowerCase().startsWith('<')) {
    throw new ServerActionError('Only HTML files are allowed.')
  }

  const timestamp = Date.now()

  // 2. HTML zu Markdown konvertieren
  const conversionResult = prepareAndConvertHtmlToMarkdown(htmlContent)
  if (conversionResult.status === 'ERROR') {
    throw new ServerActionError(conversionResult.message)
  }

  const { course, markdown } = conversionResult

  // --- 3. Tag-Management ---
  let finalTagIds = [...tagIds]
  if (newPrivateTags.length > 0) {
    const createdTags = await Promise.all(
      newPrivateTags.map((name) =>
        prisma.tag.create({
          data: { name, userId },
          select: { id: true },
        }),
      ),
    )
    finalTagIds = [...finalTagIds, ...createdTags.map((t) => t.id)]
  }

  const validTrainers = trainers
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  // --- 4. Kurs-Synchronisation (Upsert) ---
  const existingCourse = await prisma.course.findFirst({
    where: { userId, title: course.title },
  })

  let finishedCourse: Course
  let existingNotes = null

  if (existingCourse) {
    existingNotes = await prisma.note.findMany({
      where: { courseId: existingCourse.id },
    })

    finishedCourse = await prisma.course.update({
      where: { id: existingCourse.id },
      data: {
        title: course.title,
        // Neue Trainer-Logik für UPDATE
        trainers: {
          deleteMany: {}, // 1. Alte Verknüpfungen kappen
          create: validTrainers.map((trainerName) => ({
            // 2. Neue Verknüpfungen setzen
            trainer: {
              connectOrCreate: {
                where: { name: trainerName },
                create: { name: trainerName },
              },
            },
          })),
        },
        tags: {
          deleteMany: {},
          create: finalTagIds.map((tagId) => ({ tagId })),
        },
      },
    })
  } else {
    // Neue Trainer-Logik für CREATE
    finishedCourse = await prisma.course.create({
      data: {
        title: course.title,
        userId,
        trainers: {
          create: validTrainers.map((trainerName) => ({
            trainer: {
              connectOrCreate: {
                where: { name: trainerName },
                create: { name: trainerName },
              },
            },
          })),
        },
        tags: {
          create: finalTagIds.map((tagId) => ({ tagId })),
        },
      },
    })
  }

  const courseId = finishedCourse.id
  // --- 5. Notizen-Verarbeitung ---
  const notePromises = []
  let numberOfConflicts = 0

  for (const note of course.notes) {
    const existingNote =
      existingNotes &&
      existingNotes.find(
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

    if (existingNote) {
      const conflict = checkConflict(note, existingNote)
      if (conflict) numberOfConflicts++

      notePromises.push(
        prisma.note.update({
          where: { id: existingNote.id },
          data: {
            hasConflict: conflict,
            originalContent: note.content,
            orderInfo: calculatedOrderInfo,
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
            originalContent: note.content,
            orderInfo: calculatedOrderInfo,
          },
        }),
      )
    }
  }

  await Promise.all(notePromises)

  return {
    originalFileName: fileName,
    size: fileSize,
    timestamp,
    markdownContent: markdown,
    numberOfConflicts,
    courseId,
  }
}

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
