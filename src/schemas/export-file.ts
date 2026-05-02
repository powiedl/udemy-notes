import z from 'zod'

export const exportMdFileSchema = z.object({
  courseId: z.string(), // .max(10),
  includeNotesMetadata: z.boolean(),
  includeCourseTags: z.boolean(),
  includeNoteTags: z.boolean(),
  includeTrainers: z.boolean(),
  noteVersion: z.enum(['original', 'edited_with_fallback', 'both']),
})

export type ExportMdFileSchema = z.infer<typeof exportMdFileSchema>
