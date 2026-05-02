import z from 'zod'
import { withLogging } from './api-utils'

export const importFileSchema = withLogging(
  z.object({
    content: z.string().min(1, 'Content is required'),
    fileName: z
      .string()
      .refine(
        (name) =>
          name.toLowerCase().endsWith('.html') ||
          name.toLowerCase().endsWith('.md'),
        { message: 'Only HTML (.html) or Markdown (.md) files are allowed' },
      ),
    fileSize: z.number(), // Für die Validierung im Handler
    trainers: z.array(z.string().optional()),
    tagIds: z.array(z.string()).default([]),
    newPrivateTags: z.array(z.string()).default([]),
  }),
)
export type ImportFileSchema = z.infer<typeof importFileSchema>
