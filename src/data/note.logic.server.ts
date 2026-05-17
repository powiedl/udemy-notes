import { prisma } from '#/lib/db.server'
import type { Prisma } from '#/generated/prisma/client'
import type {
  CourseNotesSearchInput,
  NoteSearchInput,
} from '#/schemas/search-params'
import { ServerActionError } from '#/types/errors'
import type { UpdateNoteContentInput } from './note'

// Hilfstyp, um TypeScript glücklich zu machen, egal aus welcher Query die Notiz kommt
// Minimale Anforderung an ein Tag-Item, das aus der DB kommt
type MinimalTagRelation = {
  tag: { id: string; name: string }
}

// Minimale Anforderung an die Notiz, damit das Mapping funktioniert
type NoteWithTagsConstraint = {
  tags: MinimalTagRelation[]
  course?: { tags?: MinimalTagRelation[] } | null
}

/**
 * Kombiniert direkte Notiz-Tags und vererbte Kurs-Tags, dedupliziert sie
 * und fügt das Flag `isInherited` hinzu.
 */
export function mapNoteDisplayTags<T extends NoteWithTagsConstraint>(note: T) {
  // 1. Erstelle Sets für blitzschnellen O(1) Abgleich
  const directTagIds = new Set(note.tags.map((t: any) => t.tag.id))
  const courseTagIds = new Set(
    note.course?.tags?.map((t: any) => t.tag.id) || [],
  )

  // 2. Map bauen, die die relation-Daten NICHT wegwirft
  const allTagsMap = new Map()

  // Zuerst Kurs-Tags rein (sind immer regulär APPROVED)
  note.course?.tags?.forEach((t: any) => {
    allTagsMap.set(t.tag.id, { tag: t.tag, status: 'APPROVED' })
  })

  // Dann direkte Notiz-Tags rein (die haben einen echten status in t.status!)
  // Überschreibt Kurs-Tags, falls es als direct-Tag SUGGESTION oder APPROVED ist
  note.tags.forEach((t: any) => {
    allTagsMap.set(t.tag.id, { tag: t.tag, status: t.status || 'APPROVED' })
  })

  // 3. Neues logisches Format bilden und den geretteten Status anfügen
  const displayTags = Array.from(allTagsMap.values())
    .map(({ tag, status }) => ({
      tag,
      status, // <--- BINGO! Der Status ist jetzt direkt Teil der displayTags
      isDirect: directTagIds.has(tag.id),
      isFromCourse: courseTagIds.has(tag.id),
    }))
    .sort((a, b) => a.tag.name.localeCompare(b.tag.name))

  return {
    ...note,
    displayTags,
  }
}

/**
 * Kern-Logik für den paginierten Abruf von Notizen.
 * Unterstützt Gruppierung (Sortierung nach Kurs), Volltextsuche und
 * eine Inklusiv-Suche für Tags (Notiz-Tag ODER Kurs-Tag).
 */
