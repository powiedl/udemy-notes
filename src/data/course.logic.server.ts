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
//import { mapNoteDisplayTags } from './note.logic.server'

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
    //title: { contains: search, mode: 'insensitive' },
    OR: [
      { title: { contains: search, mode: 'insensitive' } },
      { trainer: { contains: search, mode: 'insensitive' } },
    ],
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
      // WICHTIG: Die notes-Relation ist hier komplett verschwunden!
      tags: {
        select: {
          tag: { select: { id: true, name: true, userId: true } },
        },
        orderBy: { tag: { name: 'asc' } },
      },
      _count: {
        select: { notes: true },
      },
    },
  })

  if (!course) throw new ServerActionError('Course not found')

  // Keine Notiz-Mappings mehr hier. Wir geben den reinen Kurs zurück.
  return course
} /**
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

  // Wir holen uns alle Trainer, die zum Filter passen.
  // Da wir nach Häufigkeit sortieren wollen, nehmen wir ein höheres Limit
  // beim Abrufen, um eine gute Datenbasis für die Zählung zu haben.
  const suggestions = await prisma.course.findMany({
    where: {
      AND: [
        { trainer: { contains: trimmedQuery, mode: 'insensitive' } },
        {
          NOT: {
            trainer: { in: ['Unknown Trainer', '', 'Unbekannter Trainer'] },
          },
        },
        { NOT: { trainer: null } },
      ],
    },
    select: { trainer: true },
    // Wir nehmen hier bewusst kein distinct, weil wir die Anzahl zählen wollen!
  })

  // 1. Zählen der Vorkommen pro normalisiertem Namen
  // Map: lowerCaseName -> { originalName: string, count: number }
  const trainerMap = new Map<string, { name: string; count: number }>()

  for (const item of suggestions) {
    const originalName = item.trainer?.trim()
    if (!originalName) continue

    const lowerName = originalName.toLowerCase()
    const existing = trainerMap.get(lowerName)

    if (existing) {
      existing.count++
      // Optional: Den Namen mit der "schönsten" Schreibweise behalten (z.B. die mit den meisten Großbuchstaben)
      if (
        originalName !== existing.name &&
        originalName.match(/[A-Z]/g)?.length! >
          existing.name.match(/[A-Z]/g)?.length!
      ) {
        existing.name = originalName
      }
    } else {
      trainerMap.set(lowerName, { name: originalName, count: 1 })
    }
  }

  // 2. In Array umwandeln und nach Häufigkeit sortieren
  const sortedTrainers = Array.from(trainerMap.values()).sort((a, b) => {
    // Primär nach Häufigkeit (absteigend)
    if (b.count !== a.count) return b.count - a.count
    // Sekundär alphabetisch (aufsteigend) bei Gleichstand
    return a.name.localeCompare(b.name)
  })

  // 3. Ergebnis limitieren und hasMore berechnen
  const limit = 5
  const result = sortedTrainers.slice(0, limit).map((t) => t.name)
  const hasMore = sortedTrainers.length > limit

  return {
    suggestions: result,
    hasMore,
  }
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
