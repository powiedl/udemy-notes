// src/data/tag.logic.server.ts
import { prisma } from '#/lib/db.server'
import { getNodeEnv, isEmpty } from '#/lib/utils'
import { suggestTagsWithAIBatch } from '#/lib/ai.server'
import { ServerActionError } from '#/types/errors'
import type {
  GetAvailableTagsInput,
  GetTagsForSelectorInput,
  DeleteTagInput,
  CreateAndLinkTagToTargetInput,
  RenameTagInput,
  AutoTagCourseBatchInput,
  NoteTagActionInput,
} from './tag'

const defaultTags = [
  'typescript',
  'javascript',
  'golang',
  'python',
  'react',
  'next-js',
  'html',
  'css',
  'prisma',
  'sql',
  'nest-js',
]

export const createDefaultTagsLogic = async () => {
  const data = defaultTags.map((t) => ({ name: t }))
  await prisma.tag.createMany({ data, skipDuplicates: true })
  return { success: true }
}

export const getAvailableTagsLogic = async (
  data: GetAvailableTagsInput,
  userId: string,
) => {
  const { search, page, pageSize } = data
  const skip = (page - 1) * pageSize

  const whereClause = {
    OR: [
      {
        userId: null,
        name: { contains: search, mode: 'insensitive' as const },
      },
      {
        userId: userId,
        name: { contains: search, mode: 'insensitive' as const },
      },
    ],
  }

  const [items, totalCount] = await Promise.all([
    prisma.tag.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
      skip,
      take: pageSize,
    }),
    prisma.tag.count({ where: whereClause }),
  ])

  return { items, totalCount }
}

export const getTagsForSelectorLogic = async (
  _data: GetTagsForSelectorInput,
  userId: string,
) => {
  return await prisma.tag.findMany({
    where: {
      OR: [{ userId: null }, { userId: userId }],
    },
    orderBy: { name: 'asc' },
  })
}

export const deleteTagLogic = async (data: DeleteTagInput, userId: string) => {
  const { id } = data
  const tag = await prisma.tag.findUnique({
    where: { userId, id },
  })

  if (!tag) throw new ServerActionError('Tag could not be found.')

  await prisma.tag.delete({ where: { id, userId } })
  return 'tag deleted successfully'
}

export async function createAndLinkTagLogic(
  data: CreateAndLinkTagToTargetInput,
  userId: string,
) {
  // FALL 1: KURS
  if (data.targetType === 'course') {
    const course = await prisma.course.findUnique({
      where: { id: data.targetId, userId },
    })
    if (!course) throw new ServerActionError('Course not found or unauthorized')

    await prisma.courseTag.create({
      data: {
        course: { connect: { id: data.targetId } },
        tag: {
          connectOrCreate: {
            where: { name_userId: { name: data.tagName, userId: userId } },
            create: { name: data.tagName, userId: userId },
          },
        },
      },
    })
  }
  // FALL 2: NOTIZ
  else {
    const note = await prisma.note.findUnique({
      where: { id: data.targetId },
      include: { course: true },
    })
    if (!note || note.course.userId !== userId) {
      throw new ServerActionError('Note not found or unauthorized')
    }

    await prisma.noteTag.create({
      data: {
        note: { connect: { id: data.targetId } },
        tag: {
          connectOrCreate: {
            where: { name_userId: { name: data.tagName, userId: userId } },
            create: { name: data.tagName, userId: userId },
          },
        },
      },
    })
  }

  return { success: true }
}

