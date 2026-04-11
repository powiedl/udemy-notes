import { prisma } from '#/db'
import { wrapServerAction, ServerActionError, authFn } from '#/lib/server-utils'
import { withLogging } from '#/schemas/api-utils'
import {
  TAG_PAGINATION_DEFAULTS,
  tagPaginationSchema,
} from '#/schemas/search-params'
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

export const createDefaultTags = authFn()
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

export const getAvailableTagsFn = authFn('GET')
  .inputValidator(
    // Wir nutzen unser Standard-Schema und geben ihm die globalen Defaults als Fallback für den leeren Aufruf
    withLogging(tagPaginationSchema).default(TAG_PAGINATION_DEFAULTS),
  )
  .handler(async ({ data, context }) => {
    return await wrapServerAction(
      'getAvailableTags',
      context,
      data,
      async () => {
        const userId = context.session.user.id
        // Jetzt heißen die Parameter exakt wie im Leitfaden!
        const { search, page, pageSize } = data
        const skip = (page - 1) * pageSize

        const whereClause = {
          OR: [
            { userId: null, name: { contains: search } }, // Globale Tags
            { userId: userId, name: { contains: search } }, // Eigene Tags
          ],
        }

        // Parallel laden für maximale Performance (wie bei den Kursen)
        const [items, totalCount] = await Promise.all([
          prisma.tag.findMany({
            where: whereClause,
            orderBy: { name: 'asc' },
            skip,
            take: pageSize,
          }),
          prisma.tag.count({
            where: whereClause,
          }),
        ])

        return { items, totalCount }
      },
    )
  })

export const deleteTagFn = authFn()
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
