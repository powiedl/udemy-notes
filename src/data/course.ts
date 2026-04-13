'use server'

import z from 'zod'
import { authFn, authGetFn } from '#/lib/rpc'
import { withLogging } from '#/schemas/api-utils'
import { paginationSchema } from '#/schemas/search-params'
import { ServerActionError } from '#/types/errors'
import type { Prisma } from '#/generated/prisma/client.js'

//import { sleep } from '#/lib/utils'

// #region validation schemas
export const courseIdSchema = withLogging(z.object({ id: z.string() }))

export const getTrainerSuggestionsSchema = withLogging(
  z.object({
    query: z.string(),
  }),
)

export const removeTagFromCourseSchema = withLogging(
  z.object({
    courseId: z.string(),
    tagId: z.string(),
  }),
)

export const linkTagToCourseSchema = withLogging(
  z.object({
    courseId: z.string(),
    tagId: z.string(),
  }),
)

export const createAndLinkTagToCourseSchema = withLogging(
  z.object({
    courseId: z.string(),
    tagName: z.string(),
  }),
)
// #endregion

type CourseIdInput = z.infer<typeof courseIdSchema>
type GetTrainerSuggestionsInput = z.infer<typeof getTrainerSuggestionsSchema>
type RemoveTagFromCourseInput = z.infer<typeof removeTagFromCourseSchema>
type LinkTagToCourseInput = z.infer<typeof linkTagToCourseSchema>
type CreateAndLinkTagToCourseInput = z.infer<
  typeof createAndLinkTagToCourseSchema
>

// #region Prisma Datentypen
// 1. Basis-Include für Tags (wird in beiden Fällen genutzt)
const courseBaseInclude = {
  include: {
    tags: {
      select: {
        tag: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
      },
    },
  },
} satisfies Prisma.CourseDefaultArgs

export type CourseHeaderData = Prisma.CourseGetPayload<
  typeof courseBaseInclude
> & {
  _count?: {
    notes: number
  }
  notes?: Prisma.NoteGetPayload<{}>[]
}
// #endregion

// Wir nutzen das zentrale paginationSchema und reichern es mit Logging-Metadaten an.
const getCoursesSchema = withLogging(paginationSchema)

type GetCoursesInput = z.infer<typeof getCoursesSchema>

/**
 * Kern-Logik für den Abruf von Kursen.
 * Berechnet die Pagination, führt die DB-Abfragen parallel aus und transformiert die Daten.
 *
 * @param data - Enthält page, pageSize und den Suchstring.
 * @param userId - Die ID des aktuell authentifizierten Benutzers.
 */
export async function getCoursesLogic(data: GetCoursesInput, userId: string) {
  // Dynamischer Import bleibt erhalten, um Server/Client Leak-Probleme in Vite zu vermeiden
  const { prisma } = await import('#/lib/db.server')

  const { page, pageSize, search } = data
  // Berechnung des Offsets für die Pagination (Seitenzahl -> Datensatz-Index)
  const skip = (page - 1) * pageSize
  const take = pageSize

  // Zentrale Filter-Definition: Nur eigene Kurse und Titel-Suche (ignoriert Groß-/Kleinschreibung)
  const where = {
    userId: userId,
    title: { contains: search, mode: 'insensitive' as const },
  }

  // Performance-Optimierung: Abfrage der Datensätze und der Gesamtanzahl erfolgt parallel,
  // um die Roundtrip-Zeit zur Datenbank zu minimieren.
  const [courses, totalCount] = await Promise.all([
    prisma.course.findMany({
      where,
      skip,
      take,
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        // Anzahl der Notizen für die Anzeige von Badges in der Kursliste
        _count: { select: { notes: true } },
        // Verknüpfte Tags inkl. alphabetischer Sortierung
        tags: {
          select: {
            tag: {
              select: {
                id: true,
                name: true,
                userId: true,
              },
            },
          },
          orderBy: {
            tag: {
              name: 'asc',
            },
          },
        },
      },
    }),
    prisma.course.count({
      where,
    }),
  ])

  return { items: courses, totalCount }
}

/**
 * Authentifizierte Server Function (GET) zum Abrufen der Kursliste.
 * Validiert den Input, stellt den User-Kontext bereit und nutzt getCoursesLogic
 * innerhalb eines Tracing-Wrappers für konsistentes Logging.
 */
export const getCoursesFn = authGetFn
  .inputValidator(getCoursesSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')

    // wrapServerAction sorgt für Request-Tracing (requestId) und Fehler-Maskierung
    return await wrapServerAction('getCoursesFn', context, data, async () => {
      // Delegation an die isolierte Logik-Funktion
      return await getCoursesLogic(data, context.session.user.id)
    })
  })

