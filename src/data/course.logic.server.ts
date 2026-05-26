import { prisma } from '#/lib/db.lib.server'
import type { Prisma } from '#/lib/db.lib.server'
import { ServerActionError } from '#/types/errors.type'
import type {
  GetCoursesInput,
  CourseIdInput,
  GetTrainerSuggestionsInput,
  RemoveTagFromCourseInput,
  LinkTagToCourseInput,
  CreateAndLinkTagToCourseInput,
  CreateAndLinkTrainerToCourseInput,
  TrainerToCourseInput,
  CreateShareLinkInput,
} from '#/schemas/course.schema'
import { env } from '#/lib/env.lib.server'
// import { mapNoteDisplayTags } from './note.logic.server'

/**
 * Kern-Logik für den paginierten Abruf von Kursen eines Benutzers.
 *
 * Diese Funktion führt folgende Schritte aus:
 * 1. Berechnung der Pagination-Parameter (skip/take).
 * 2. Aufbau einer komplexen Where-Bedingung:
 *    - Filtert strikt nach der `userId`.
 *    - Implementiert eine case-insensitive Suche über den Kurs-Titel ODER den Namen der Trainer.
 *    - Filtert optional nach einer Liste von Tags (OR-Logik).
 * 3. Parallele Ausführung der Datenbankabfragen (Datenabruf + Zählung der Gesamtergebnisse) zur Performance-Optimierung.
 *
 * @param data - Objekt mit den Feldern `page`, `pageSize`, `search` und `tagIds`.
 * @param userId - Die ID des Benutzers, dessen Kurse abgerufen werden sollen.
 * @returns Ein Promise, das ein Objekt mit den Kursen (`items`) und der Gesamtanzahl (`totalCount`) zurückgibt.
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
 * Ruft die Details eines spezifischen Kurses anhand seiner ID ab.
 *
 * Stellt sicher, dass der Kurs dem anfragenden Benutzer gehört und inkludiert
 * Metadaten wie Tags, Trainer und die Anzahl der zugehörigen Notizen.
 *
 * @param data - Objekt mit der `id` des Kurses.
 * @param userId - Die ID des Benutzers zur Berechtigungsprüfung.
 * @returns Ein Promise, das die Kursdaten zurückgibt.
 * @throws ServerActionError wenn der Kurs nicht gefunden wurde.
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
}

/**
 * Löscht einen Kurs und alle damit verbundenen Daten (Kaskadierung über DB-Schema).
 *
 * @param data - Objekt mit der `id` des zu löschenden Kurses.
 * @param userId - Die ID des Benutzers zur Berechtigungsprüfung.
 * @returns Eine Erfolgsmeldung als String.
 * @throws ServerActionError wenn der Kurs nicht gefunden wurde oder nicht dem User gehört.
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
 * Liefert Trainer-Vorschläge basierend auf einer Suchanfrage.
 *
 * Filtert generische Platzhalter aus und sortiert die Ergebnisse nach der
 * Popularität (Anzahl der Kurse) der Trainer in der Datenbank.
 *
 * @param data - Objekt mit dem Suchstring `query`.
 * @returns Ein Promise mit einer Liste von Vorschlägen und einem `hasMore` Flag für UI-Zwecke.
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
 * Entfernt die Verknüpfung zwischen einem Tag und einem Kurs.
 *
 * @param data - Objekt mit `courseId` und `tagId`.
 * @param userId - Die ID des Benutzers zur Berechtigungsprüfung.
 * @returns Ein Objekt mit `success: true`.
 * @throws ServerActionError wenn der Kurs nicht gefunden wurde oder nicht dem User gehört.
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
 * Verknüpft einen bereits existierenden Tag mit einem Kurs.
 *
 * @param data - Objekt mit `courseId` und `tagId`.
 * @param userId - Die ID des Benutzers zur Berechtigungsprüfung.
 * @returns Ein Objekt mit `success: true`.
 * @throws ServerActionError wenn der Kurs nicht gefunden wurde oder nicht dem User gehört.
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
 * Erstellt einen neuen Tag (falls nicht vorhanden) und verknüpft ihn mit einem Kurs.
 *
 * Nutzt `connectOrCreate`, um Duplikate zu vermeiden und Tags benutzerbezogen zu verwalten.
 *
 * @param data - Objekt mit `courseId` und dem Namen des Tags `tagName`.
 * @param userId - Die ID des Benutzers zur Berechtigungsprüfung und Tag-Zuordnung.
 * @returns Ein Objekt mit `success: true`.
 * @throws ServerActionError wenn der Kurs nicht gefunden wurde.
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

/**
 * Verknüpft einen existierenden Trainer mit einem Kurs.
 *
 * @param data - Objekt mit `courseId` und `trainerId`.
 * @param userId - Die ID des Benutzers zur Berechtigungsprüfung des Kurses.
 * @returns Ein Objekt mit `success: true`.
 * @throws ServerActionError wenn der Kurs/Trainer nicht gefunden wurde oder die Verknüpfung bereits existiert.
 */
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

