import { prisma } from '#/lib/db.lib.server'
import type { Prisma } from '#/generated/prisma/client'
import type {
  CourseNotesSearchInput,
  NoteSearchInput,
} from '#/schemas/search-params.schema'
import { DEFAULT_TAG_COLOR } from '#/schemas/tag.schema'
import type { TagColor } from '#/schemas/tag.schema'
import { ServerActionError } from '#/types/errors.type'
import type { UpdateNoteContentInput } from './note.data'

// Hilfstyp, um TypeScript glücklich zu machen, egal aus welcher Query die Notiz kommt

// --- INPUT TYPES (Was Prisma uns liefert) ---
export type RawTagRelation = {
  tag: {
    id: string
    name: string
    color?: string | null
    userId?: string | null
  }
  status?: string // Optional, da nur bei NoteTag vorhanden
}

export type NoteWithTagsConstraint = {
  tags: RawTagRelation[]
  course?: { tags?: RawTagRelation[] } | null
}

// --- OUTPUT TYPE (Was die UI braucht) ---
export type DisplayTag = {
  tag: { id: string; name: string; color: TagColor; userId: string | null }
  status: string
  isDirect: boolean
  isFromCourse: boolean
}

/**
 * Transformiert eine Notiz für die UI-Anzeige, indem direkte Tags und vom Kurs vererbte Tags zusammengeführt werden.
 *
 * Diese Funktion implementiert die "Tag-Vererbung":
 * 1. Sie sammelt alle Tags, die direkt an der Notiz hängen.
 * 2. Sie sammelt alle Tags des übergeordneten Kurses.
 * 3. Sie dedupliziert die Tags (ein Tag erscheint nur einmal).
 * 4. Sie bewahrt den Status (z.B. 'SUGGESTION' oder 'APPROVED').
 * 5. Sie fügt Metadaten zur Herkunft hinzu (`isDirect`, `isFromCourse`), damit die UI z.B. vererbte Tags optisch absetzen kann.
 * 6. Die resultierende Liste wird alphabetisch sortiert.
 *
 * @param note - Das Notiz-Objekt inklusive seiner Tags und der Kurs-Tags (Relationen).
 * @returns Die Notiz, erweitert um das berechnete `displayTags` Array.
 * @internal
 */
export function mapNoteDisplayTags<T extends NoteWithTagsConstraint>(note: T) {
  // 1. Erstelle Sets für blitzschnellen O(1) Abgleich
  const directTagIds = new Set(note.tags.map((t: RawTagRelation) => t.tag.id))
  const courseTagIds = new Set(
    note.course?.tags?.map((t: RawTagRelation) => t.tag.id) || [],
  )

  // 2. Map bauen, die die relation-Daten NICHT wegwirft
  const allTagsMap = new Map()

  // Zuerst Kurs-Tags rein (sind immer regulär APPROVED)
  note.course?.tags?.forEach((t: RawTagRelation) => {
    allTagsMap.set(t.tag.id, { tag: t.tag, status: 'APPROVED' })
  })

  // Dann direkte Notiz-Tags rein (die haben einen echten status in t.status!)
  // Überschreibt Kurs-Tags, falls es als direct-Tag SUGGESTION oder APPROVED ist
  note.tags.forEach((t: RawTagRelation) => {
    allTagsMap.set(t.tag.id, { tag: t.tag, status: t.status || 'APPROVED' })
  })

  // 3. Neues logisches Format bilden und den geretteten Status anfügen
  const displayTags: DisplayTag[] = Array.from(allTagsMap.values())
    .map(({ tag, status }) => {
      // HIER PASSIERT DIE TYP-UMWANDLUNG:
      // Wir prüfen, ob es ein privates Tag ist (userId).
      // Wenn ja, zwingen wir es auf Typ TagColor oder Default.
      const strictColor = tag.userId
        ? ((tag.color ?? DEFAULT_TAG_COLOR) as TagColor)
        : null

      return {
        tag: {
          ...tag,
          color: strictColor, // color ist jetzt garantiert vom Typ TagColor oder null (bei public tags)
          userId: tag.userId ?? null,
        },
        status: status === 'SUGGESTION' ? 'SUGGESTION' : 'APPROVED',
        isDirect: directTagIds.has(tag.id),
        isFromCourse: courseTagIds.has(tag.id),
      }
    })
    .sort((a, b) => a.tag.name.localeCompare(b.tag.name))

  return {
    ...note,
    displayTags,
  }
}

