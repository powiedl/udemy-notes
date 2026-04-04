// import fs from 'node:fs'
// import path from 'node:path'
import { prepareAndConvertHtmlToMarkdown } from '#/lib/convertHtmlToMarkdown' // Your existing function
import { createServerFn } from '@tanstack/react-start'
import { MAX_FILE_SIZE_UPLOAD } from '#/lib/constants'
import { authFnMiddleware } from '#/middlewares/auth'
import { prisma } from '#/db'
import { Course, Note } from '#/generated/prisma/client'
import { ImportNote } from '#/types/course'
import { orderInfo } from '#/lib/udemy'
import { exportMdFileSchema } from '#/schemas/export-file'
import { notFound } from '@tanstack/react-router'
import { processNoteForMarkdown } from '#/lib/export-helper'
import { wrapServerAction } from '#/lib/server-utils'
import { withLogging } from '#/schemas/api-utils'
import { UdNoServerResponse } from '#/types/api'

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
export const importHtmlFile = createServerFn({ method: 'POST' })
  .middleware([authFnMiddleware])
  .inputValidator(async (data: unknown) => {
    // 1. Grundprüfung auf FormData
    if (!(data instanceof FormData)) {
      throw new Error('Expected FormData')
    }

    // 2. Datei extrahieren & validieren (wie bisher)
    const file = data.get('file') as File
    if (!file || file.type !== 'text/html') {
      throw new Error('Only HTML files are allowed.')
    }
    if (file.size > /*1000 */ MAX_FILE_SIZE_UPLOAD) {
      throw new Error('File too large.')
    }

    // 3. NEU: loggingMetadata aus FormData extrahieren
    // Wir schicken es vom Client als JSON-String im Feld 'loggingMetadata'
    const rawLogging = data.get('loggingMetadata')
    let loggingMetadata

    if (rawLogging && typeof rawLogging === 'string') {
      try {
        loggingMetadata = JSON.parse(rawLogging)
      } catch (e) {
        // Falls JSON-Parse fehlschlägt, ignorieren wir es oder setzen Default
      }
    }

    // Wir geben die Struktur zurück, die unser Handler erwartet
    return {
      file,
      loggingMetadata, // Damit data.loggingMetadata im Handler existiert
    }
  })
  .handler(async ({ data, context }) => {
    return await wrapServerAction(
      'importHtmlFile',
      async () => {
        const userId = context.session.user.id
        const { file } = data
        const timestamp = Date.now()

        // --- DEINE BESTEHENDE LOGIK (Buffer, Prisma, etc.) ---
        const buffer = Buffer.from(await file.arrayBuffer())
        const htmlContent = buffer.toString('utf8')
        const conversionResult = prepareAndConvertHtmlToMarkdown(htmlContent)

        if (conversionResult.status === 'ERROR')
          throw new Error(conversionResult.message)
        const { course, markdown } = conversionResult

        const existingCourse = await prisma.course.findFirst({
          where: { userId: userId, title: course.title },
        })
        let finishedCourse: Course
        let existingNotes
        let courseId: string
        if (existingCourse) {
          courseId = existingCourse.id
          existingNotes = await prisma.note.findMany({
            where: { courseId: existingCourse.id },
          })
          finishedCourse = await prisma.course.update({
            where: {
              id: existingCourse.id,
            },
            data: {
              title: course.title,
            },
          })
        } else {
          finishedCourse = await prisma.course.create({
            data: {
              title: course.title,
              userId: userId,
            },
          })
          courseId = finishedCourse.id
        }
        const createdNotes = []
        let numberOfConflicts = 0
        for (let note of course.notes) {
          const existingNote =
            existingNotes &&
            existingNotes.find(
              (n) =>
                n.timestamp === note.timestamp &&
                n.section === note.section &&
                n.lecture === note.lecture,
            )
          if (existingNote) {
            const conflict = checkConflict(note, existingNote)
            if (conflict) numberOfConflicts++
            createdNotes.push(
              prisma.note.update({
                where: { id: existingNote.id },
                data: {
                  hasConflict: conflict,
                  originalContent: note.content,
                  orderInfo: orderInfo(
                    note.section,
                    note.lecture,
                    note.timestamp,
                  ),
                },
              }),
            )
          } else {
            createdNotes.push(
              prisma.note.create({
                data: {
                  courseId: finishedCourse.id,
                  userId,
                  timestamp: note.timestamp,
                  section: note.section,
                  lecture: note.lecture,
                  originalContent: note.content,
                  orderInfo: orderInfo(
                    note.section,
                    note.lecture,
                    note.timestamp,
                  ),
                },
              }),
            )
          }
        }
        await Promise.all(createdNotes)
        return {
          originalFileName: file.name,
          size: file.size,
          timestamp,
          markdownContent: markdown,
          numberOfConflicts,
          courseId,
        }
      },
      data.loggingMetadata?.component,
    )
  })

export const exportMdFile = createServerFn({ method: 'POST' })
  .middleware([authFnMiddleware])
  .inputValidator((d: unknown) => withLogging(exportMdFileSchema).parse(d))
  .handler(async ({ data, context }) => {
    let markdown =
      '# Mein Kurs\n\n## Metadaten\n\nTags:\n\n* Javascript\n* HTML'
    const { courseId, includeNotesMetadata, includeTags, includeOriginalNote } =
      data

    const response = await wrapServerAction(
      'exportMdFile',
      async () => {
        const userId = context.session.user.id
        const course = await prisma.course.findUnique({
          where: {
            id: courseId,
            userId: userId, // Sicherstellen, dass der Kurs dem User gehört
          },
          include: {
            // 1. Tags des Kurses selbst laden
            tags: {
              include: {
                tag: true,
              },
            },
            // 2. Notizen laden
            notes: {
              where: {
                isDeleted: false, // Optional: Nur nicht gelöschte Notizen laden
              },
              orderBy: {
                orderInfo: 'desc', // Wie gewünscht absteigend sortiert
              },
              include: {
                // 3. Tags der jeweiligen Notiz laden
                tags: {
                  include: {
                    tag: true,
                  },
                },
              },
            },
          },
        })
        if (!course) throw notFound()
        // title of the course
        markdown = `# ${course.title}\n\n`
        // course tags
        if (includeTags) {
          if (course.tags.length > 0) {
            markdown += `Tags:\n\n`
            course.tags.map((t) => {
              if (t.tag.name) markdown += `* ${t.tag.name}`
            })
          }
        }

        //notes
        const notesMarkdownArray: string[] = []

        if (course.notes.length > 0) {
          course.notes.map((n) => {
            notesMarkdownArray.push(
              processNoteForMarkdown(n, {
                includeNotesMetadata,
                includeOriginalNote,
              }),
            )
          })
          markdown += notesMarkdownArray.join('\n\n---\n\n')
        } else {
          markdown += '## Notes\n\nNo notes found...'
        }
        markdown = markdown.replace(/\n\n---\n\n$/, '') // remove the last seperator after the last note (it is not needed)
        // because strings in Javascript are immutable, so we need to reassign the result of the replacement to the original variable

        return { markdown }
      },
      data.loggingMetadata?.component,
    )
    return response
  })
