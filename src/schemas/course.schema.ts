import { z } from 'zod'
import { withLogging } from './api-utils'
import { courseSearchSchema } from './search-params'
import { env } from '#/lib/env.lib.server'

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

export const getCoursesSchema = withLogging(courseSearchSchema)
export const trainerToCourseSchema = withLogging(
  z.object({ courseId: z.string(), trainerId: z.string() }),
)
export const createAndLinkTrainerToCourseSchema = withLogging(
  z.object({ courseId: z.string(), trainerName: z.string() }),
)
export const createShareLinkSchema = withLogging(
  z.object({
    courseId: z.string(),
    expiresAt: z
      .date()
      .optional()
      .default(
        () =>
          new Date(
            Date.now() +
              env.DEFAULT_AGE_SHARE_LINK_IN_DAYS * 24 * 60 * 60 * 1000,
          ),
      ), // default in 7 days (but when is it calculated?)
  }),
)
// #endregion

// #region types (u.a. für die logic dateien)
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
export type TrainerToCourseInput = z.infer<typeof trainerToCourseSchema>
export type CreateAndLinkTrainerToCourseInput = z.infer<
  typeof createAndLinkTrainerToCourseSchema
>
export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>
// #endregion
