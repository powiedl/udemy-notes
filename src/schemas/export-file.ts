import z from 'zod'

export const exportMdFileSchema = z.object({
  courseId: z.string(),
  includeNotesMetadata: z.boolean(),
  includeTags: z.boolean(),
  includeOriginalNote: z.boolean().optional().default(false),
})

export type ExportMdFileSchema = z.infer<typeof exportMdFileSchema>
