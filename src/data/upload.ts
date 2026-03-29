// import fs from 'node:fs'
// import path from 'node:path'
import { prepareAndConvertHtmlToMarkdown } from '#/lib/convertHtmlToMarkdown' // Your existing function
import { createServerFn } from '@tanstack/react-start'
import { MAX_FILE_SIZE_UPLOAD } from '#/lib/constants'
import { authFnMiddleware } from '#/middlewares/auth'
import { logToDb } from '#/lib/logger'
import { prisma } from '#/db'
import { Course, Note } from '#/generated/prisma/client'
import { ImportNote } from '#/lib/types'
import { orderInfo } from '#/lib/udemy'

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
export const uploadHtmlFile = createServerFn({ method: 'POST' })
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
      if (existingCourse) {
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