export const renameTagLogic = async (data: RenameTagInput, userId: string) => {
  const { id, newName } = data
  const trimmedNewName = newName.trim().toLowerCase()
  // console.log('--- RENAME REQUEST ---', { id, trimmedNewName, userId })
  const existingTag = await prisma.tag.findUnique({
    where: {
      userId: userId,
      id,
    },
  })

  if (!existingTag) throw new ServerActionError('Tag not found or unauthorized')
  const conflictingTag = await prisma.tag.findMany({
    where: {
      userId,
      name: trimmedNewName,
    },
  })
  if (!isEmpty(conflictingTag)) {
    // console.log('conflictingTag:', conflictingTag)
    throw new ServerActionError(`Tag '${data.newName}' already exists`)
  }
  const updatedTag = await prisma.tag.update({
    where: { id },
    data: { name: trimmedNewName },
  })
  return { success: true, tag: updatedTag }
}

export const getTagUsageCountLogic = async (id: string, userId: string) => {
  // const { prisma } = await import('#/lib/db.server')

  const tag = await prisma.tag.findUnique({
    where: {
      id,
      userId, // Sicherheitscheck: Gehört der Tag dem User?
    },
    include: {
      _count: {
        select: { courses: true, notes: true },
      },
    },
  })

  if (!tag) throw new ServerActionError('Tag not found or unauthorized')

  return tag._count // Gibt z.B. { courses: 5, notes: 12 } zurück
}

// --- Hilfsfunktion: Tags in der DB anlegen/finden ---
// Wird genutzt, um sicherzustellen, dass die von der KI vorgeschlagenen Notiz-Tags
// physisch in der Tag-Tabelle existieren, bevor wir sie als NoteTag verknüpfen.
export async function ensureTagsExist(tagNames: string[], userId: string) {
  if (tagNames.length === 0) return []

  const tagRecords = []
  for (const name of tagNames) {
    // Gesetz #1: Existiert dieses Tag bereits als PRIVATES Tag für den User?
    const privateTag = await prisma.tag.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' }, // Case-insensitive Suche (z.B. für Postgres)
        userId: userId,
      },
    })

    if (privateTag) {
      tagRecords.push(privateTag)
      continue
    }

    // Gesetz #2: Existiert dieses Tag als GLOBALEs Tag?
    const globalTag = await prisma.tag.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        userId: null,
      },
    })

    if (globalTag) {
      tagRecords.push(globalTag)
      continue
    }

    // Gesetz #3: Komplett neu -> Als privates Tag für den User anlegen.
    // Wir nutzen upsert als Fallback gegen Race-Conditions, falls 2 Notizen gleichzeitig das Tag anlegen wollen
    const newPrivateTag = await prisma.tag.upsert({
      where: {
        name_userId: { name, userId },
      },
      update: {},
      create: { name, userId },
    })

    tagRecords.push(newPrivateTag)
  }

  return tagRecords
}