/**
 * Kern-Logik für den globalen, paginierten Abruf von Notizen eines Benutzers.
 *
 * Besonderheiten:
 * 1. Sicherheits-Check: Es werden nur Notizen abgerufen, deren Kurs dem Benutzer gehört (oder die öffentlich sind).
 * 2. Case-insensitive Volltextsuche über Inhalt, Sektion und Lektion.
 * 3. Komplexe Tag-Suche: Eine Notiz wird gefunden, wenn der Such-Tag direkt an ihr hängt ODER am Kurs (Vererbungs-Suche).
 * 4. Parallele Ausführung von Daten-Abruf und Zählung (Performance).
 * 5. Automatisches Mapping der Anzeige-Tags für jede Notiz.
 *
 * @param data - Die Such- und Sortierparameter (`page`, `pageSize`, `search`, `tagIds`, `sortBy`, `sortOrder`).
 * @param userId - Die ID des Benutzers zur Berechtigungsprüfung.
 * @returns Ein Promise mit den transformierten Notizen (`items`) und der Gesamtanzahl (`totalCount`).
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
            udemyCourseId: true,
            title: true,
            userId: true, // Wichtig fürs Frontend, um zu erkennen, ob es ein fremder Kurs ist
            description: true,
            imageUrl: true,
            courseUrl: true,
            trainerUrl: true,
            trainers: { include: { trainer: true } },
            tags: {
              // NEU: Selektion von userId und color hinzugefügt
              select: {
                tag: {
                  select: { id: true, name: true, userId: true, color: true },
                },
              },
              orderBy: { tag: { name: 'asc' } },
            },
          },
        },
        tags: {
          // NEU: Select explizit gemacht, um color und userId zu holen
          select: {
            status: true,
            tag: {
              select: { id: true, name: true, userId: true, color: true },
            },
          },
          orderBy: { tag: { name: 'asc' } },
        },
      },
    }),
    prisma.note.count({ where }),
  ])

  // Die mappedItems haben nun dank mapNoteDisplayTags perfekt typisierte Farben
  const mappedItems = items.map(mapNoteDisplayTags)
  return { items: mappedItems, totalCount }
}

/**
 * Spezifischer Abruf von Notizen für einen einzelnen Kurs.
 *
 * Im Gegensatz zur globalen Suche ist diese Funktion auf die Kurs-Ansicht optimiert.
 * Sie prüft die Zugehörigkeit des Kurses zum Benutzer und wendet die kurs-spezifischen Filter an.
 *
 * @param courseId - Die ID des Kurses, dessen Notizen geladen werden sollen.
 * @param data - Suchparameter innerhalb des Kurses.
 * @param userId - Die ID des Benutzers zur Berechtigungsprüfung.
 * @returns Ein Promise mit den gemappten Notizen und der Trefferanzahl.
 */
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
            // NEU: color hinzugefügt
            tag: {
              select: { id: true, name: true, userId: true, color: true },
            },
          },
          orderBy: { tag: { name: 'asc' } },
        },
        // Wir laden die Kurs-Daten für DIESE Notizen mit,
        // damit wir die Tag-Vererbung berechnen können!
        course: {
          select: {
            id: true,
            udemyCourseId: true,
            title: true,
            userId: true,
            description: true,
            imageUrl: true,
            courseUrl: true,
            trainerUrl: true,
            trainers: { include: { trainer: true } },
            tags: {
              select: {
                // NEU: color hinzugefügt
                tag: {
                  select: { id: true, name: true, userId: true, color: true },
                },
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

/**
 * Steuert die Verknüpfung von Tags mit einer Notiz (Hinzufügen oder Entfernen).
 *
 * @param data - Objekt mit der `noteId`, `tagId` und der gewünschten `action`.
 * @param userId - Die ID des Benutzers zur Berechtigungsprüfung (Prüfung über den Kurs-Besitzer).
 * @returns Ein Objekt mit `success: true`.
 * @throws ServerActionError wenn die Notiz nicht gefunden wurde oder nicht dem User gehört.
 */
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

/**
 * Aktualisiert den manuell bearbeiteten Inhalt einer Notiz.
 *
 * Da eine manuelle Bearbeitung als Auflösung eines potenziellen Konflikts (nach einem Re-Import)
 * gewertet wird, setzt diese Funktion das `hasConflict` Flag automatisch zurück auf `false`.
 *
 * @param data - Objekt mit `noteId` und dem neuen `content`.
 * @param userId - Die ID des Benutzers zur Berechtigungsprüfung.
 * @returns Das aktualisierte Notiz-Objekt.
 * @throws ServerActionError wenn die Berechtigung fehlt oder die Notiz nicht existiert.
 */
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
