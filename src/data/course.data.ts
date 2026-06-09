'use server'

import { authFn, authGetFn } from '#/lib/rpc.lib'
import type { Prisma } from '#/generated/prisma/client'
import {
  courseIdSchema,
  createAndLinkTagToCourseSchema,
  createAndLinkTrainerToCourseSchema,
  createShareLinkSchema,
  getCoursesSchema,
  getTrainerSuggestionsSchema,
  linkTagToCourseSchema,
  removeTagFromCourseSchema,
  trainerToCourseSchema,
} from '#/schemas/course.schema'

// #region Prisma Types
export type CourseHeaderData = Prisma.CourseGetPayload<{
  include: {
    trainers: {
      include: {
        trainer: true
      }
    }
    tags: {
      select: {
        tag: {
          select: {
            id: true
            name: true
            userId: true
            color: true
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

export const getCoursesFn = authGetFn
  .inputValidator(getCoursesSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { getCoursesLogic } = await import('./course.logic.server')
    return await wrapServerAction('getCoursesFn', context, data, () =>
      getCoursesLogic(data, context.session.user.id),
    )
  })

export const getCourseByIdFn = authGetFn
  .inputValidator(courseIdSchema)
  .handler(async ({ context, data }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
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
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { deleteCourseByIdLogic } = await import('./course.logic.server')
    return await wrapServerAction('deleteCourseById', context, data, () =>
      deleteCourseByIdLogic(data, context.session.user.id),
    )
  })

export const getTrainerSuggestionsFn = authFn // eigentlich würde authGetFn reichen - aber da cached der Browser das Ergebnis und unterbindet nachfolgende gleiche Requests
  .inputValidator(getTrainerSuggestionsSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
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
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { removeTagFromCourseLogic } = await import('./course.logic.server')
    return await wrapServerAction('removeTagFromCourseFn', context, data, () =>
      removeTagFromCourseLogic(data, context.session.user.id),
    )
  })

export const linkTagToCourseFn = authFn
  .inputValidator(linkTagToCourseSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { linkTagToCourseLogic } = await import('./course.logic.server')
    return await wrapServerAction('linkTagToCourseFn', context, data, () =>
      linkTagToCourseLogic(data, context.session.user.id),
    )
  })

export const createAndLinkTagToCourseFn = authFn
  .inputValidator(createAndLinkTagToCourseSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { createAndLinkTagToCourseLogic } =
      await import('./course.logic.server')
    return await wrapServerAction(
      'createAndLinkTagToCourseFn',
      context,
      data,
      () => createAndLinkTagToCourseLogic(data, context.session.user.id),
    )
  })

export const addTrainerToCourseFn = authFn
  .inputValidator(trainerToCourseSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { addTrainerToCourseLogic } = await import('./course.logic.server')
    return await wrapServerAction('addTrainerToCourseFn', context, data, () =>
      addTrainerToCourseLogic(data, context.session.user.id),
    )
  })

export const removeTrainerFromCourseFn = authFn
  .inputValidator(trainerToCourseSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { removeTrainerFromCourseLogic } =
      await import('./course.logic.server')
    return await wrapServerAction('addTrainerToCourseFn', context, data, () =>
      removeTrainerFromCourseLogic(data, context.session.user.id),
    )
  })

export const createAndLinkTrainerToCourseFn = authFn
  .inputValidator(createAndLinkTrainerToCourseSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { createAndLinkTrainerToCourseLogic } =
      await import('./course.logic.server')
    return await wrapServerAction(
      'createAndLinkTrainerToCourseFn',
      context,
      data,
      () => createAndLinkTrainerToCourseLogic(data, context.session.user.id),
    )
  })

export const createShareLinkFn = authFn
  .inputValidator(createShareLinkSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { createShareLinkLogic } = await import('./course.logic.server')
    return await wrapServerAction('createShareLinkFn', context, data, () =>
      createShareLinkLogic(data, context.session.user.id),
    )
  })
