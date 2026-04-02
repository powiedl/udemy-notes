// import fs from 'node:fs'
// import path from 'node:path'
import { prepareAndConvertHtmlToMarkdown } from '#/lib/convertHtmlToMarkdown' // Your existing function
import { createServerFn } from '@tanstack/react-start'
import { MAX_FILE_SIZE_UPLOAD } from '#/lib/constants'
import { authFnMiddleware } from '#/middlewares/auth'
import { logToDb } from '#/lib/logger'
import { prisma } from '#/db'
import { Course, Note } from '#/generated/prisma/client'
import { ImportNote } from '#/types/course'
import { orderInfo } from '#/lib/udemy'
import { exportMdFileSchema } from '#/schemas/export-file'
import { notFound } from '@tanstack/react-router'
import { processNoteForMarkdown } from '#/lib/export-helper'

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
  .inputValidator(async (data) => {
    // Validate that data is FormData
    // await logToDb({
    //   component: 'UploadHtmlFile-Validator',
    //   severity: 'info',
    //   message: 'Validator started',
    // })
    if (!(data instanceof FormData)) {
      // console.log(
      //   'uploadHtmlFile, data (should be of type Formdata, but is not)',
      //   data,
      // )
      await logToDb({
        component: 'UploadHtmlFile-Validator',
        severity: 'error',
        message:
          'uploadHtmlFile, data (should be of type Formdata, but is not)',
      })
      throw new Error('Expected FormData')
    }
    // Extract and validate file
    const file = data.get('file') as File

    // Validate file type
    if (file.type !== 'text/html') {
      await logToDb({
        component: 'UploadHtmlFile-Validator',
        severity: 'error',
        message: 'Invalid file type: ' + file.type,
      })
      throw new Error('Only HTML files are allowed. Received: ' + file.type)
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_UPLOAD) {
      await logToDb({
        component: 'UploadHtmlFile-Validator',
        severity: 'error',
        message: 'Filesize exceeds allowed maximum filesize',
      })
      throw new Error(
        `File size must be less than ${Math.floor(MAX_FILE_SIZE_UPLOAD / 1024 / 1024)} MB`,
      )
    }
    // await logToDb({
    //   component: 'UploadHtmlFile-Validator',
    //   severity: 'info',
    //   message: 'Validator finished successful',
    // })
    return { file }
  })
  .handler(async ({ data, context }) => {
    try {
      const userId = context.session.user.id

      const { file } = data

      // Convert file to Buffer
      const buffer = Buffer.from(await file.arrayBuffer())

      // Save HTML file
      const timestamp = Date.now()

      // Read and convert to Markdown
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
        success: true,
        originalFileName: file.name,
        size: file.size,
        timestamp,
        markdownContent: markdown,
        numberOfConflicts,
        courseId,
      }
    } catch (error: unknown) {
      console.error('Upload error:', error)
      if (error instanceof Error) {
        await logToDb({
          component: 'UploadHtmlFile-handler',
          severity: 'error',
          message: error.message,
        })
        throw new Error('Failed to process file upload: ' + error.message)
      } else {
        await logToDb({
          component: 'UploadHtmlFile-handler',
          severity: 'error',
          message: 'Failed to process file upload (no more details available)',
        })

        throw new Error('Failed to process file upload')
      }
    }
  })

export const exportMdFile = createServerFn({ method: 'POST' })
  .middleware([authFnMiddleware])
  .inputValidator(exportMdFileSchema)
  .handler(async ({ data, context }) => {
    let markdown =
      '# Mein Kurs\n\n## Metadaten\n\nTags:\n\n* Javascript\n* HTML'
    const { courseId, includeNotesMetadata, includeTags, includeOriginalNote } =
      data
    try {
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
    } catch (error) {
      console.error('Upload error:', error)
      if (error instanceof Error) {
        await logToDb({
          component: 'ExportMdFile-handler',
          severity: 'error',
          message: error.message,
        })
        throw new Error(
          `Failed to export course notes for course '${courseId}': ${error.message}`,
        )
      } else {
        await logToDb({
          component: 'ExportMd-handler',
          severity: 'error',
          message: `Failed to export course notes for course '${courseId}' (no more details available)`,
        })

        throw new Error('Failed to export course notes')
      }
    }
    markdown.replace(/\n\n---\n\n$/, '') // remove the last seperator after the last note (it is not needed)

    return { success: true, markdown }
  })