// --- Haupt-Logik: Batch-Processing für einen gesamten Kurs ---
export async function autoTagCourseBatchLogic(
  data: AutoTagCourseBatchInput,
  userId: string,
) {
  const { courseId } = data
  // 1. Kurs inklusive aller Notizen und deren bestehenden Tags laden
  const course = await prisma.course.findUnique({
    where: { id: courseId, userId },
    include: {
      tags: { include: { tag: true } },
      notes: {
        include: { tags: { include: { tag: true } } },
      },
    },
  })

  if (!course) {
    throw new ServerActionError(
      'Course not found or you are not authorized for this course',
    )
  }

  // 2. Globale und private Tags für den KI-Kontext laden
  const allContextTags = await prisma.tag.findMany({
    where: {
      OR: [
        { userId: userId },
        { userId: null }, // Identifikator für globale Tags
      ],
    },
  })

  const globalTags = allContextTags
    .filter((t) => t.userId === null)
    .map((t) => t.name)
  const privateUserTags = allContextTags
    .filter((t) => t.userId === userId)
    .map((t) => t.name)

  // 3. Batch-Payload für die KI aufbauen
  const MAX_COURSE_TAGS = 5
  const MAX_NOTE_TAGS = 5

  const entities = []

  // 3a. Die Kurs-Entität hinzufügen
  entities.push({
    entityId: course.id,
    entityType: 'course' as const,
    contentPayload: {
      title: course.title,
      description: /* course.description || */ '',
    },
    existingTags: course.tags.map((ct) => ct.tag.name),
    maxTotalTags: MAX_COURSE_TAGS,
  })

  // 3b. Alle Notiz-Entitäten hinzufügen
  course.notes.forEach((note) => {
    entities.push({
      entityId: note.id,
      entityType: 'note' as const,
      // ANNAHME: Deine Notiz hat ein Feld 'content' oder 'text'
      contentPayload: {
        content: note.editedContent || note.originalContent || '',
      },
      existingTags: note.tags.map((nt) => nt.tag.name),
      maxTotalTags: MAX_NOTE_TAGS,
    })
  })

  // 4. KI-Service aufrufen (Ein einziger mächtiger Request!)
  const aiResults = await suggestTagsWithAIBatch({
    entities,
    globalTags,
    privateUserTags,
  })

  if (aiResults.length === 0) {
    return { courseTagsSuggested: [], notesProcessed: 0 }
  }

  // 5. Ergebnisse verarbeiten: Trennen in Kurs und Notizen
  const courseResult = aiResults.find((r) => r.entityId === course.id)
  const noteResults = aiResults.filter((r) => r.entityId !== course.id)

  // 6. Notiz-Tags als SUGGESTION in der Datenbank speichern
  // Zuerst sammeln wir alle einzigartigen Tag-Namen der Notizen
  const allSuggestedNoteTagNames = new Set<string>()
  noteResults.forEach((nr) =>
    nr.tags.forEach((t) => allSuggestedNoteTagNames.add(t.name)),
  )

  // Stellen sicher, dass diese Tags in der Haupt-Tabelle existieren
  const dbTags = await ensureTagsExist(
    Array.from(allSuggestedNoteTagNames),
    userId,
  )
  let notesProcessedCount = 0

  // Jetzt verknüpfen wir die Tags mit den Notizen
  for (const noteRes of noteResults) {
    if (noteRes.tags.length === 0) continue

    for (const suggestedTag of noteRes.tags) {
      // 1. Finde das echte DB-Tag case-insensitive
      const dbTag = dbTags.find(
        (t) => t.name.toLowerCase() === suggestedTag.name.toLowerCase(),
      )
      if (!dbTag) continue

      // --- NEU: Der globale Staubsauger (Shadowing auflösen) ---
      // Wenn das Tag, das wir gerade verknüpfen wollen, ein PRIVATES Tag ist...
      if (dbTag.userId !== null) {
        // ...löschen wir vorsorglich die Verknüpfung zu einem gleichnamigen GLOBALEN Tag
        await prisma.noteTag.deleteMany({
          where: {
            noteId: noteRes.entityId,
            tag: {
              name: { equals: dbTag.name, mode: 'insensitive' },
              userId: null, // Ziel: Das globale Tag
            },
          },
        })
      }

      // 2. Prüfen, ob die Verknüpfung mit dem korrekten (privaten oder globalen) Tag schon existiert
      const existingLink = await prisma.noteTag.findFirst({
        where: { noteId: noteRes.entityId, tagId: dbTag.id },
      })

      if (!existingLink) {
        await prisma.noteTag.create({
          data: {
            noteId: noteRes.entityId,
            tagId: dbTag.id,
            status: 'SUGGESTION', // Speichern als Vorschlag!
          },
        })
      }
    }
    notesProcessedCount++
  }

  // 7. Kurs-Tags an den Caller (das Frontend) zurückgeben
  return {
    courseTagsSuggested: courseResult
      ? courseResult.tags.map((t) => {
          const normalizedSearch = t.name.toLowerCase().trim()

          // Gesetz #1: Existierendes privates Tag (höchste Priorität)
          const privateMatch = privateUserTags.find(
            (priv) => priv.toLowerCase() === normalizedSearch,
          )
          if (privateMatch) {
            return {
              name: privateMatch, // Original-Schreibweise aus der DB!
              isNew: false,
              isPrivate: true,
            }
          }

          // Gesetz #2: Existierendes globales Tag
          const globalMatch = globalTags.find(
            (glob) => glob.toLowerCase() === normalizedSearch,
          )
          if (globalMatch) {
            return {
              name: globalMatch, // Original-Schreibweise aus der DB!
              isNew: false,
              isPrivate: false,
            }
          }

          // Gesetz #3: Komplett neues Tag (wird später als privat gespeichert)
          return {
            name: normalizedSearch, // Sauber kleingeschrieben, da neu!
            isNew: true,
            isPrivate: false, // UI zeigt wahrscheinlich den "New" Badge, nicht "Private"
          }
        })
      : [],
    notesProcessed: notesProcessedCount,
  }
}

