//import { MAX_FILE_SIZE_UPLOAD } from '#/lib/constants'
import z from 'zod'
import { withLogging } from './api-utils'

export const importHtmlFileSchema = withLogging(
  z.object({
    htmlContent: z.string().min(1, 'HTML content is required'),
    fileName: z.string(), // Für das Logging/Response benötigt
    fileSize: z.number(), // Für die Validierung im Handler
    trainers: z.array(z.string().optional()),
    tagIds: z.array(z.string()).default([]),
    newPrivateTags: z.array(z.string()).default([]),
  }),
)
export type ImportHtmlFileSchema = z.infer<typeof importHtmlFileSchema>
