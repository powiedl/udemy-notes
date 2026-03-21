import fs from 'node:fs'
import path from 'node:path'
import { prepareAndConvertHtmlToMarkdown } from '#/lib/convertHtmlToMarkdown' // Your existing function
import { createServerFn } from '@tanstack/react-start'
import { MAX_FILE_SIZE_UPLOAD } from '#/lib/constants'
import { authFnMiddleware } from '#/middlewares/auth'

export const uploadHtmlFile = createServerFn({ method: 'POST' })
  .middleware([authFnMiddleware])
  .inputValidator((data) => {
    // Validate that data is FormData
    if (!(data instanceof FormData)) {
      console.log(
        'uploadHtmlFile, data (should be of type Formdata, but is not)',
        data,
      )
      throw new Error('Expected FormData')
    }
    // Extract and validate file
    const file = data.get('file') as File

    // Validate file type
    if (file.type !== 'text/html') {
      throw new Error('Only HTML files are allowed. Received: ' + file.type)
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_UPLOAD) {
      throw new Error(
        `File size must be less than ${Math.floor(MAX_FILE_SIZE_UPLOAD / 1024 / 1024)} MB`,
      )
    }

    return { file }
  })
  .handler(async ({ data }) => {
    try {
      const { file } = data

      // Convert file to Buffer
      const buffer = Buffer.from(await file.arrayBuffer())

      // Setup upload directory
      const uploadDir = path.join(process.cwd(), 'uploads')
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true })
      }

      // Save HTML file
      const timestamp = Date.now()
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const htmlFileName = `${timestamp}_${sanitizedFileName}`
      const htmlFilePath = path.join(uploadDir, htmlFileName)

      // Read and convert to Markdown
      const htmlContent = buffer.toString('utf8')
      const markdownContent = prepareAndConvertHtmlToMarkdown(htmlContent)

      // Save Markdown file
      const markdownFileName = htmlFileName.replace(/\.html?$/i, '.md')
      const markdownFilePath = path.join(uploadDir, markdownFileName)
      fs.writeFileSync(markdownFilePath, markdownContent, 'utf-8')

      return {
        success: true,
        originalFileName: file.name,
        htmlFile: htmlFilePath,
        markdownFile: markdownFilePath,
        size: file.size,
        timestamp,
        markdownContent: markdownContent,
      }
    } catch (error: unknown) {
      console.error('Upload error:', error)
      throw new Error(
        error instanceof Error
          ? 'Failed to process file upload: ' + error.message
          : 'Failed to process file upload',
      )
    }
  })
