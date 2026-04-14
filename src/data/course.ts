'use server'

import z from 'zod'
import { authFn, authGetFn } from '#/lib/rpc'
import { withLogging } from '#/schemas/api-utils'
import { paginationSchema } from '#/schemas/search-params'
import type { Prisma } from '#/generated/prisma/client'

// #region validation schemas
export const courseIdSchema = withLogging(z.object({ id: z.string() }))
export const getTrainerSuggestionsSchema = withLogging(
  z.object({ query: z.string() }),
)
export const removeTagFromCourseSchema = withLogging(
  z.object({ courseId: z.string(), tagId: z.string() }),
)
export const linkTagToCourseSchema = withLogging(
  z.object({ courseId: z.string(), tagId: z.string() }),
)
export const createAndLinkTagToCourseSchema = withLogging(
  z.object({ courseId: z.string(), tagName: z.string() }),
)
export const getCoursesSchema = withLogging(paginationSchema)
// #endregion

// #region Prisma Types
export type CourseHeaderData = Prisma.CourseGetPayload<{
  include: {
    tags: {
      select: {
        tag: {
          select: {
            id: true
            name: true
            userId: true
          }
        }
      }
    }
  }
}> & {
  _count?: {
    notes: number
  }
  notes?: Prisma.NoteGetPayload<{}>[]
}
// #endregion

// Typen für die .logic.server.ts Datei
export type GetCoursesInput = z.infer<typeof getCoursesSchema>
export type CourseIdInput = z.infer<typeof courseIdSchema>
export type GetTrainerSuggestionsInput = z.infer<
  typeof getTrainerSuggestionsSchema
>
export type RemoveTagFromCourseInput = z.infer<typeof removeTagFromCourseSchema>
export type LinkTagToCourseInput = z.infer<typeof linkTagToCourseSchema>
export type CreateAndLinkTagToCourseInput = z.infer<
  typeof createAndLinkTagToCourseSchema
>

export const getCoursesFn = authGetFn
  .inputValidator(getCoursesSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { getCoursesLogic } = await import('./course.logic.server')
    return await wrapServerAction('getCoursesFn', context, data, () =>
      getCoursesLogic(data, context.session.user.id),
    )
  })

export const getCourseByIdFn = authGetFn
  .inputValidator(courseIdSchema)
  .handler(async ({ context, data }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { getCourseByIdLogic } = await import('./course.logic.server')
    return await wrapServerAction('getCourseById', context, data, () =>
      getCourseByIdLogic(data, context.session.user.id),
    )
  })

export type AwaitedReturnTypeGetCourseById = Awaited<
  ReturnType<typeof getCourseByIdFn>
>
export const deleteCourseByIdFn = authFn
  .inputValidator(courseIdSchema)
  .handler(async ({ context, data }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { deleteCourseByIdLogic } = await import('./course.logic.server')
    return await wrapServerAction('deleteCourseById', context, data, () =>
      deleteCourseByIdLogic(data, context.session.user.id),
    )
  })

export const getTrainerSuggestionsFn = authGetFn
  .inputValidator(getTrainerSuggestionsSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { getTrainerSuggestionsLogic } = await import('./course.logic.server')
    return await wrapServerAction(
      'getTrainerSuggestionsFn',
      context,
      data,
      () => getTrainerSuggestionsLogic(data),
    )
  })

export const removeTagFromCourseFn = authFn
  .inputValidator(removeTagFromCourseSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { removeTagFromCourseLogic } = await import('./course.logic.server')
    return await wrapServerAction('removeTagFromCourseFn', context, data, () =>
      removeTagFromCourseLogic(data, context.session.user.id),
    )
  })

export const linkTagToCourseFn = authFn
  .inputValidator(linkTagToCourseSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { linkTagToCourseLogic } = await import('./course.logic.server')
    return await wrapServerAction('linkTagToCourseFn', context, data, () =>
      linkTagToCourseLogic(data, context.session.user.id),
    )
  })

export const createAndLinkTagToCourseFn = authFn
  .inputValidator(createAndLinkTagToCourseSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { createAndLinkTagToCourseLogic } =
      await import('./course.logic.server')
    return await wrapServerAction(
      'createAndLinkTagToCourseFn',
      context,
      data,
      () => createAndLinkTagToCourseLogic(data, context.session.user.id),
    )
  })
