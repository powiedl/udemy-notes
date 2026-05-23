import { z } from 'zod'

export const exportMdFileSchema = z.object({
  courseId: z.string(), // .max(10),
  includeCourseTags: z.boolean(),
  includeCourseDescription: z.boolean(),
  includeCourseLinks: z.boolean(),
  includeNotesMetadata: z.boolean(),
  includeNoteTags: z.boolean(),
  includeTrainers: z.boolean(),
  noteVersion: z.enum(['original', 'edited_with_fallback', 'both']),
})

export type ExportMdFileSchema = z.infer<typeof exportMdFileSchema>
