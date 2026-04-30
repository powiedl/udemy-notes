import { prisma } from '#/lib/db.server'
import type { Prisma } from '#/lib/db.server'
import { ServerActionError } from '#/types/errors'
import type {
  GetCoursesInput,
  CourseIdInput,
  GetTrainerSuggestionsInput,
  RemoveTagFromCourseInput,
  LinkTagToCourseInput,
  CreateAndLinkTagToCourseInput,
  CreateAndLinkTrainerToCourseInput,
  TrainerToCourseInput,
} from './course'
// import { mapNoteDisplayTags } from './note.logic.server'

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
    // title: { contains: search, mode: 'insensitive' },
    OR: [
      { title: { contains: search, mode: 'insensitive' } },
      {
        trainers: {
          some: {
            trainer: { name: { contains: search, mode: 'insensitive' } },
          },
        },
      },
    ],
  }

  // 2. Tag-Filterung hinzufügen (OR-Logik)
  if (tagIds.length > 0) {
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
        trainers: {
          include: {
            trainer: true,
          },
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
      trainers: {
        include: {
          trainer: true,
        },
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
  // console.log(
  //   '💥 SERVER WIRD GEFRAGT NACH: query',
  //   query,
  //   'trimmedQuery:',
  //   trimmedQuery,
  // )

  const limit = 5

  // 1. Trainer direkt aus der Trainer-Tabelle holen
  // Wir filtern nach Namen und sortieren nach der Anzahl der verknüpften Kurse
  const trainers = await prisma.trainer.findMany({
    where: {
      name: { contains: trimmedQuery, mode: 'insensitive' },
      NOT: {
        name: { in: ['Unknown Trainer', '', 'Unbekannter Trainer'] },
      },
    },
    select: {
      id: true,
      name: true,
    },
    // Wir sortieren nach der Anzahl der Kurse, die diesem Trainer zugewiesen sind (absteigend)
    // Wenn das bei dir in Prisma _count heißt, nutzen wir das:
    orderBy: {
      courses: {
        _count: 'desc',
      },
    },
    // Wir holen einen Eintrag mehr als wir brauchen, um "hasMore" effizient zu ermitteln
    take: limit + 1,
  })

  // 2. hasMore berechnen und Array auf das eigentliche Limit zuschneiden
  const hasMore = trainers.length > limit
  const result = trainers
    .slice(0, limit)
    .map((t) => ({ id: t.id, name: t.name }))

  // console.log('💥 PRISMA ERGEBNIS:', result)

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

export async function addTrainerToCourseLogic(
  data: TrainerToCourseInput,
  userId: string,
) {
  const course = await prisma.course.findUnique({
    where: { id: data.courseId, userId },
    include: {
      trainers: {
        include: {
          trainer: true,
        },
      },
    },
  })
  if (!course) throw new ServerActionError('Course not found')
  const trainer = await prisma.trainer.findUnique({
    where: {
      id: data.trainerId,
    },
  })
  if (!trainer) {
    throw new ServerActionError('Trainer not found')
  }
  console.log(course.trainers)
  if (course.trainers.map((t) => t.trainerId).includes(data.trainerId)) {
    throw new ServerActionError('Trainer is already assigned to the course')
  }

  await prisma.courseTrainer.create({
    data: {
      courseId: data.courseId,
      trainerId: data.trainerId,
    },
  })

  return { success: true }
}

export async function removeTrainerFromCourseLogic(
  data: TrainerToCourseInput,
  userId: string,
) {
  const course = await prisma.course.findUnique({
    where: { id: data.courseId, userId },
    include: {
      trainers: {
        include: {
          trainer: true,
        },
      },
    },
  })
  if (!course) throw new ServerActionError('Course not found')
  if (!course.trainers.map((t) => t.trainerId).includes(data.trainerId))
    throw new ServerActionError('Trainer is not assigned to the course')

  await prisma.courseTrainer.delete({
    where: {
      courseId_trainerId: {
        courseId: data.courseId,
        trainerId: data.trainerId,
      },
    },
  })

  return { success: true }
}

export async function createAndLinkTrainerToCourseLogic(
  data: CreateAndLinkTrainerToCourseInput,
  userId: string,
) {
  const course = await prisma.course.findUnique({
    where: { id: data.courseId, userId },
  })
  if (!course) throw new ServerActionError('Course not found')

  await prisma.courseTrainer.create({
    data: {
      course: { connect: { id: data.courseId } },
      trainer: {
        connectOrCreate: {
          where: { name: data.trainerName },
          create: { name: data.trainerName },
        },
      },
    },
  })
  return { success: true }
}
