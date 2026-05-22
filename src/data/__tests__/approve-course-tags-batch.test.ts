import { describe, it, expect, vi, beforeEach } from 'vitest'
import { approveCourseTagsBatchLogic } from '#/data/tag.logic.server'
import { prisma } from '#/lib/db.lib.server'

// 1. Prisma Mock (jetzt mit courseTag UND tag)
vi.mock('#/lib/db.lib.server', () => ({
  prisma: {
    courseTag: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    noteTag: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    tag: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

describe('approveCourseTagsBatchLogic (Der Shadowing-Staubsauger)', () => {
  const userId = 'user-123'
  const courseId = 'course-1'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Löscht globale Tag-Verknüpfungen (Staubsauger), wenn ein PRIVATES Tag bestätigt wird', async () => {
    const mockPrivateTag = { id: 'priv-1', name: 'CSS', userId: 'user-123' }

    // Arrange: ensureTagsExist ruft tag.findFirst auf. Wir geben direkt das private Tag zurück.
    vi.mocked(prisma.tag.findFirst).mockResolvedValueOnce(mockPrivateTag as any)

    // courseTag.findFirst (für die Prüfung, ob es schon verknüpft ist) -> null
    vi.mocked(prisma.courseTag.findFirst).mockResolvedValueOnce(null)

    // Act
    await approveCourseTagsBatchLogic({ courseId, tagNames: ['CSS'] }, userId)

    // Assert: Der Staubsauger muss exakt für das globale Tag gelaufen sein!
    expect(prisma.courseTag.deleteMany).toHaveBeenCalledTimes(1)
    expect(prisma.courseTag.deleteMany).toHaveBeenCalledWith({
      where: {
        courseId: 'course-1',
        tag: {
          name: { equals: 'CSS', mode: 'insensitive' },
          userId: null,
        },
      },
    })

    // Danach muss das private Tag normal verknüpft werden
    expect(prisma.courseTag.create).toHaveBeenCalledWith({
      data: {
        courseId: 'course-1',
        tagId: 'priv-1',
        status: 'APPROVED',
      },
    })
  })

  it('Lässt globale Tags in Ruhe, wenn ein GLOBALES Tag bestätigt wird', async () => {
    const mockGlobalTag = { id: 'glob-1', name: 'JavaScript', userId: null }

    // Arrange: ensureTagsExist sucht zuerst privat (wir geben null) und dann global (wir geben das Tag)
    vi.mocked(prisma.tag.findFirst)
      .mockResolvedValueOnce(null) // 1. Suche (Privat)
      .mockResolvedValueOnce(mockGlobalTag as any) // 2. Suche (Global)

    vi.mocked(prisma.courseTag.findFirst).mockResolvedValueOnce(null)

    // Act
    await approveCourseTagsBatchLogic(
      { courseId, tagNames: ['JavaScript'] },
      userId,
    )

    // Assert: Der Staubsauger darf NICHT anspringen!
    expect(prisma.courseTag.deleteMany).not.toHaveBeenCalled()

    // Die Verknüpfung wird ganz normal erstellt
    expect(prisma.courseTag.create).toHaveBeenCalledWith({
      data: {
        courseId: 'course-1',
        tagId: 'glob-1',
        status: 'APPROVED',
      },
    })
  })
})

describe('approveCourseTagsBatchLogic (Der Redundanz-Killer)', () => {
  const userId = 'user-123'
  const courseId = 'course-1'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Löscht note-level Vorschläge (SUGGESTION), egal ob das Kurs-Tag privat oder global ist', async () => {
    const mockTag = { id: 'tag-1', name: 'React', userId: null } // Globales Tag

    // Arrange
    vi.mocked(prisma.tag.findFirst)
      .mockResolvedValueOnce(null) // Suche Privat
      .mockResolvedValueOnce(mockTag as any) // Suche Global
    vi.mocked(prisma.courseTag.findFirst).mockResolvedValueOnce(null)

    // Act
    await approveCourseTagsBatchLogic({ courseId, tagNames: ['React'] }, userId)

    // Assert: Der Redundanz-Killer muss mit den korrekten Filtern gerufen werden
    expect(prisma.noteTag.deleteMany).toHaveBeenCalledWith({
      where: {
        note: { courseId: 'course-1' },
        tag: {
          name: { equals: 'React', mode: 'insensitive' },
        },
        status: 'SUGGESTION', // <--- KRITISCH: Darf nur Vorschläge löschen
      },
    })
  })

  it('Schützt bereits bestätigte (APPROVED) Notiz-Zuweisungen vor der Löschung', async () => {
    const mockTag = { id: 'tag-1', name: 'TypeScript', userId: 'user-123' }

    // Arrange
    vi.mocked(prisma.tag.findFirst).mockResolvedValueOnce(mockTag as any)
    vi.mocked(prisma.courseTag.findFirst).mockResolvedValueOnce(null)

    // Act
    await approveCourseTagsBatchLogic(
      { courseId, tagNames: ['TypeScript'] },
      userId,
    )

    // Assert
    // Wir prüfen direkt das Argument des Aufrufs.
    // expect.objectContaining stellt sicher, dass wir nur den Teil prüfen, der uns interessiert.
    expect(prisma.noteTag.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'SUGGESTION',
        }),
      }),
    )
  })

  it('Arbeitet Case-Insensitive, um Redundanzen auch bei Schreibweisen-Unterschieden zu finden', async () => {
    // Wenn das Kurs-Tag "TAILWIND" heißt...
    const mockTag = { id: 'tag-1', name: 'TAILWIND', userId: null }

    vi.mocked(prisma.tag.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockTag as any)
    vi.mocked(prisma.courseTag.findFirst).mockResolvedValueOnce(null)

    // Act
    await approveCourseTagsBatchLogic(
      { courseId, tagNames: ['TAILWIND'] },
      userId,
    )

    // Assert: ...muss der Filter mode: 'insensitive' enthalten, damit auch "tailwind" auf Notizen gelöscht wird
    expect(prisma.noteTag.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tag: {
            name: { equals: 'TAILWIND', mode: 'insensitive' },
          },
        }),
      }),
    )
  })

  it('Führt die Löschung für jedes Tag in einem Batch einzeln aus und summiert korrekt', async () => {
    const tags = [
      { id: 't1', name: 'Node', userId: null },
      { id: 't2', name: 'Prisma', userId: null },
    ]
    vi.mocked(prisma.tag.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(tags[0] as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(tags[1] as any)

    // Simuliere: 2 gelöschte für Node, 5 für Prisma
    vi.mocked(prisma.noteTag.deleteMany)
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 5 })

    const result = await approveCourseTagsBatchLogic(
      { courseId, tagNames: ['Node', 'Prisma'] },
      userId,
    )

    expect(prisma.noteTag.deleteMany).toHaveBeenCalledTimes(2)
    expect(result.removedRedundantSuggestions).toBe(7) // 2 + 5
  })
})
