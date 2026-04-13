import { authFn, authGetFn } from '#/lib/rpc'
import { ServerActionError } from '#/types/errors'
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

/**
 * Initialisiert die Datenbank mit einem Satz vordefinierter globaler Tags.
 * Diese Tags haben keine userId und sind somit für alle Benutzer sichtbar.
 */
export const createDefaultTags = authFn
  // Kein Validator nötig, da diese Action keine Parameter braucht
  .handler(async ({ context }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    return await wrapServerAction(
      'createDefaultTags',
      context,
      {},
      async () => {
        // Transformation der String-Liste in das Prisma-Datenformat
        const data = defaultTags.map((t) => ({
          name: t,
        }))
        // Massen-Einfügung, wobei bereits existierende Tags (skipDuplicates) ignoriert werden
        await prisma.tag.createMany({ data, skipDuplicates: true })
        return { success: true }
      },
    )
  })

/**
 * Ruft eine paginierte Liste aller verfügbaren Tags ab.
 * Dies beinhaltet sowohl systemweite (globale) Tags als auch private Tags des aktuell angemeldeten Benutzers.
 */
export const getAvailableTagsFn = authGetFn
  .inputValidator(
    // Wir nutzen unser Standard-Schema und geben ihm die globalen Defaults als Fallback für den leeren Aufruf
    withLogging(tagPaginationSchema).default(TAG_PAGINATION_DEFAULTS),
  )
  .handler(async ({ data, context }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    return await wrapServerAction(
      'getAvailableTags',
      context,
      data,
      async () => {
        const userId = context.session.user.id
        // Jetzt heißen die Parameter exakt wie im Leitfaden!
        const { search, page, pageSize } = data
        const skip = (page - 1) * pageSize

        // Filter-Logik: Zeige Tags ohne userId (global) ODER Tags, die dem aktuellen User gehören
        const whereClause = {
          OR: [
            { userId: null, name: { contains: search } }, // Globale Tags
            { userId: userId, name: { contains: search } }, // Eigene Tags
          ],
        }

        // Parallel laden von Daten und Gesamtanzahl für eine performante Pagination
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

/**
 * Ruft alle für den Benutzer relevanten Tags ohne Paginierung ab.
 * Diese Funktion ist optimiert für die Verwendung in UI-Selektoren (z.B. Comboboxen oder Dropdowns).
 */
export const getTagsForSelectorFn = authGetFn
  .inputValidator(withLogging(z.object({})))
  .handler(async ({ data, context }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')

    return await wrapServerAction(
      'getTagsForSelectorFn',
      context,
      data,
      async () => {
        const userId = context.session.user.id

        // Kombinierte Abfrage von globalen und benutzerspezifischen Tags, alphabetisch sortiert
        return await prisma.tag.findMany({
          where: {
            OR: [{ userId: null }, { userId: userId }],
          },
          orderBy: { name: 'asc' },
        })
      },
    )
  })

/**
 * Löscht ein privates Tag des Benutzers anhand seiner ID.
 * Globale Tags können über diese Funktion nicht gelöscht werden, da die Abfrage
 * explizit die Übereinstimmung der userId des Besitzers erzwingt.
 */
export const deleteTagFn = authFn
  .inputValidator(withLogging(z.object({ id: z.string() })))
  .handler(async ({ data, context }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    return await wrapServerAction('deleteTagFn', context, data, async () => {
      const userId = context.session.user.id
      const { id } = data

      // Vorab-Check: Existiert das Tag und gehört es dem anfragenden User?
      const tag = await prisma.tag.findUnique({
        where: {
          userId,
          id,
        },
      })

      // Falls das Tag nicht gefunden wurde (oder global ist), werfen wir einen maskierten Fehler für das Frontend
      if (!tag) throw new ServerActionError('Tag konnte nicht gefunden werden.')

      await prisma.tag.delete({ where: { id, userId } })
      return 'tag deleted successfully'
    })
  })
