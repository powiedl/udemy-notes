'use server'

import { authGetFn } from '#/lib/rpc'
import { withLogging } from '#/schemas/api-utils'
import { noteSearchSchema } from '#/schemas/search-params'

// Das Schema mit Logging-Metadaten anreichern
export const getNotesSchema = withLogging(noteSearchSchema)

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

// --- Exportierte Typen für das Frontend ---

// Typ-Helfer, damit das Frontend weiß, wie eine Notiz aus dieser Abfrage aussieht
export type AwaitedReturnTypeGetNotes = Awaited<ReturnType<typeof getNotesFn>>

// Typ der Liste extrahieren (falls `success: true`)
export type NoteListItem = Extract<
  AwaitedReturnTypeGetNotes,
  { success: true }
>['data']['items'][number]