export async function approveCourseTagsBatchLogic(
  data: { courseId: string; tagNames: string[] },
  userId: string,
) {
  // 1. Ensure tags exist (Using the "1-2-3 Law")
  const dbTags = await ensureTagsExist(data.tagNames, userId)
  let removedRedundantSuggestions = 0

  // 2. Link to course (APPROVED)
  for (const dbTag of dbTags) {
    // --- EXISTING: Global vacuum for courses ---
    // If a private tag is approved, remove a global tag with the same name from the course
    if (dbTag.userId !== null) {
      await prisma.courseTag.deleteMany({
        where: {
          courseId: data.courseId,
          tag: {
            name: { equals: dbTag.name, mode: 'insensitive' },
            userId: null,
          },
        },
      })
    }

    // --- NEW: Redundancy killer for notes ---
    // If tag "A" is approved for the course, delete all "SUGGESTIONS" of "A"
    // on the notes of this course, because they now inherit it anyway.
    const removedNoteSuggestions = await prisma.noteTag.deleteMany({
      where: {
        note: {
          courseId: data.courseId,
        },
        tag: {
          name: { equals: dbTag.name, mode: 'insensitive' },
        },
        status: 'SUGGESTION', // We only clean up AI suggestions, never user-approved tags
      },
    })
    removedRedundantSuggestions += removedNoteSuggestions.count

    // Link or update course tag
    const existing = await prisma.courseTag.findFirst({
      where: { courseId: data.courseId, tagId: dbTag.id },
    })

    if (!existing) {
      await prisma.courseTag.create({
        data: {
          courseId: data.courseId,
          tagId: dbTag.id,
          status: 'APPROVED',
        },
      })
    } else if (existing.status !== 'APPROVED') {
      await prisma.courseTag.update({
        where: { courseId_tagId: { courseId: data.courseId, tagId: dbTag.id } },
        data: { status: 'APPROVED' },
      })
    }
  }

  return { success: true, removedRedundantSuggestions }
}
export async function approveNoteTagLogic(
  data: NoteTagActionInput,
  userId: string,
) {
  // Sicherheitscheck: Gehört die Notiz wirklich dem User?
  const note = await prisma.note.findUnique({
    where: { id: data.noteId, userId },
  })
  if (!note) throw new ServerActionError('Note not found')

  await prisma.noteTag.update({
    where: { noteId_tagId: { noteId: data.noteId, tagId: data.tagId } },
    data: { status: 'APPROVED' },
  })

  return { success: true }
}

export async function rejectNoteTagLogic(
  data: NoteTagActionInput,
  userId: string,
) {
  const note = await prisma.note.findUnique({
    where: { id: data.noteId, userId },
  })
  if (!note) throw new ServerActionError('Note not found')

  // Ablehnen heißt in unserem Fall: Die Verknüpfung wird gelöscht.
  await prisma.noteTag.delete({
    where: { noteId_tagId: { noteId: data.noteId, tagId: data.tagId } },
  })

  return { success: true }
}