/**
 * Entfernt die Verknüpfung zwischen einem Trainer und einem Kurs.
 *
 * @param data - Objekt mit `courseId` und `trainerId`.
 * @param userId - Die ID des Benutzers zur Berechtigungsprüfung.
 * @returns Ein Objekt mit `success: true`.
 * @throws ServerActionError wenn der Kurs nicht gefunden wurde oder der Trainer nicht zugeordnet war.
 */
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

/**
 * Erstellt einen neuen Trainer (falls nicht vorhanden) und verknüpft ihn mit einem Kurs.
 *
 * @param data - Objekt mit `courseId` und dem Namen des Trainers `trainerName`.
 * @param userId - Die ID des Benutzers zur Berechtigungsprüfung.
 * @returns Ein Objekt mit `success: true`.
 * @throws ServerActionError wenn der Kurs nicht gefunden wurde oder nicht dem User gehört.
 */
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

/**
 * Erstellt oder aktualisiert einen Freigabe-Link (Token) für einen Kurs.
 *
 * @param data - Objekt mit `courseId` und optionalem `expiresAt`.
 * @param userId - Die ID des Benutzers zur Berechtigungsprüfung.
 * @returns Ein Promise mit dem Token-ID, dem Ablaufdatum und der Kurs-ID.
 * @throws ServerActionError wenn der Kurs nicht gefunden wurde.
 */
export async function createShareLinkLogic(
  data: CreateShareLinkInput,
  userId: string,
) {
  let { expiresAt } = data
  if (expiresAt < new Date(Date.now())) {
    expiresAt = new Date(
      Date.now() + env.DEFAULT_AGE_SHARE_LINK_IN_DAYS * 24 * 60 * 60 * 1000,
    )
  }
  const course = await prisma.course.findUnique({
    where: { id: data.courseId, userId },
  })
  if (!course) throw new ServerActionError('Course not found')
  const existingToken = await prisma.courseShareToken.findFirst({
    where: { courseId: data.courseId },
    orderBy: { createdAt: 'desc' },
  })

  let courseShareLink

  // 3. Update oder Create (manueller "Upsert")
  if (existingToken) {
    courseShareLink = await prisma.courseShareToken.update({
      where: { id: existingToken.id }, // Hier können wir sicher updaten, da 'id' @id ist
      data: { expiresAt },
    })
  } else {
    courseShareLink = await prisma.courseShareToken.create({
      data: {
        courseId: data.courseId,
        expiresAt,
      },
    })
  }

  // 4. Ergebnis zurückgeben
  // HINWEIS: Wir geben courseShareLink.id als Token zurück, da dein Prisma-Modell
  // den CUID direkt im ID-Feld generiert.
  return {
    token: courseShareLink.id,
    expiresAt: courseShareLink.expiresAt,
    courseId: courseShareLink.courseId,
  }
}
