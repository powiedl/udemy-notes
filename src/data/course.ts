import { prisma } from '#/db'
import { sleep } from '#/lib/utils'
import { authFnMiddleware } from '#/middlewares/auth'
import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import z from 'zod'

export const getCoursesFn = createServerFn({ method: 'GET' })
  .middleware([authFnMiddleware])
  .handler(async ({ context }) => {
    await sleep(10)
    const courses = prisma.course.findMany({
      where: {
        userId: context.session.user.id,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      include: { _count: { select: { notes: true } } },
    })
    return courses
  })

export const getCourseById = createServerFn({ method: 'GET' })
  .middleware([authFnMiddleware])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
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
  })

export type AwaitedReturnTypeGetCourseById = Awaited<
  ReturnType<typeof getCourseById>
>