export async function getNotesLogic(data: NoteSearchInput, userId: string) {
  const { page, pageSize, search, tagIds, sortBy, sortOrder } = data
  const skip = (page - 1) * pageSize
  const take = pageSize

  // --- 1. FILTER-LOGIK (WHERE) ---

  // Basis-Sicherheit: Entweder gehört der Kurs/die Notiz dem User ODER die Notiz ist öffentlich
  // Hinweis: Falls 'userId' direkt auf der Note liegt, ersetze 'course: { userId }' durch '{ userId }'
  const where: Prisma.NoteWhereInput = {
    OR: [
      { course: { userId: userId } }, // Eigene Notizen
      { isPublic: true }, // Fremde, aber öffentliche Notizen
    ],
  }

  // A. Textsuche (Sucht in Original-Text, editiertem Text, Sektion und Lektion)
  const searchFilter: Prisma.NoteWhereInput | undefined = search
    ? {
        OR: [
          {
            originalContent: { contains: search, mode: 'insensitive' as const },
          },
          { editedContent: { contains: search, mode: 'insensitive' as const } },
          { section: { contains: search, mode: 'insensitive' as const } },
          { lecture: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : undefined

  // B. Tag-Filter (Notiz hat das Tag ODER der übergeordnete Kurs hat das Tag)
  const tagFilter: Prisma.NoteWhereInput | undefined =
    tagIds.length > 0
      ? {
          OR: [
            { tags: { some: { tagId: { in: tagIds } } } },
            { course: { tags: { some: { tagId: { in: tagIds } } } } },
          ],
        }
      : undefined

  // Filter sicher in das `AND`-Array pushen, damit sie sich nicht mit dem Basis-OR überschreiben
  const andConditions: Prisma.NoteWhereInput[] = []

  if (searchFilter) andConditions.push(searchFilter)
  if (tagFilter) andConditions.push(tagFilter)

  if (andConditions.length > 0) {
    where.AND = andConditions
  }

  // --- 2. SORTIER-LOGIK (ORDER BY) ---
  let orderBy:
    | Prisma.NoteOrderByWithRelationInput
    | Prisma.NoteOrderByWithRelationInput[]

  if (sortBy === 'course') {
    orderBy = [{ course: { title: 'asc' } }, { orderInfo: sortOrder }]
  } else {
    orderBy = { [sortBy]: sortOrder }
  }

  // --- 3. DATENBANK-ABFRAGEN ---
  const [items, totalCount] = await Promise.all([
    prisma.note.findMany({
      where,
      skip,
      take,
      orderBy,
      include: {
        course: {
          select: {
            id: true,
            title: true,
            userId: true, // Wichtig fürs Frontend, um zu erkennen, ob es ein fremder Kurs ist
            description: true,
            imageUrl: true,
            courseUrl: true,
            trainerUrl: true,
            trainers: { include: { trainer: true } },
            tags: {
              include: { tag: true },
              orderBy: { tag: { name: 'asc' } },
            },
          },
        },
        tags: {
          include: { tag: true },
          orderBy: { tag: { name: 'asc' } },
        },
      },
    }),
    prisma.note.count({ where }),
  ])
  // throw new ServerActionError('This is a test Server Action Error')

  const mappedItems = items.map(mapNoteDisplayTags)
  return { items: mappedItems, totalCount }
}

export async function getNotesForCourseLogic(
  courseId: string,
  data: CourseNotesSearchInput,
  userId: string,
) {
  const { page, pageSize, search, tagIds } = data
  const skip = (page - 1) * pageSize

  const where: Prisma.NoteWhereInput = {
    courseId: courseId,
    course: { userId: userId },
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

export async function toggleNoteTagLogic(
  data: { noteId: string; tagId: string; action: 'add' | 'remove' },
  userId: string,
) {
  // 1. Sicherheits-Check: Gehört die Notiz zu einem Kurs des Users?
  const note = await prisma.note.findFirst({
    where: { id: data.noteId, course: { userId: userId } },
    select: { id: true },
  })

  if (!note) {
    throw new ServerActionError('Note not found for this user.')
  }

  // 2. Aktion ausführen
  if (data.action === 'add') {
    // Passe dies an das exakte Prisma-Schema an (z.B. Upsert auf der Join-Tabelle)
    await prisma.note
      .update({
        where: { id: data.noteId },
        data: {
          tags: {
            // create oder connectOrCreate, je nach Schema der Join-Tabelle
            create: { tagId: data.tagId },
          },
        },
      })
      .catch(() => {}) // Ignorieren, falls die Verknüpfung schon existiert
  } else {
    // action === 'remove'
    // Passe dies an dein Prisma-Schema an (Löschen des Eintrags in der Join-Tabelle)
    await prisma.note.update({
      where: { id: data.noteId },
      data: {
        tags: {
          deleteMany: { tagId: data.tagId },
        },
      },
    })
  }

  return { success: true }
}

export async function updateNoteContentLogic(
  data: UpdateNoteContentInput,
  userId: string,
) {
  const { noteId, content } = data
  // 1. Berechtigung prüfen & Existenz checken (alles in einem DB-Aufruf)
  const noteExists = await prisma.note.findFirst({
    where: {
      id: noteId,
      userId: userId,
    },
    // select: { id: true } reicht hier als reiner Existenzcheck
    select: { id: true },
  })

  // Wenn keine Notiz gefunden wurde (entweder existiert sie nicht
  // oder sie gehört einem anderen User), brechen wir ab.
  if (!noteExists) {
    throw new ServerActionError(
      'Not authorized to edit this note or note not found.',
    )
  }

  // 2. Update ausführen
  return await prisma.note.update({
    where: { id: noteId },
    data: {
      editedContent: content,
      hasConflict: false,
    },
  })
}
