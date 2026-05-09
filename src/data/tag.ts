import { authFn, authGetFn } from '#/lib/rpc'
import { withLogging } from '#/schemas/api-utils'
import {
  TAG_PAGINATION_DEFAULTS,
  tagPaginationSchema,
} from '#/schemas/search-params'
import z from 'zod'
import { renameTagLogic } from './tag.logic.server'

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

// Typen exportieren, damit die .server.ts Datei sie nutzen kann
export type GetAvailableTagsInput = z.infer<typeof getAvailableTagsSchema>
export type GetTagsForSelectorInput = z.infer<typeof getTagsForSelectorSchema>
export type DeleteTagInput = z.infer<typeof deleteTagSchema>
export type RenameTagInput = z.infer<typeof renameTagSchema>
export type GetTagUsageCountInput = z.infer<typeof getTagUsageCountFn>
export type AutoTagCourseBatchInput = z.infer<typeof autoTagCourseBatchSchema>
export type ApproveCourseTagsBatchInput = z.infer<
  typeof approveCourseTagsBatchSchema
>
export type NoteTagActionInput = z.infer<typeof noteTagActionSchema>

export const createDefaultTagsFn = authFn.handler(async ({ context }) => {
  const { wrapServerAction } = await import('#/lib/server-utils.server')
  // Dynamischer Import INSIDE handler ist zu 100% sicher vor dem Client
  const { createDefaultTagsLogic } = await import('./tag.logic.server')

  return await wrapServerAction('createDefaultTags', context, {}, async () => {
    return createDefaultTagsLogic()
  })
})

export const getAvailableTagsFn = authGetFn
  .inputValidator(getAvailableTagsSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { getAvailableTagsLogic } = await import('./tag.logic.server')

    return await wrapServerAction(
      'getAvailableTags',
      context,
      data,
      async () => {
        return getAvailableTagsLogic(data, context.session.user.id)
      },
    )
  })

export const getTagsForSelectorFn = authGetFn
  .inputValidator(getTagsForSelectorSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { getTagsForSelectorLogic } = await import('./tag.logic.server')

    return await wrapServerAction(
      'getTagsForSelectorFn',
      context,
      data,
      async () => getTagsForSelectorLogic(data, context.session.user.id),
    )
  })

export const deleteTagFn = authFn
  .inputValidator(deleteTagSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { deleteTagLogic } = await import('./tag.logic.server')

    return await wrapServerAction('deleteTagFn', context, data, async () =>
      deleteTagLogic(data, context.session.user.id),
    )
  })

export const createAndLinkTagToTargetFn = authFn
  .inputValidator(createAndLinkTagToTargetSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { createAndLinkTagLogic } = await import('./tag.logic.server') // Pfad anpassen

    return await wrapServerAction('createAndLinkTagFn', context, data, () =>
      createAndLinkTagLogic(data, context.session.user.id),
    )
  })

export const renameTagFn = authFn
  .inputValidator(renameTagSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    return await wrapServerAction('renameTag', context, data, () =>
      renameTagLogic(data, context.session.user.id),
    )
  })

export const getTagUsageCountFn = authGetFn
  .inputValidator(getTagsUsageCountSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { getTagUsageCountLogic } = await import('./tag.logic.server')

    return await wrapServerAction(
      'getTagUsageCountFn',
      context,
      data,
      async () => getTagUsageCountLogic(data.id, context.session.user.id),
    )
  })

export const autoTagCourseBatchFn = authFn
  .inputValidator(autoTagCourseBatchSchema)
  .handler(async ({ data, context }) => {
    // 3. Dynamische Imports schützen das Client-Bundle!
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { autoTagCourseBatchLogic } = await import('./tag.logic.server')

    // 4. Das Sicherheitsnetz (Error Handling & Logging)
    return await wrapServerAction(
      'autoTagCourseBatchFn',
      context,
      {
        loggingMetadata: {
          feature: 'AI-Tagging',
        },
      },
      async () => {
        // Aufruf der reinen Business-Logik
        return autoTagCourseBatchLogic(data, context.session.user.id)
      },
      'AI tagging for for course completed', // Erfolg-Nachricht für den Frontend-Toast
    )
  })

export const approveCourseTagsBatchFn = authFn
  .inputValidator(approveCourseTagsBatchSchema)
  .handler(async ({ data, context }) => {
    // 1. Dynamische Imports schützen das Client-Bundle!
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { approveCourseTagsBatchLogic } = await import('./tag.logic.server')

    // 2. Das Sicherheitsnetz
    return await wrapServerAction(
      'approveCourseTagsBatchFn',
      context,
      {
        loggingMetadata: {
          feature: 'AI-Tagging-Approval',
          component: 'ReviewCourseTagsDialog',
        },
      },
      async () => {
        // 3. Reiner Aufruf der Business-Logik
        return approveCourseTagsBatchLogic(data, context.session.user.id)
      },
      'Tags successfully saved to course', // Erfolg-Toast
    )
  })

export const approveNoteTagFn = authFn
  .inputValidator(noteTagActionSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { approveNoteTagLogic } = await import('./tag.logic.server')

    return await wrapServerAction(
      'approveNoteTagFn',
      context,
      { loggingMetadata: { feature: 'AI-Tagging-Note-Approve' } },
      async () => approveNoteTagLogic(data, context.session.user.id),
      'Tag akzeptiert',
    )
  })

// --- REJECT ---
export const rejectNoteTagFn = authFn
  .inputValidator(noteTagActionSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { rejectNoteTagLogic } = await import('./tag.logic.server')

    return await wrapServerAction(
      'rejectNoteTagFn',
      context,
      { loggingMetadata: { feature: 'AI-Tagging-Note-Reject' } },
      async () => rejectNoteTagLogic(data, context.session.user.id),
      'Tag verworfen', // Optional: Man könnte diesen Toast auch weglassen, wenn er stört
    )
  })
