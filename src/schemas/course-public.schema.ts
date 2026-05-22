import z from 'zod'
import { withLogging } from './api-utils.schema'
import { courseNotesSearchSchema } from './search-params.schema'

// #region validation schemas
export const tokenIdSchema = withLogging(z.object({ id: z.string() }))
export const getNotesByTokenIdInputSchema = withLogging(
  z.object({ tokenId: z.string(), searchParams: courseNotesSearchSchema }),
)
// #endregion

// #region types (u.a. für die logic dateien)
export type TokenIdInput = z.infer<typeof tokenIdSchema>
export type GetNotesByTokenIdInput = z.infer<
  typeof getNotesByTokenIdInputSchema
>
// #endregion
