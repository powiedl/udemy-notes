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
// #endregion

// Typen exportieren, damit die .server.ts Datei sie nutzen kann
export type GetAvailableTagsInput = z.infer<typeof getAvailableTagsSchema>
export type GetTagsForSelectorInput = z.infer<typeof getTagsForSelectorSchema>
export type DeleteTagInput = z.infer<typeof deleteTagSchema>
export type RenameTagInput = z.infer<typeof renameTagSchema>
export type GetTagUsageCountInput = z.infer<typeof getTagUsageCountFn>

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
