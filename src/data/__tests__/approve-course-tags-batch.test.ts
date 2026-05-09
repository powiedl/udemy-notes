import { describe, it, expect, vi, beforeEach } from 'vitest'
import { approveCourseTagsBatchLogic } from '#/data/tag.logic.server'
import { prisma } from '#/lib/db.server'

// 1. Prisma Mock (jetzt mit courseTag UND tag)
vi.mock('#/lib/db.server', () => ({
  prisma: {
    courseTag: {
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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
