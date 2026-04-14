import { prisma } from '#/lib/db.server'
import { ServerActionError } from '#/types/errors'
// Wir importieren die Typen aus der anderen Datei (import type wird vom Client ignoriert, ist also sicher!)
import type {
  GetAvailableTagsInput,
  GetTagsForSelectorInput,
  DeleteTagInput,
} from './tag'

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

export const createDefaultTagsLogic = async () => {
  const data = defaultTags.map((t) => ({ name: t }))
  await prisma.tag.createMany({ data, skipDuplicates: true })
  return { success: true }
}

export const getAvailableTagsLogic = async (
  data: GetAvailableTagsInput,
  userId: string,
) => {
  const { search, page, pageSize } = data
  const skip = (page - 1) * pageSize

  const whereClause = {
    OR: [
      {
        userId: null,
        name: { contains: search, mode: 'insensitive' as const },
      },
      {
        userId: userId,
        name: { contains: search, mode: 'insensitive' as const },
      },
    ],
  }

  const [items, totalCount] = await Promise.all([
    prisma.tag.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
      skip,
      take: pageSize,
    }),
    prisma.tag.count({ where: whereClause }),
  ])

  return { items, totalCount }
}

export const getTagsForSelectorLogic = async (
  _data: GetTagsForSelectorInput,
  userId: string,
) => {
  return await prisma.tag.findMany({
    where: {
      OR: [{ userId: null }, { userId: userId }],
    },
    orderBy: { name: 'asc' },
  })
}

export const deleteTagLogic = async (data: DeleteTagInput, userId: string) => {
  const { id } = data
  const tag = await prisma.tag.findUnique({
    where: { userId, id },
  })

  if (!tag) throw new ServerActionError('Tag konnte nicht gefunden werden.')

  await prisma.tag.delete({ where: { id, userId } })
  return 'tag deleted successfully'
}
