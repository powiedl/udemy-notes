import { prisma } from '#/lib/db.lib.server'
import type { Prisma } from '#/lib/db.lib.server'
import type { TokenIdInput } from '#/schemas/course-public.schema'
import type { CourseNotesSearchInput } from '#/schemas/search-params.schema'
import { ServerActionError } from '#/types/errors.type'
import { mapNoteDisplayTags } from './note.logic.server'

// #region helper functions
/**
 * Hilfsfunktion zum Validieren eines Share-Links und Abrufen der verknüpften Kurs-ID.
 *
 * Diese Funktion führt folgende Validierungen durch:
 * 1. Existenzprüfung des Tokens in der Datenbank.
 * 2. Prüfung des Ablaufdatums (expiresAt).
 *
 * @param id - Die ID (CUID) des Share-Tokens.
 * @returns Ein Promise, das die `courseId` des zugehörigen Kurses zurückgibt.
 * @throws ServerActionError wenn der Link nicht existiert oder bereits abgelaufen ist.
 * @internal
 */
async function getCourseIdFromTokenId(id: string): Promise<string> {
  const courseToken = await prisma.courseShareToken.findUnique({
    where: { id },
  })
  if (
    !courseToken ||
    !courseToken.expiresAt ||
    courseToken.expiresAt < new Date(Date.now())
  ) {
    throw new ServerActionError('Course not found or link expired')
  }
  return courseToken.courseId
}
// #endregion

// #region Course
/**
 * Ruft die öffentlichen Details eines Kurses über einen Share-Link ab.
 *
 * Diese Funktion führt folgende Schritte aus:
 * 1. Validierung des Tokens und Ermittlung der Kurs-ID.
 * 2. Parallele Ausführung von zwei Abfragen zur Performance-Optimierung:
 *    - Abruf der Kurs-Stammdaten (inkl. Trainer und Kurs-Tags).
 *    - Aggregation aller Tags, die entweder am Kurs ODER an den zugehörigen Notizen verwendet werden.
 *
 * Dies ermöglicht es dem Frontend, Filter-Optionen für alle im Kurs vorkommenden Tags anzuzeigen,
 * auch wenn diese nur auf Notiz-Ebene existieren.
 *
 * @param data - Objekt mit der `id` des Share-Tokens.
 * @returns Ein Promise mit dem Kurs-Objekt (`course`) und einer Liste aller verfügbaren Tags (`availableTags`).
 * @throws ServerActionError wenn der Kurs trotz gültigem Token nicht gefunden werden kann.
 */
export async function getCourseByTokenIdLogic(data: TokenIdInput) {
  const { id: tokenId } = data
  const courseId = await getCourseIdFromTokenId(tokenId)

  // Promise.all lässt beide Datenbankabfragen gleichzeitig laufen
  const [course, allUsedTags] = await Promise.all([
    // 1. Die normale Kurs-Abfrage
    prisma.course.findUnique({
      where: { id: courseId },
      include: {
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
    }),

    // 2. NEU: Alle Tags des Kurses und seiner Notizen
    prisma.tag.findMany({
      where: {
        OR: [
          // A: Tags, die direkt am Kurs hängen (über die Join-Tabelle CourseTag)
          { courses: { some: { courseId: courseId } } },

          // B: Tags, die an einer Notiz hängen, die wiederum zu diesem Kurs gehört
          { notes: { some: { note: { courseId: courseId } } } },
        ],
      },
      select: {
        id: true,
        name: true,
        userId: true,
      },
      orderBy: { name: 'asc' },
    }),
  ])

  if (!course) throw new ServerActionError('Course not found')

  // Wir geben nun ein Objekt mit dem Kurs und den gesammelten Tags zurück
  return {
    course,
    availableTags: allUsedTags,
  }
}
// #endregion

// #region Notes
/**
 * Ruft die paginierten und gefilterten Notizen eines Kurses über einen Share-Link ab.
 *
 * Der Prozess umfasst:
 * 1. Validierung des Tokens und Abruf der Kurs-ID.
 * 2. Aufbau einer dynamischen Where-Bedingung für die Suche (Sektion, Lektion, Content) und Tag-Filterung.
 * 3. Paralleler Abruf der Notizen (mit Paging) und der Gesamtanzahl der Treffer.
 * 4. Transformation jeder Notiz mittels `mapNoteDisplayTags`, um die Vererbung von Tags vom
 *    übergeordneten Kurs zu berechnen (isInherited-Logik).
 *
 * @param tokenId - Die ID des Share-Tokens aus der URL.
 * @param data - Such- und Pagination-Parameter (`page`, `pageSize`, `search`, `tagIds`).
 * @returns Ein Promise mit den transformierten Notizen (`items`) und der Gesamtzahl (`totalCount`).
 */
export async function getNotesByTokenIdLogic(
  tokenId: string,
  data: CourseNotesSearchInput,
) {
  const { page, pageSize, search, tagIds } = data
  const skip = (page - 1) * pageSize
  const courseId = await getCourseIdFromTokenId(tokenId)

  const where: Prisma.NoteWhereInput = {
    courseId: courseId,
  }

  if (search) {
    where.OR = [
      { section: { contains: search, mode: 'insensitive' } },
      { lecture: { contains: search, mode: 'insensitive' } },
      { originalContent: { contains: search, mode: 'insensitive' } },
      { editedContent: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (tagIds && tagIds.length > 0) {
    where.tags = {
      some: { tagId: { in: tagIds } },
    }
  }

  const [notes, totalCount] = await Promise.all([
    prisma.note.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { orderInfo: 'desc' }, // Deine originale Sortierung!
      include: {
        tags: {
          select: {
            status: true,
            tag: { select: { id: true, name: true, userId: true } },
          },
          orderBy: { tag: { name: 'asc' } },
        },
        // NEU: Wir laden die Kurs-Daten für DIESE Notizen mit,
        // damit wir die Tag-Vererbung berechnen können!
        course: {
          select: {
            id: true,
            title: true,
            userId: true,
            description: true,
            imageUrl: true,
            courseUrl: true,
            trainerUrl: true,
            trainers: { include: { trainer: true } },
            tags: {
              select: {
                tag: { select: { id: true, name: true, userId: true } },
              },
            },
          },
        },
      },
    }),
    prisma.note.count({ where }),
  ])

  // Die Mapping-Magie passiert jetzt exakt hier, bevor die Daten zum Client fließen
  const mappedNotes = notes.map((note) => mapNoteDisplayTags(note))

  return { items: mappedNotes, totalCount }
}
// #endregion
