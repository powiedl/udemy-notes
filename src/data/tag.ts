import { prisma } from '#/db'
import { wrapServerAction } from '#/lib/server-utils'
import { authFnMiddleware } from '#/middlewares/auth'
import { withLogging } from '#/schemas/api-utils'
import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import z from 'zod'

const defaultTags = [
  'typescript',
  'javascript',
  'golang',
  'python',
  'react',
  'next-js',
  'html',
  'css',
  'prisma',
  'sql',
  'nest-js',
]

export const createDefaultTags = createServerFn({ method: 'POST' }).handler(
  async () => {
    const data = defaultTags.map((t) => ({
      name: t,
    }))
    await prisma.tag.createMany({ data, skipDuplicates: true })
  },
)

export const getAvailableTagsFn = createServerFn({ method: 'GET' })
  .middleware([authFnMiddleware])
  .inputValidator((d: unknown) => {
    // Wir stellen sicher, dass d mindestens ein leeres Objekt ist,
    // damit die inneren Zod-Defaults (query: '') greifen,
    // selbst wenn die Server Function ohne 'data' aufgerufen wurde.
    return withLogging(z.object({ query: z.string().default('') })).parse(
      d ?? {},
    )
  })
  .handler(async ({ data, context }) => {
    return await wrapServerAction(
      'getAvailableTags',
      context,
      data,
      async () => {
        const userId = context.session.user.id
        const { query } = data
        const tags = await prisma.tag.findMany({
          where: {
            OR: [
              { userId: null, name: { contains: query } },
              { userId: userId, name: { contains: query } },
            ],
          },
          orderBy: { name: 'asc' },
        })
        //console.log(tags.length)
        //throw new Error('Testfehler')
        return tags
      },
    )
  })

export const deleteTagFn = createServerFn({ method: 'POST' })
  .middleware([authFnMiddleware])
  .inputValidator((d: unknown) => {
    // Wir stellen sicher, dass d mindestens ein leeres Objekt ist,
    // damit die inneren Zod-Defaults (query: '') greifen,
    // selbst wenn die Server Function ohne 'data' aufgerufen wurde.
    return withLogging(z.object({ id: z.string() })).parse(d ?? {})
  })
  .handler(async ({ data, context }) => {
    return await wrapServerAction('deleteTagFn', context, data, async () => {
      const userId = context.session.user.id
      const { id } = data
      const tag = await prisma.tag.findUnique({
        where: {
          userId,
          id,
        },
      })

      if (!tag) throw notFound()
      //throw new Error('Testfehler')
      await prisma.tag.delete({ where: { id, userId } })
      return 'tag deleted successfully'
    })
  })
