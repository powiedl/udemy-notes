import { z } from 'zod'
import { withLogging } from './api-utils.schema'
import {
  courseNotesSearchSchema,
  noteSearchSchema,
} from './search-params.schema'

// #region validation schemas
export const getNotesSchema = withLogging(noteSearchSchema)
export const toggleNoteTagSchema = withLogging(
  z.object({
    noteId: z.string(),
    tagId: z.string(),
    action: z.enum(['add', 'remove']),
  }),
)
export const getNotesForCourseInputSchema = withLogging(
  z.object({ courseId: z.string(), searchParams: courseNotesSearchSchema }),
)

export const updateNoteContentSchema = withLogging(
  z.object({ noteId: z.string(), content: z.string() }),
)
// #endregion

// #region types
// #endregion
