'use server'

import { authGetFn, authFn } from '#/lib/rpc'
import { withLogging } from '#/schemas/api-utils'
import {
  courseNotesSearchSchema,
  noteSearchSchema,
} from '#/schemas/search-params'
import z from 'zod'

// Das Schema mit Logging-Metadaten anreichern
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

export type UpdateNoteContentInput = z.infer<typeof updateNoteContentSchema>
/**
 * RPC-Endpunkt zum Abrufen der globalen Notiz-Liste (paginiert, gefiltert, sortiert).
 */
export const getNotesFn = authGetFn
  .inputValidator(getNotesSchema)
  .handler(async ({ data, context }) => {
    // Dynamischer Import schützt den Client-Bundle!
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { getNotesLogic } = await import('./note.logic.server')

    return await wrapServerAction('getNotesFn', context, data, async () => {
      return getNotesLogic(data, context.session.user.id)
    })
  })

export const getNotesForCourseFn = authGetFn
  // Wir nutzen hier ein Zod-Objekt, das courseId UND die searchParams vereint
  .inputValidator(getNotesForCourseInputSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { getNotesForCourseLogic } = await import('./note.logic.server')

    return await wrapServerAction(
      'getNotesForCourseFn',
      context,
      data,
      async () => {
        return getNotesForCourseLogic(
          data.courseId,
          data.searchParams,
          context.session.user.id,
        )
      },
    )
  })

export const toggleNoteTagFn = authFn
  .inputValidator(toggleNoteTagSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { toggleNoteTagLogic } = await import('./note.logic.server')

    return await wrapServerAction(
      'toggleNoteTagFn',
      context,
      { loggingMetadata: { component: 'NoteTagEditor' } },
      async () => {
        return toggleNoteTagLogic(data, context.session.user.id)
      },
      data.action === 'add' ? 'Tag added' : 'Tag removed',
    )
  })

export const updateNoteContentFn = authFn
  .inputValidator(updateNoteContentSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { updateNoteContentLogic } = await import('./note.logic.server')

    return await wrapServerAction(
      'updateNoteContentFn',
      context,
      { loggingMetadata: { component: 'NoteEditor' } },
      async () => {
        return updateNoteContentLogic(data, context.session.user.id)
      },
      'Note updated successfully',
    )
  })

// --- Exportierte Typen für das Frontend ---

// Typ-Helfer, damit das Frontend weiß, wie eine Notiz aus dieser Abfrage aussieht
export type AwaitedReturnTypeGetNotes = Awaited<ReturnType<typeof getNotesFn>>

// Typ der Liste extrahieren (falls `success: true`)
export type NoteListItem = Extract<
  AwaitedReturnTypeGetNotes,
  { success: true }
>['data']['items'][number]
