import { z } from 'zod'
import { withLogging } from './api-utils.schema'
import {
  TAG_PAGINATION_DEFAULTS,
  tagPaginationSchema,
} from './search-params.schema'

// #region validation schemas
export const getAvailableTagsSchema = withLogging(tagPaginationSchema).default(
  TAG_PAGINATION_DEFAULTS,
)
export const getTagsForSelectorSchema = withLogging(z.object({}))
export const deleteTagSchema = withLogging(z.object({ id: z.string() }))
export const getTagsUsageCountSchema = withLogging(z.object({ id: z.string() }))

export const createAndLinkTagToTargetSchema = withLogging(
  z.object({
    targetId: z.string(),
    targetType: z.enum(['course', 'note']),
    tagName: z.string().min(1),
  }),
)
export type CreateAndLinkTagToTargetInput = z.infer<
  typeof createAndLinkTagToTargetSchema
>

export const renameTagSchema = withLogging(
  z.object({
    id: z.string(),
    newName: z.string().min(1),
  }),
)

export const autoTagCourseBatchSchema = withLogging(
  z.object({ courseId: z.string().min(1, 'courseId must not be empty') }),
)

export const approveCourseTagsBatchSchema = withLogging(
  z.object({
    courseId: z.string().min(1, 'courseId must not be empty'),
    tagNames: z.array(z.string()),
  }),
)

export const noteTagActionSchema = withLogging(
  z.object({
    noteId: z.string().min(1, 'noteId must not be empty'),
    tagId: z.string().min(1, 'tagId must not be emtpy'),
  }),
)
// #endregion

// #region Typen
// Typen exportieren, damit die .server.ts Datei sie nutzen kann
export type GetAvailableTagsInput = z.infer<typeof getAvailableTagsSchema>
export type GetTagsForSelectorInput = z.infer<typeof getTagsForSelectorSchema>
export type DeleteTagInput = z.infer<typeof deleteTagSchema>
export type RenameTagInput = z.infer<typeof renameTagSchema>
export type AutoTagCourseBatchInput = z.infer<typeof autoTagCourseBatchSchema>
export type ApproveCourseTagsBatchInput = z.infer<
  typeof approveCourseTagsBatchSchema
>
export type NoteTagActionInput = z.infer<typeof noteTagActionSchema>
// #endregion
