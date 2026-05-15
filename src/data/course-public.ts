import { publicGetFn } from '#/lib/rpc'
import {
  getNotesByTokenIdInputSchema,
  tokenIdSchema,
} from '#/schemas/course-public.schema'

export const getCourseByTokenIdFn = publicGetFn
  .inputValidator(tokenIdSchema)
  .handler(async ({ context, data }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { getCourseByTokenIdLogic } =
      await import('./course-public.logic.server')
    return await wrapServerAction('getCourseByTokenId', context, data, () =>
      getCourseByTokenIdLogic(data),
    )
  })

export const getNotesByTokenIdFn = publicGetFn
  .inputValidator(getNotesByTokenIdInputSchema)
  .handler(async ({ context, data }) => {
    const { tokenId, searchParams } = data
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { getNotesByTokenIdLogic } =
      await import('./course-public.logic.server')
    return await wrapServerAction('getNotesByTokenId', context, data, () =>
      getNotesByTokenIdLogic(tokenId, searchParams),
    )
  })
