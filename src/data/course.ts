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
// #endregion

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

/**
 * Ruft eine paginierte Liste von Kursen für den aktuell angemeldeten Benutzer ab.
 * Unterstützt die Suche nach dem Kurstitel (case-insensitive) und gibt zusätzlich
 * die Anzahl der Notizen pro Kurs sowie die verknüpften Tags zurück.
 */
export const getCoursesFn = authGetFn
  .inputValidator(getCoursesSchema)
  .handler(async ({ data, context }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { page, pageSize, search } = data
    return await wrapServerAction('getCoursesFn', context, data, async () => {
      const skip = (page - 1) * pageSize
      const take = pageSize
      // WICHTIG: await vor prisma!
      const [courses, totalCount] = await Promise.all([
        prisma.course.findMany({
          where: {
            userId: context.session.user.id,
            title: { contains: search, mode: 'insensitive' },
          },
          skip,
          take,
          orderBy: {
            updatedAt: 'desc',
          },
          include: {
            _count: { select: { notes: true } },
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
          where: {
            userId: context.session.user.id,
            title: { contains: search, mode: 'insensitive' },
          },
        }),
      ])
      //console.log('totalCount', totalCount)
      //throw new ServerActionError('Testfehler für Logging')
      //console.log('getCoursesFn,result:', { items: courses, totalCount })
      return { items: courses, totalCount }
    })
  })

/**
 * Ruft einen spezifischen Kurs anhand seiner ID ab.
 * Stellt sicher, dass der Kurs dem angemeldeten Benutzer gehört.
 * Inkludiert alle zugehörigen Notizen (absteigend sortiert) und Tags.
 */
export const getCourseById = authGetFn
  .inputValidator(courseIdSchema)
  .handler(async ({ context, data }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    return await wrapServerAction('getCourseById', context, data, async () => {
      const userId = context.session.user.id
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
    })
  })

export type AwaitedReturnTypeGetCourseById = Awaited<
  ReturnType<typeof getCourseById>
>

/**
 * Löscht einen Kurs anhand seiner ID, sofern dieser dem Benutzer gehört.
 */
export const deleteCourseById = authFn
  .inputValidator(courseIdSchema)
  .handler(async ({ context, data }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    return await wrapServerAction(
      'deleteCourseById',
      context,
      data,
      async () => {
        const userId = context.session.user.id
        const { id } = data
        const course = await prisma.course.findUnique({
          where: {
            userId,
            id,
          },
        })
        if (!course) throw new ServerActionError('Course not found')

        //throw new Error('SERVER-Testfehler für Logging')
        //throw new ServerActionError('Testfehlermessage für Client für Logging')
        await prisma.course.delete({
          where: {
            id: course.id,
          },
        })
        return 'Course deleted successfully'
      },
    )
  })

/**
 * Liefert Vorschläge für Trainernamen basierend auf einer Suchanfrage.
 * Durchsucht bestehende Kurse, filtert Platzhalter aus und gibt eine
 * Liste von bis zu 5 eindeutigen Namen (case-insensitive geprüft) zurück.
 * Erfordert mindestens 2 Zeichen im Suchstring.
 */
export const getTrainerSuggestionsFn = authGetFn
  .inputValidator(getTrainerSuggestionsSchema)
  .handler(async ({ data, context }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')

    return await wrapServerAction(
      'getTrainerSuggestionsFn',
      context,
      data,
      async () => {
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
                    in: ['Unbekannter Trainer', ''], // Ausschluss des Placeholders und leerer Strings
                  },
                },
              },
              {
                NOT: {
                  trainer: null, // Sicherstellen, dass keine Null-Werte kommen
                },
              },
            ],
          },
          select: {
            trainer: true,
          },
          // Wir behalten distinct auf DB-Ebene als ersten Filter
          distinct: ['trainer'],
          orderBy: {
            trainer: 'asc',
          },
          take: 20,
        })

        // 2. Schritt: Manuelle Bereinigung für absolute Eindeutigkeit (Case-Insensitive)
        // Das löst das Problem, wenn "John Doe" und "john doe" in der DB stehen.
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
      },
    )
  })

/**
 * Entfernt die Verknüpfung zwischen einem Tag und einem Kurs (löscht den Eintrag in der Junction-Table).
 */
export const removeTagFromCourseFn = authFn
  .inputValidator(
    withLogging(
      z.object({
        courseId: z.string(),
        tagId: z.string(),
      }),
    ),
  )
  .handler(async ({ data, context }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')

    return await wrapServerAction(
      'removeTagFromCourseFn',
      context,
      data,
      async () => {
        // Wir löschen nur den Eintrag in der Junction-Table
        await prisma.courseTag.delete({
          where: {
            courseId_tagId: {
              courseId: data.courseId,
              tagId: data.tagId,
            },
          },
        })
        return { success: true }
      },
    )
  })

// src/data/course.ts

/**
 * Verknüpft ein bereits existierendes Tag mit einem Kurs.
 */
export const linkTagToCourseFn = authFn
  .inputValidator(
    withLogging(
      z.object({
        courseId: z.string(),
        tagId: z.string(),
      }),
    ),
  )
  .handler(async ({ data, context }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')

    return await wrapServerAction(
      'linkTagToCourseFn',
      context,
      data,
      async () => {
        await prisma.courseTag.create({
          data: {
            courseId: data.courseId,
            tagId: data.tagId,
          },
        })
        return { success: true }
      },
    )
  })

/**
 * Erstellt ein neues privates Tag für den Benutzer (falls es noch nicht existiert)
 * und verknüpft es sofort mit dem angegebenen Kurs.
 */
export const createAndLinkTagToCourseFn = authFn
  .inputValidator(
    withLogging(
      z.object({
        courseId: z.string(),
        tagName: z.string(),
      }),
    ),
  )
  .handler(async ({ data, context }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')

    return await wrapServerAction(
      'createAndLinkTagToCourseFn',
      context,
      data,
      async () => {
        const userId = context.session.user.id

        await prisma.courseTag.create({
          data: {
            // WICHTIG: Hier 'course' statt 'courseId' nutzen
            course: {
              connect: { id: data.courseId },
            },
            // Jetzt ist auch das 'tag' Objekt für TypeScript wieder sichtbar
            tag: {
              connectOrCreate: {
                where: {
                  name_userId: {
                    name: data.tagName,
                    userId: userId,
                  },
                },
                create: {
                  name: data.tagName,
                  userId: userId,
                },
              },
            },
          },
        })
        return { success: true }
      },
    )
  })
