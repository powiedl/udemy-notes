import { prisma } from '#/lib/db.server'
import type { Prisma } from '#/lib/db.server'
import type { TokenIdInput } from '#/schemas/course-public.schema'
import type { CourseNotesSearchInput } from '#/schemas/search-params'
import { ServerActionError } from '#/types/errors'
import { mapNoteDisplayTags } from './note.logic.server'

// #region helper functions
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