/**
 * Kern-Logik zum Abrufen eines spezifischen Kurses anhand seiner ID.
 * Überprüft die Zugehörigkeit zum Benutzer und inkludiert Notizen sowie Tags.
 *
 * @param data - Enthält die ID des Kurses.
 * @param userId - Die ID des aktuell authentifizierten Benutzers.
 * @throws {ServerActionError} Wenn der Kurs nicht gefunden wurde oder nicht dem Benutzer gehört.
 */
export const getCourseByIdLogic = async (
  data: CourseIdInput,
  userId: string,
) => {
  const { prisma } = await import('#/lib/db.server')
  const { id } = data
  const course = await prisma.course.findUnique({
    where: {
      userId,
      id,
    },

    include: {
      notes: { orderBy: { orderInfo: 'desc' } },
      tags: {
        select: {
          tag: { select: { id: true, name: true, userId: true } },
        },
        orderBy: { tag: { name: 'asc' } },
      },
    },
  })
  if (!course) throw new ServerActionError('Course not found')
  //throw new Error('Testfehler für Logging')
  return course
}
/**
 * Ruft einen spezifischen Kurs anhand seiner ID ab.
 * Stellt sicher, dass der Kurs dem angemeldeten Benutzer gehört.
 * Inkludiert alle zugehörigen Notizen (absteigend sortiert) und Tags.
 */
export const getCourseById = authGetFn
  .inputValidator(courseIdSchema)
  .handler(async ({ context, data }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    return await wrapServerAction('getCourseById', context, data, async () => {
      const userId = context.session.user.id
      return getCourseByIdLogic(data, userId)
    })
  })

export type AwaitedReturnTypeGetCourseById = Awaited<
  ReturnType<typeof getCourseById>
>

/**
 * Kern-Logik zum Löschen eines Kurses.
 * Überprüft erst die Existenz und Berechtigung, bevor der Kurs gelöscht wird.
 *
 * @param data - Enthält die ID des zu löschenden Kurses.
 * @param userId - Die ID des aktuell authentifizierten Benutzers.
 * @returns Erfolgsmeldung als String.
 * @throws {ServerActionError} Wenn der Kurs nicht gefunden wurde oder nicht dem Benutzer gehört.
 */
export const deleteCourseByIdLogic = async (
  data: CourseIdInput,
  userId: string,
) => {
  const { prisma } = await import('#/lib/db.server')
  const { id } = data
  const course = await prisma.course.findUnique({
    where: {
      userId,
      id,
    },
  })
  if (!course) throw new ServerActionError('Course not found')

  await prisma.course.delete({
    where: {
      id: course.id,
    },
  })
  return 'Course deleted successfully'
}

/**
 * Löscht einen Kurs anhand seiner ID, sofern dieser dem Benutzer gehört.
 */
export const deleteCourseById = authFn
  .inputValidator(courseIdSchema)
  .handler(async ({ context, data }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    return await wrapServerAction(
      'deleteCourseById',
      context,
      data,
      async () => {
        return deleteCourseByIdLogic(data, context.session.user.id)
      },
    )
  })

/**
 * Kern-Logik für Trainer-Namensvorschläge.
 * Durchsucht die Datenbank nach Trainernamen, die mit dem Query starten,
 * filtert Duplikate (case-insensitive) und Platzhalter aus.
 *
 * @param data - Enthält den Suchstring (query).
 * @param _userId - Die ID des Benutzers (aktuell ungenutzt für globale Suche).
 * @returns Liste von bis zu 5 eindeutigen Trainernamen.
 */
