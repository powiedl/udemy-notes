import { prisma } from '#/db'
import { sleep } from '#/lib/utils'
import { authFnMiddleware } from '#/middlewares/auth'
import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import z from 'zod'
import { wrapServerAction } from '#/lib/server-utils'
import { withLogging } from '#/schemas/api-utils'

export const getCoursesFn = createServerFn({ method: 'GET' })
  .middleware([authFnMiddleware])
  .inputValidator((d: unknown) => withLogging(z.object({})).parse(d))
  .handler(async ({ data, context }) => {
    // 2. Achte auf die Reihenfolge der Argumente in wrapServerAction:
    // (serverFunctionName, fn, clientComponent)
    return await wrapServerAction(
      'getCoursesFn',
      async () => {
        await sleep(10)
        // WICHTIG: await vor prisma!
        const courses = await prisma.course.findMany({
          where: {
            userId: context.session.user.id,
          },
          orderBy: {
            updatedAt: 'desc',
          },
          include: { _count: { select: { notes: true } } },
        })
        return courses
      },
      // 3. Zugriff auf die Komponente über loggingMetadata
      data.loggingMetadata?.component,
    )
  })

export const getCourseById = createServerFn({ method: 'GET' })
  .middleware([authFnMiddleware])
  .inputValidator((d: unknown) =>
    withLogging(z.object({ id: z.string() })).parse(d),
  )
  .handler(async ({ context, data }) => {
    return await wrapServerAction(
      'getCourseById',
      async () => {
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
        return course
      },
      data.loggingMetadata?.component,
    )
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
        return 'Course deleted successfully'
      },
      data.loggingMetadata?.component,
    )
  })
