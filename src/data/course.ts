import { prisma } from '#/db'
import { sleep } from '#/lib/utils'
import { authFnMiddleware } from '#/middlewares/auth'
import { createServerFn } from '@tanstack/react-start'

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
    })
    return courses
  })
