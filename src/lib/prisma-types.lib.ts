import type { prisma } from '#/lib/db.lib.server' // Importiere deine initialisierte Prisma-Instanz

/**
 * Wir definieren die Struktur. 'as const' ist hier der Schlüssel,
 * damit TypeScript die Verschachtelung der Includes exakt trackt.
 */
const courseWithDetailsArgs = {
  include: {
    tags: { include: { tag: true } },
    notes: {
      include: {
        tags: { include: { tag: true } },
      },
    },
  },
} as const

/**
 * Wir "faken" eine Abfrage mit findFirst (da dort alles optional ist).
 * ReturnType<...> holt uns den Typ der Funktion.
 * Awaited<...> entfernt das Promise.
 */
type FullCourseWithNull = Awaited<
  ReturnType<typeof prisma.course.findFirst<typeof courseWithDetailsArgs>>
>

/**
 * Da findFirst 'null' zurückgeben kann, entfernen wir null mit NonNullable.
 */
export type FullCourse = NonNullable<FullCourseWithNull>

/**
 * Jetzt ist 'notes' garantiert auf FullCourse vorhanden.
 */
export type SingleNote = FullCourse['notes'][number]
