// import fs from 'node:fs'
// import path from 'node:path'
import { prepareAndConvertHtmlToMarkdown } from '#/lib/convertHtmlToMarkdown' // Your existing function
import { createServerFn } from '@tanstack/react-start'
import { MAX_FILE_SIZE_UPLOAD } from '#/lib/constants'
import { authFnMiddleware } from '#/middlewares/auth'
import { logToDb } from '#/lib/logger'
import { prisma } from '#/db'
import { Course } from '#/generated/prisma/client'

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
    // await logToDb({
    //   component: 'UploadHtmlFile-handler',
    //   severity: 'info',
    //   message: 'handler started',
    // })
    try {
      const userId = context.session.user.id

      //console.log('User-Info:', JSON.stringify(context.session.user))
      const { file } = data

      // Convert file to Buffer
      const buffer = Buffer.from(await file.arrayBuffer())

      // Setup upload directory
      // const uploadDir = path.join(process.cwd(), 'uploads')
      // if (!fs.existsSync(uploadDir)) {
      //   fs.mkdirSync(uploadDir, { recursive: true })
      // }

      // Save HTML file
      const timestamp = Date.now()
      // const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      // const htmlFileName = `${timestamp}_${sanitizedFileName}`
      // const htmlFilePath = path.join(uploadDir, htmlFileName)

      // Read and convert to Markdown
      const htmlContent = buffer.toString('utf8')
      // await logToDb({
      //   component: 'UploadHtmlFile-handler',
      //   severity: 'info',
      //   message: 'Conversion to Markdown starts now',
      // })

      const conversionResult = prepareAndConvertHtmlToMarkdown(htmlContent)
      if (conversionResult.status === 'ERROR')
        throw new Error(conversionResult.message)
      const { course, markdown } = conversionResult

      // await logToDb({
      //   component: 'UploadHtmlFile-handler',
      //   severity: 'info',
      //   message: 'Conversion to Markdown finished',
      // })

      // Save Markdown file
      // const markdownFileName = htmlFileName.replace(/\.html?$/i, '.md')
      // const markdownFilePath = path.join(uploadDir, markdownFileName)
      // fs.writeFileSync(markdownFilePath, markdownContent, 'utf-8')

      const existingCourse = await prisma.course.findFirst({
        where: { userId: userId, title: course.title },
      })
      let finishedCourse: Course
      if (existingCourse) {
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
      for (let note of course.notes) {
        createdNotes.push(
          prisma.note.create({
            data: {
              courseId: finishedCourse.id,
              userId,
              timestamp: note.timestamp,
              section: note.section,
              lecture: note.lecture,
              originalContent: note.content,
              editedContent: '',
            },
          }),
        )
      }
      await Promise.all(createdNotes)
      return {
        success: true,
        originalFileName: file.name,
        // htmlFile: htmlFilePath,
        // markdownFile: markdownFilePath,
        size: file.size,
        timestamp,
        markdownContent: markdown,
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
