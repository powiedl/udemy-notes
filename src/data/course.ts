'use server'

import z from 'zod'
import { authFn, authGetFn } from '#/lib/rpc'
import { withLogging } from '#/schemas/api-utils'
import { paginationSchema } from '#/schemas/search-params'
import { ServerActionError } from '#/types/errors'
//import { sleep } from '#/lib/utils'

// #region validation schemas
export const courseIdSchema = withLogging(z.object({ id: z.string() }))

// #endregion

// Wir nutzen das zentrale paginationSchema und reichern es mit Logging-Metadaten an.
const getCoursesSchema = withLogging(paginationSchema)
export const getCoursesFn = authGetFn
  .inputValidator(getCoursesSchema)
  .handler(async ({ data, context }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { page, pageSize, search } = data
    return await wrapServerAction('getCoursesFn', context, data, async () => {
      const skip = (page - 1) * pageSize
      const take = pageSize
      // WICHTIG: await vor prisma!
      const [courses, totalCount] = await Promise.all([
        prisma.course.findMany({
          where: {
            userId: context.session.user.id,
            title: { contains: search, mode: 'insensitive' },
          },
          skip,
          take,
          orderBy: {
            updatedAt: 'desc',
          },
          include: { _count: { select: { notes: true } } },
        }),
        prisma.course.count({
          where: {
            userId: context.session.user.id,
            title: { contains: search, mode: 'insensitive' },
          },
        }),
      ])
      //console.log('totalCount', totalCount)
      //throw new ServerActionError('Testfehler für Logging')
      //console.log('getCoursesFn,result:', { items: courses, totalCount })
      return { items: courses, totalCount }
    })
  })

export const getCourseById = authGetFn
  .inputValidator(courseIdSchema)
  .handler(async ({ context, data }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    return await wrapServerAction('getCourseById', context, data, async () => {
      const userId = context.session.user.id
      const { id } = data
      const course = await prisma.course.findUnique({
        where: {
          userId,
          id,
        },

        include: { notes: { orderBy: { orderInfo: 'desc' } } },
      })
      if (!course) throw new ServerActionError('Course not found')
      //throw new Error('Testfehler für Logging')
      return course
    })
  })

export type AwaitedReturnTypeGetCourseById = Awaited<
  ReturnType<typeof getCourseById>
>
export const deleteCourseById = authFn
  .inputValidator(courseIdSchema)
  .handler(async ({ context, data }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    return await wrapServerAction(
      'deleteCourseById',
      context,
      data,
      async () => {
        const userId = context.session.user.id
        const { id } = data
        const course = await prisma.course.findUnique({
          where: {
            userId,
            id,
          },
        })
        if (!course) throw new ServerActionError('Course not found')

        //throw new Error('SERVER-Testfehler für Logging')
        //throw new ServerActionError('Testfehlermessage für Client für Logging')
        await prisma.course.delete({
          where: {
            id: course.id,
          },
        })
        return 'Course deleted successfully'
      },
    )
  })

export const getTrainerSuggestionsSchema = withLogging(
  z.object({
    query: z.string(),
  }),
)

export const getTrainerSuggestionsFn = authGetFn
  .inputValidator(getTrainerSuggestionsSchema)
  .handler(async ({ data, context }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')

    return await wrapServerAction(
      'getTrainerSuggestionsFn',
      context,
      data,
      async () => {
        const { query } = data
        const trimmedQuery = query.trim()

        if (trimmedQuery.length < 2) return []

        // Wir holen uns etwas mehr Ergebnisse, um nach der manuellen
        // Bereinigung (Duplicate-Check) sicher 5 Unikate zu haben.
        const suggestions = await prisma.course.findMany({
          where: {
            AND: [
              {
                trainer: {
                  startsWith: trimmedQuery,
                  mode: 'insensitive',
                },
              },
              {
                NOT: {
                  trainer: {
                    in: ['Unbekannter Trainer', ''], // Ausschluss des Placeholders und leerer Strings
                  },
                },
              },
              {
                NOT: {
                  trainer: null, // Sicherstellen, dass keine Null-Werte kommen
                },
              },
            ],
          },
          select: {
            trainer: true,
          },
          // Wir behalten distinct auf DB-Ebene als ersten Filter
          distinct: ['trainer'],
          orderBy: {
            trainer: 'asc',
          },
          take: 20,
        })

        // 2. Schritt: Manuelle Bereinigung für absolute Eindeutigkeit (Case-Insensitive)
        // Das löst das Problem, wenn "John Doe" und "john doe" in der DB stehen.
        const seen = new Set<string>()
        const uniqueResults: string[] = []

        for (const item of suggestions) {
          const name = item.trainer?.trim()
          if (!name) continue

          const lowerName = name.toLowerCase()
          if (!seen.has(lowerName)) {
            seen.add(lowerName)
            uniqueResults.push(name)
          }

          if (uniqueResults.length >= 5) break
        }

        return uniqueResults
      },
    )
  })
