import { prisma } from '#/db'
import { authFnMiddleware } from '#/middlewares/auth'
import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import z from 'zod'
import { ServerActionError, wrapServerAction } from '#/lib/server-utils'
import { withLogging } from '#/schemas/api-utils'
import { PAGINATION_DEFAULTS, paginationSchema } from '#/schemas/search-params'

const getCoursesSchema = withLogging(
  z.object({
    // Falls du Filter hast, kommen sie hier rein, z.B.:
    // searchTerm: z.string().optional()
    page: z
      .number()
      .catch(PAGINATION_DEFAULTS.page)
      .default(PAGINATION_DEFAULTS.page),
    pageSize: z
      .number()
      .catch(PAGINATION_DEFAULTS.pageSize)
      .default(PAGINATION_DEFAULTS.pageSize),
    search: z
      .string()
      .catch(PAGINATION_DEFAULTS.search)
      .default(PAGINATION_DEFAULTS.search),
  }),
)

export const getCoursesFn = createServerFn({ method: 'GET' })
  .middleware([authFnMiddleware])
  .inputValidator(getCoursesSchema)
  .handler(async ({ data, context }) => {
    //console.log('getCoursesFn,data', data)
    const {
      page = PAGINATION_DEFAULTS.page,
      pageSize = PAGINATION_DEFAULTS.pageSize,
      search = PAGINATION_DEFAULTS.search,
    } = data
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
      //throw new Error('Testfehler für Logging')
      //console.log('getCoursesFn,result:', { items: courses, totalCount })
      return { items: courses, totalCount }
    })
  })

export const getCourseById = createServerFn({ method: 'GET' })
  .middleware([authFnMiddleware])
  .inputValidator((d: unknown) =>
    withLogging(z.object({ id: z.string() })).parse(d),
  )
  .handler(async ({ context, data }) => {
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
      if (!course) throw notFound()
      //throw new Error('Testfehler für Logging')
      return course
    })
  })

export type AwaitedReturnTypeGetCourseById = Awaited<
  ReturnType<typeof getCourseById>
>

export const deleteCourseById = createServerFn({ method: 'POST' })
  .middleware([authFnMiddleware])
  .inputValidator((d: unknown) =>
    withLogging(z.object({ id: z.string() })).parse(d),
  )
  .handler(async ({ context, data }) => {
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
        if (!course) throw notFound()
        await prisma.course.delete({
          where: {
            id: course.id,
          },
        })
        //throw new Error('Testfehler für Logging')
        return 'Course deleted successfully'
      },
    )
  })
