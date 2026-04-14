import { prisma } from '#/lib/db.server'
import type { Prisma } from '#/generated/prisma/client'
import type { NoteSearchInput } from '#/schemas/search-params'

/**
 * Kern-Logik für den paginierten Abruf von Notizen.
 * Unterstützt Gruppierung (Sortierung nach Kurs), Volltextsuche und
 * eine Inklusiv-Suche für Tags (Notiz-Tag ODER Kurs-Tag).
 */
export async function getNotesLogic(data: NoteSearchInput, userId: string) {
  const { page, pageSize, search, tagIds, sortBy, sortOrder } = data
  const skip = (page - 1) * pageSize
  const take = pageSize

  // --- 1. FILTER-LOGIK (WHERE) ---

  // Basis-Sicherheit: Entweder gehört der Kurs/die Notiz dem User ODER die Notiz ist öffentlich
  // Hinweis: Falls 'userId' direkt auf der Note liegt, ersetze 'course: { userId }' durch '{ userId }'
  const where: Prisma.NoteWhereInput = {
    OR: [
      { course: { userId: userId } }, // Eigene Notizen
      { isPublic: true }, // Fremde, aber öffentliche Notizen
    ],
  }

  // A. Textsuche (Sucht in Original-Text, editiertem Text, Sektion und Lektion)
  const searchFilter: Prisma.NoteWhereInput | undefined = search
    ? {
        OR: [
          {
            originalContent: { contains: search, mode: 'insensitive' as const },
          },
          { editedContent: { contains: search, mode: 'insensitive' as const } },
          { section: { contains: search, mode: 'insensitive' as const } },
          { lecture: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : undefined

  // B. Tag-Filter (Notiz hat das Tag ODER der übergeordnete Kurs hat das Tag)
  const tagFilter: Prisma.NoteWhereInput | undefined =
    tagIds && tagIds.length > 0
      ? {
          OR: [
            { tags: { some: { tagId: { in: tagIds } } } },
            { course: { tags: { some: { tagId: { in: tagIds } } } } },
          ],
        }
      : undefined

  // Filter sicher in das `AND`-Array pushen, damit sie sich nicht mit dem Basis-OR überschreiben
  const andConditions: Prisma.NoteWhereInput[] = []

  if (searchFilter) andConditions.push(searchFilter)
  if (tagFilter) andConditions.push(tagFilter)

  if (andConditions.length > 0) {
    where.AND = andConditions
  }

  // --- 2. SORTIER-LOGIK (ORDER BY) ---
  let orderBy:
    | Prisma.NoteOrderByWithRelationInput
    | Prisma.NoteOrderByWithRelationInput[]

  if (sortBy === 'course') {
    orderBy = [{ course: { title: 'asc' } }, { orderInfo: sortOrder }]
  } else {
    orderBy = { [sortBy]: sortOrder }
  }

  // --- 3. DATENBANK-ABFRAGEN ---
  const [items, totalCount] = await Promise.all([
    prisma.note.findMany({
      where,
      skip,
      take,
      orderBy,
      include: {
        course: {
          select: {
            id: true,
            title: true,
            userId: true, // Wichtig fürs Frontend, um zu erkennen, ob es ein fremder Kurs ist
            tags: {
              include: { tag: true },
              orderBy: { tag: { name: 'asc' } },
            },
          },
        },
        tags: {
          include: { tag: true },
          orderBy: { tag: { name: 'asc' } },
        },
      },
    }),
    prisma.note.count({ where }),
  ])

  return { items, totalCount }
}
