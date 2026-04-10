import { prisma } from '#/db'
import { authFnMiddleware } from '#/middlewares/auth'
import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import z from 'zod'
import { ServerActionError, wrapServerAction } from '#/lib/server-utils'
import { withLogging } from '#/schemas/api-utils'
import { paginationSchema } from '#/schemas/search-params'

// Wir nutzen das zentrale paginationSchema und reichern es mit Logging-Metadaten an.
const getCoursesSchema = withLogging(paginationSchema)

export const getCoursesFn = createServerFn({ method: 'GET' })
  .middleware([authFnMiddleware])
  .inputValidator(getCoursesSchema)
  .handler(async ({ data, context }) => {
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
        //throw new ServerActionError('Testfehler für Logging')
        await prisma.course.delete({
          where: {
            id: course.id,
          },
        })
        return 'Course deleted successfully'
      },
    )
  })
