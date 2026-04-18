import { prisma, Prisma } from '#/lib/db.server'
import { ServerActionError } from '#/types/errors'
import type {
  GetCoursesInput,
  CourseIdInput,
  GetTrainerSuggestionsInput,
  RemoveTagFromCourseInput,
  LinkTagToCourseInput,
  CreateAndLinkTagToCourseInput,
} from './course'
import { mapNoteDisplayTags } from './note.logic.server'

/**
 * Kern-Logik für den Abruf von Kursen (paginiert & gefiltert).
 */
export async function getCoursesLogic(data: GetCoursesInput, userId: string) {
  // Beachte: Wir destrukturieren hier auch tagIds (bzw. greifen darauf zu)
  const { page, pageSize, search, tagIds } = data
  const skip = (page - 1) * pageSize
  const take = pageSize

  // 1. Basis-Where-Bedingung erstellen
  const where: Prisma.CourseWhereInput = {
    userId: userId,
    title: { contains: search, mode: 'insensitive' },
  }

  // 2. Tag-Filterung hinzufügen (OR-Logik)
  if (tagIds && tagIds.length > 0) {
    where.tags = {
      some: {
        tagId: {
          in: tagIds,
        },
      },
    }
  }

  const [courses, totalCount] = await Promise.all([
    prisma.course.findMany({
      where,
      skip,
      take,
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { notes: true } },
        tags: {
          select: {
            tag: { select: { id: true, name: true, userId: true } },
          },
          orderBy: { tag: { name: 'asc' } },
        },
      },
    }),
    prisma.course.count({ where }),
  ])

  return { items: courses, totalCount }
}

/**
 * Ruft einen spezifischen Kurs anhand seiner ID ab.
 */
export async function getCourseByIdLogic(data: CourseIdInput, userId: string) {
  const { id } = data
  const course = await prisma.course.findUnique({
    where: { userId, id },
    include: {
      notes: {
        orderBy: { orderInfo: 'desc' },
        // NEU: Wir müssen die direkten Tags der Notiz mitladen!
        include: {
          tags: {
            select: {
              tag: { select: { id: true, name: true, userId: true } },
            },
          },
        },
      },
      tags: {
        select: {
          tag: { select: { id: true, name: true, userId: true } },
        },
        orderBy: { tag: { name: 'asc' } },
      },
    },
  })

  if (!course) throw new ServerActionError('Course not found')

  // Mapping der Notizen: Wir übergeben die Kurs-Tags dynamisch an jede Notiz,
  // damit die Funktion die Vererbung berechnen kann.
  const mappedNotes = course.notes.map((note) => {
    return mapNoteDisplayTags({
      ...note,
      course: {
        id: course.id,
        title: course.title,
        userId: course.userId,
        trainer: course.trainer,
        tags: course.tags,
      },
    })
  })

  return {
    ...course,
    notes: mappedNotes,
  }
}
/**
 * Löscht einen Kurs.
 */
export async function deleteCourseByIdLogic(
  data: CourseIdInput,
  userId: string,
) {
  const { id } = data
  const course = await prisma.course.findUnique({
    where: { userId, id },
  })
  if (!course) throw new ServerActionError('Course not found')

  await prisma.course.delete({ where: { id: course.id } })
  return 'Course deleted successfully'
}

/**
 * Liefert Trainer-Vorschläge (Unikate).
 */
export async function getTrainerSuggestionsLogic(
  data: GetTrainerSuggestionsInput,
) {
  const { query } = data
  const trimmedQuery = query.trim()
  if (trimmedQuery.length < 2) return []

  const suggestions = await prisma.course.findMany({
    where: {
      AND: [
        { trainer: { startsWith: trimmedQuery, mode: 'insensitive' } },
        { NOT: { trainer: { in: ['Unknown Trainer', ''] } } },
        { NOT: { trainer: null } },
      ],
    },
    select: { trainer: true },
    distinct: ['trainer'],
    orderBy: { trainer: 'asc' },
    take: 20,
  })

  const seen = new Set<string>()
  const uniqueResults: string[] = []

  for (const item of suggestions) {
    const name = item.trainer?.trim()
    if (!name) continue
    const lowerName = name.toLowerCase()
    if (!seen.has(lowerName)) {
      seen.add(lowerName)
      uniqueResults.push(name)
    }
    if (uniqueResults.length >= 5) break
  }

  return uniqueResults
}

/**
 * Security-Check & Löschen einer Tag-Verknüpfung.
 */
export async function removeTagFromCourseLogic(
  data: RemoveTagFromCourseInput,
  userId: string,
) {
  const course = await prisma.course.findUnique({
    where: { id: data.courseId, userId },
  })
  if (!course) throw new ServerActionError('Course not found')

  await prisma.courseTag.delete({
    where: {
      courseId_tagId: { courseId: data.courseId, tagId: data.tagId },
    },
  })
  return { success: true }
}

/**
 * Security-Check & Verknüpfen eines Tags.
 */
export async function linkTagToCourseLogic(
  data: LinkTagToCourseInput,
  userId: string,
) {
  const course = await prisma.course.findUnique({
    where: { id: data.courseId, userId },
  })
  if (!course) throw new ServerActionError('Course not found')

  await prisma.courseTag.create({
    data: { courseId: data.courseId, tagId: data.tagId },
  })
  return { success: true }
}

/**
 * Security-Check, Erstellen & Verknüpfen eines Tags.
 */
export async function createAndLinkTagToCourseLogic(
  data: CreateAndLinkTagToCourseInput,
  userId: string,
) {
  const course = await prisma.course.findUnique({
    where: { id: data.courseId, userId },
  })
  if (!course) throw new ServerActionError('Course not found')

  await prisma.courseTag.create({
    data: {
      course: { connect: { id: data.courseId } },
      tag: {
        connectOrCreate: {
          where: { name_userId: { name: data.tagName, userId: userId } },
          create: { name: data.tagName, userId: userId },
        },
      },
    },
  })
  return { success: true }
}
