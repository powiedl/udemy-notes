// import fs from 'node:fs'
// import path from 'node:path'
import { prepareAndConvertHtmlToMarkdown } from '#/lib/convertHtmlToMarkdown' // Your existing function
import {
  EMPTY_CLIENT_LOGGING_METADATA,
  MAX_FILE_SIZE_UPLOAD,
} from '#/lib/constants'

import { Course, Note } from '#/generated/prisma/client'
import { ImportNote } from '#/types/course'
import { orderInfo } from '#/lib/udemy'
import { exportMdFileSchema } from '#/schemas/export-file'
import { processNoteForMarkdown } from '#/lib/export-helper'
import { authFn } from '#/lib/rpc'
import { ServerActionError } from '#/types/errors'
import { withLogging, clientLoggingMetadataSchema } from '#/schemas/api-utils'
import z from 'zod'

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

const importHtmlSchema = z.instanceof(FormData)
export const importHtmlFile = authFn()
  .inputValidator(importHtmlSchema)
  .handler(async ({ data, context }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    let loggingMetadata = EMPTY_CLIENT_LOGGING_METADATA
    const rawLogging = data.get('loggingMetadata')

    if (rawLogging && typeof rawLogging === 'string') {
      try {
        const parsedJson = JSON.parse(rawLogging)
        loggingMetadata = clientLoggingMetadataSchema.parse(parsedJson)
      } catch (e) {}
    }
    return await wrapServerAction(
      'importHtmlFile',
      context,
      { loggingMetadata },
      async () => {
        const userId = context.session.user.id

        // 5. & 6. Datei extrahieren und validieren (wirft ServerActionError für Client-Toasts)
        const file = data.get('file') as File | null
        if (!file || file.type !== 'text/html') {
          throw new ServerActionError('Only HTML files are allowed.')
        }
        if (file.size > MAX_FILE_SIZE_UPLOAD) {
          throw new ServerActionError('File too large. Maximum size exceeded.')
        }

        const timestamp = Date.now()

        const buffer = Buffer.from(await file.arrayBuffer())
        const htmlContent = buffer.toString('utf8')
        const conversionResult = prepareAndConvertHtmlToMarkdown(htmlContent)

        if (conversionResult.status === 'ERROR')
          throw new ServerActionError(conversionResult.message)

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
        //throw new Error('Testfehler')
        return {
          originalFileName: file.name,
          size: file.size,
          timestamp,
          markdownContent: markdown,
          numberOfConflicts,
          courseId,
        }
      },
    )
  })

export const exportMdFile = authFn()
  .inputValidator(withLogging(exportMdFileSchema))
  .handler(async ({ data, context }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    return await wrapServerAction('exportMdFile', context, data, async () => {
      const {
        courseId,
        includeNotesMetadata,
        includeTags,
        includeOriginalNote,
      } = data
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
      if (!course) throw new ServerActionError('Course not found')
      // title of the course
      let markdown = `# ${course.title}\n\n`
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
      //throw new Error('Testfehler')
      return { markdown }
    })
  })