export const getTrainerSuggestionsLogic = async (
  data: GetTrainerSuggestionsInput,
  _userId: string, // userId aktuell nicht für Filterung genutzt, aber für Signatur-Konsistenz behalten
) => {
  const { prisma } = await import('#/lib/db.server')
  const { query } = data
  const trimmedQuery = query.trim()

  if (trimmedQuery.length < 2) return []

  // Wir holen uns etwas mehr Ergebnisse, um nach der manuellen
  // Bereinigung (Duplicate-Check) sicher 5 Unikate zu haben.
  const suggestions = await prisma.course.findMany({
    where: {
      AND: [
        {
          trainer: {
            startsWith: trimmedQuery,
            mode: 'insensitive',
          },
        },
        {
          NOT: {
            trainer: {
              in: ['Unbekannter Trainer', ''],
            },
          },
        },
        {
          NOT: {
            trainer: null,
          },
        },
      ],
    },
    select: {
      trainer: true,
    },
    distinct: ['trainer'],
    orderBy: {
      trainer: 'asc',
    },
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
 * Liefert Vorschläge für Trainernamen basierend auf einer Suchanfrage.
 * Durchsucht bestehende Kurse, filtert Platzhalter aus und gibt eine
 * Liste von bis zu 5 eindeutigen Namen (case-insensitive geprüft) zurück.
 */
export const getTrainerSuggestionsFn = authGetFn
  .inputValidator(getTrainerSuggestionsSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')

    return await wrapServerAction(
      'getTrainerSuggestionsFn',
      context,
      data,
      async () => {
        return getTrainerSuggestionsLogic(data, context.session.user.id)
      },
    )
  })

/**
 * Kern-Logik zum Entfernen eines Tags von einem Kurs.
 * Führt einen Sicherheitscheck durch, ob der Kurs dem Benutzer gehört.
 *
 * @param data - Enthält courseId und tagId.
 * @param userId - Die ID des aktuell authentifizierten Benutzers.
 * @returns Erfolgsobjekt.
 * @throws {ServerActionError} Wenn der Kurs nicht gefunden wurde oder nicht dem Benutzer gehört.
 */
export const removeTagFromCourseLogic = async (
  data: RemoveTagFromCourseInput,
  userId: string, // <-- WICHTIG: Unterstrich entfernen!
) => {
  const { prisma } = await import('#/lib/db.server')

  // 1. SECURITY CHECK: Gehört der Kurs dem User?
  const course = await prisma.course.findUnique({
    where: {
      id: data.courseId,
      userId: userId,
    },
  })

  if (!course) {
    throw new ServerActionError('Course not found') // Dieser Text muss zum Test passen
  }

  // 2. LÖSCHEN: Erst wenn der Check bestanden ist, wird gelöscht
  await prisma.courseTag.delete({
    where: {
      courseId_tagId: {
        courseId: data.courseId,
        tagId: data.tagId,
      },
    },
  })

  return { success: true }
}

/**
 * Entfernt die Verknüpfung zwischen einem Tag und einem Kurs (löscht den Eintrag in der Junction-Table).
 */
export const removeTagFromCourseFn = authFn
  .inputValidator(removeTagFromCourseSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')

    return await wrapServerAction(
      'removeTagFromCourseFn',
      context,
      data,
      async () => {
        return removeTagFromCourseLogic(data, context.session.user.id)
      },
    )
  })

/**
 * Kern-Logik zum Verknüpfen eines existierenden Tags mit einem Kurs.
 * Überprüft die Berechtigung des Benutzers für den Kurs.
 *
 * @param data - Enthält courseId und tagId.
 * @param userId - Die ID des aktuell authentifizierten Benutzers.
 * @returns Erfolgsobjekt.
 * @throws {ServerActionError} Wenn der Kurs nicht gefunden wurde oder nicht autorisiert ist.
 */
export const linkTagToCourseLogic = async (
  data: LinkTagToCourseInput,
  userId: string, // Kein Unterstrich mehr
) => {
  const { prisma } = await import('#/lib/db.server')

  // 1. Check: Gehört der Kurs wirklich dem User?
  const course = await prisma.course.findUnique({
    where: { id: data.courseId, userId: userId },
  })
  if (!course) throw new ServerActionError('Course not found or unauthorized')

  // 2. Erstellen
  await prisma.courseTag.create({
    data: { courseId: data.courseId, tagId: data.tagId },
  })
  return { success: true }
}
/**
 * Verknüpft ein bereits existierendes Tag mit einem Kurs.
 */
export const linkTagToCourseFn = authFn
  .inputValidator(linkTagToCourseSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')

    return await wrapServerAction(
      'linkTagToCourseFn',
      context,
      data,
      async () => {
        return linkTagToCourseLogic(data, context.session.user.id)
      },
    )
  })

/**
 * Kern-Logik zum Erstellen eines neuen privaten Tags und dessen Verknüpfung mit einem Kurs.
 * Nutzt connectOrCreate, um Redundanz bei Tags zu vermeiden.
 *
 * @param data - Enthält courseId und den Namen des neuen Tags (tagName).
 * @param userId - Die ID des aktuell authentifizierten Benutzers.
 * @returns Erfolgsobjekt.
 */
export const createAndLinkTagToCourseLogic = async (
  data: CreateAndLinkTagToCourseInput,
  userId: string,
) => {
  const { prisma } = await import('#/lib/db.server')
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
 * Erstellt ein neues privates Tag für den Benutzer (falls es noch nicht existiert)
 * und verknüpft es sofort mit dem angegebenen Kurs.
 */
export const createAndLinkTagToCourseFn = authFn
  .inputValidator(createAndLinkTagToCourseSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')

    return await wrapServerAction(
      'createAndLinkTagToCourseFn',
      context,
      data,
      async () => {
        return createAndLinkTagToCourseLogic(data, context.session.user.id)
      },
    )
  })
