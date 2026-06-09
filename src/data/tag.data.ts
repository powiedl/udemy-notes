import { authFn, authGetFn } from '#/lib/rpc.lib'
import type { z } from 'zod'

// 1. Wir importieren NUR noch die Schemata aus der zentralen Schema-Datei!
// (Keine Definitionen mehr in dieser Datei!)
import {
  getAvailableTagsSchema,
  getTagsForSelectorSchema,
  deleteTagSchema,
  getTagsUsageCountSchema,
  createAndLinkTagToTargetSchema,
  updateTagSchema, // <- Beachte den neuen Namen (früher renameTagSchema)
  autoTagCourseBatchSchema,
  approveCourseTagsBatchSchema,
  noteTagActionSchema,
} from '#/schemas/tag.schema'

// 2. Export eines Typs, der für Loaders/Frontend nützlich sein könnte
export type GetTagUsageCountInput = z.infer<typeof getTagsUsageCountSchema>

// ==========================================
// SERVER FUNCTIONS (Transport Layer)
// ==========================================

export const createDefaultTagsFn = authFn.handler(async ({ context }) => {
  const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
  // Dynamischer Import INSIDE handler ist zu 100% sicher vor dem Client
  const { createDefaultTagsLogic } = await import('./tag.logic.server')

  return await wrapServerAction('createDefaultTags', context, {}, async () => {
    return createDefaultTagsLogic()
  })
})

export const getAvailableTagsFn = authGetFn
  .inputValidator(getAvailableTagsSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
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
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
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
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { deleteTagLogic } = await import('./tag.logic.server')

    return await wrapServerAction('deleteTagFn', context, data, async () =>
      deleteTagLogic(data, context.session.user.id),
    )
  })

export const createAndLinkTagToTargetFn = authFn
  .inputValidator(createAndLinkTagToTargetSchema) // Schema erlaubt nun auch color!
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { createAndLinkTagLogic } = await import('./tag.logic.server')

    return await wrapServerAction('createAndLinkTagFn', context, data, () =>
      createAndLinkTagLogic(data, context.session.user.id),
    )
  })

// UMBENANNT: Hier nutzen wir nun updateTagSchema (und rufen gleich eine updateTagLogic auf)
export const updateTagFn = authFn
  .inputValidator(updateTagSchema) // Schema prüft: Entweder newName ODER color ODER beides
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')

    // Hinweis: Du musst diese Funktion in deiner Logic-Datei noch von
    // renameTagLogic zu updateTagLogic umbenennen (das machen wir gleich!)
    const { updateTagLogic } = await import('./tag.logic.server')

    return await wrapServerAction('updateTag', context, data, () =>
      updateTagLogic(data, context.session.user.id),
    )
  })

export const getTagUsageCountFn = authGetFn
  .inputValidator(getTagsUsageCountSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
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
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { autoTagCourseBatchLogic } = await import('./tag.logic.server')

    return await wrapServerAction(
      'autoTagCourseBatchFn',
      context,
      {
        loggingMetadata: {
          feature: 'AI-Tagging',
        },
      },
      async () => {
        return autoTagCourseBatchLogic(data, context.session.user.id)
      },
      'AI tagging for for course completed',
    )
  })

export const approveCourseTagsBatchFn = authFn
  .inputValidator(approveCourseTagsBatchSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { approveCourseTagsBatchLogic } = await import('./tag.logic.server')

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
        return approveCourseTagsBatchLogic(data, context.session.user.id)
      },
      'Tags successfully saved to course',
    )
  })

export const approveNoteTagFn = authFn
  .inputValidator(noteTagActionSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { approveNoteTagLogic } = await import('./tag.logic.server')

    return await wrapServerAction(
      'approveNoteTagFn',
      context,
      { loggingMetadata: { feature: 'AI-Tagging-Note-Approve' } },
      async () => approveNoteTagLogic(data, context.session.user.id),
      'Tag akzeptiert',
    )
  })

export const rejectNoteTagFn = authFn
  .inputValidator(noteTagActionSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { rejectNoteTagLogic } = await import('./tag.logic.server')

    return await wrapServerAction(
      'rejectNoteTagFn',
      context,
      { loggingMetadata: { feature: 'AI-Tagging-Note-Reject' } },
      async () => rejectNoteTagLogic(data, context.session.user.id),
      'Tag verworfen',
    )
  })
