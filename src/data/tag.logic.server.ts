import { prisma } from '#/lib/db.server'
import { isEmpty } from '#/lib/utils'
import { ServerActionError } from '#/types/errors'
// Wir importieren die Typen aus der anderen Datei (import type wird vom Client ignoriert, ist also sicher!)
import type {
  GetAvailableTagsInput,
  GetTagsForSelectorInput,
  DeleteTagInput,
  CreateAndLinkTagToTargetInput,
  RenameTagInput,
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

  if (!tag) throw new ServerActionError('Tag could not be found.')

  await prisma.tag.delete({ where: { id, userId } })
  return 'tag deleted successfully'
}

export async function createAndLinkTagLogic(
  data: CreateAndLinkTagToTargetInput,
  userId: string,
) {
  // FALL 1: KURS
  if (data.targetType === 'course') {
    const course = await prisma.course.findUnique({
      where: { id: data.targetId, userId },
    })
    if (!course) throw new ServerActionError('Course not found or unauthorized')

    await prisma.courseTag.create({
      data: {
        course: { connect: { id: data.targetId } },
        tag: {
          connectOrCreate: {
            where: { name_userId: { name: data.tagName, userId: userId } },
            create: { name: data.tagName, userId: userId },
          },
        },
      },
    })
  }
  // FALL 2: NOTIZ
  else {
    const note = await prisma.note.findUnique({
      where: { id: data.targetId },
      include: { course: true },
    })
    if (!note || note.course.userId !== userId) {
      throw new ServerActionError('Note not found or unauthorized')
    }

    await prisma.noteTag.create({
      data: {
        note: { connect: { id: data.targetId } },
        tag: {
          connectOrCreate: {
            where: { name_userId: { name: data.tagName, userId: userId } },
            create: { name: data.tagName, userId: userId },
          },
        },
      },
    })
  }

  return { success: true }
}

export const renameTagLogic = async (data: RenameTagInput, userId: string) => {
  const { id, newName } = data
  const trimmedNewName = newName.trim().toLowerCase()
  // console.log('--- RENAME REQUEST ---', { id, trimmedNewName, userId })
  const existingTag = await prisma.tag.findUnique({
    where: {
      userId: userId,
      id,
    },
  })

  if (!existingTag) throw new ServerActionError('Tag not found or unauthorized')
  const conflictingTag = await prisma.tag.findMany({
    where: {
      userId,
      name: trimmedNewName,
    },
  })
  if (!isEmpty(conflictingTag)) {
    // console.log('conflictingTag:', conflictingTag)
    throw new ServerActionError(`Tag '${data.newName}' already exists`)
  }
  const updatedTag = await prisma.tag.update({
    where: { id },
    data: { name: trimmedNewName },
  })
  return { success: true, tag: updatedTag }
}

export const getTagUsageCountLogic = async (id: string, userId: string) => {
  // const { prisma } = await import('#/lib/db.server')

  const tag = await prisma.tag.findUnique({
    where: {
      id,
      userId, // Sicherheitscheck: Gehört der Tag dem User?
    },
    include: {
      _count: {
        select: { courses: true, notes: true },
      },
    },
  })

  if (!tag) throw new ServerActionError('Tag not found or unauthorized')

  return tag._count // Gibt z.B. { courses: 5, notes: 12 } zurück
}
