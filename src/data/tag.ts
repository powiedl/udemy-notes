import { prisma } from '#/db'
import { wrapServerAction, ServerActionError } from '#/lib/server-utils'
import { authFnMiddleware } from '#/middlewares/auth'
import { withLogging } from '#/schemas/api-utils'
import { createServerFn } from '@tanstack/react-start'
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

export const createDefaultTags = createServerFn({ method: 'POST' })
  .middleware([authFnMiddleware])
  // Kein Validator nötig, da diese Action keine Parameter braucht
  .handler(async ({ context }) => {
    return await wrapServerAction(
      'createDefaultTags',
      context,
      {},
      async () => {
        const data = defaultTags.map((t) => ({
          name: t,
        }))
        await prisma.tag.createMany({ data, skipDuplicates: true })
        return { success: true }
      },
    )
  })

export const getAvailableTagsFn = createServerFn({ method: 'GET' })
  .middleware([authFnMiddleware])
  // DIREKTE Übergabe, damit der Client den Typ kennt!
  .inputValidator(withLogging(z.object({ query: z.string().default('') })))
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
        return tags
      },
    )
  })

export const deleteTagFn = createServerFn({ method: 'POST' })
  .middleware([authFnMiddleware])
  .inputValidator(withLogging(z.object({ id: z.string() })))
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

      // Client-freundlicher Fehler statt 404 Page-Redirect
      if (!tag) throw new ServerActionError('Tag konnte nicht gefunden werden.')

      await prisma.tag.delete({ where: { id, userId } })
      return 'tag deleted successfully'
    })
  })
