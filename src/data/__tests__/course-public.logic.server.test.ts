import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getCourseByTokenIdLogic,
  getNotesByTokenIdLogic,
} from '../course-public.logic.server'
import { prisma } from '#/lib/db.lib.server'
import { ServerActionError } from '#/types/errors.type'

// 1. Wir mocken den Prisma-Client komplett
vi.mock('#/lib/db.server', () => ({
  prisma: {
    courseShareToken: { findUnique: vi.fn() },
    course: { findUnique: vi.fn() },
    tag: { findMany: vi.fn() },
    note: { findMany: vi.fn(), count: vi.fn() },
  },
}))

// 2. Wir mocken den Note-Mapper, da wir nur die Logik-Funktion testen wollen
vi.mock('./note.logic.server', () => ({
  mapNoteDisplayTags: vi.fn((note) => ({ ...note, isMapped: true })),
}))

describe('Public Course Logic', () => {
  const validTokenId = 'token-123'
  const courseId = 'course-456'

  // Hilfsdaten für ein gültiges Token (Datum weit in der Zukunft)
  const validTokenRecord = {
    id: validTokenId,
    courseId: courseId,
    createdAt: new Date(Date.now()),
    updatedAt: new Date(Date.now()),
    expiresAt: new Date('2099-01-01'),
  }

  // Setzt die Mocks vor jedem Test zurück
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Token Validation & getCourseByTokenIdLogic', () => {
    it('throws ServerActionError if token does not exist', async () => {
      vi.mocked(prisma.courseShareToken.findUnique).mockResolvedValueOnce(null)

      await expect(
        getCourseByTokenIdLogic({ id: 'invalid-token' }),
      ).rejects.toThrow(
        new ServerActionError('Course not found or link expired'),
      )
    })

    it('throws ServerActionError if token is expired', async () => {
      // Datum in der Vergangenheit
      vi.mocked(prisma.courseShareToken.findUnique).mockResolvedValueOnce({
        ...validTokenRecord,
        expiresAt: new Date('2000-01-01'),
      })

      await expect(
        getCourseByTokenIdLogic({ id: validTokenId }),
      ).rejects.toThrow(
        new ServerActionError('Course not found or link expired'),
      )
    })

    it('returns course and availableTags for a valid token', async () => {
      // Setup Mocks
      vi.mocked(prisma.courseShareToken.findUnique).mockResolvedValueOnce(
        validTokenRecord,
      )
      vi.mocked(prisma.course.findUnique).mockResolvedValueOnce({
        id: courseId,
        title: 'Test Course',
      } as any)
      vi.mocked(prisma.tag.findMany).mockResolvedValueOnce([
        {
          id: 'tag1',
          name: 'React',
          userId: null,
          createdAt: new Date(Date.now()),
          updatedAt: new Date(Date.now()),
        },
        {
          id: 'tag2',
          name: 'Typescript',
          userId: null,
          createdAt: new Date(Date.now()),
          updatedAt: new Date(Date.now()),
        },
      ])

      // Ausführung
      const result = await getCourseByTokenIdLogic({ id: validTokenId })

      // Prüfungen
      expect(result.course.title).toBe('Test Course')
      expect(result.availableTags).toHaveLength(2)

      // Prüfen, ob Prisma parallel und mit den richtigen IDs aufgerufen wurde
      expect(prisma.course.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: courseId } }),
      )
      expect(prisma.tag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        }),
      )
    })
  })

  describe('getNotesByTokenIdLogic', () => {
    const searchParams = {
      page: 2,
      pageSize: 10,
      search: 'API',
      tagIds: ['tag1'],
    }

    it('applies pagination, search and tags correctly to Prisma query', async () => {
      // Setup Mocks
      vi.mocked(prisma.courseShareToken.findUnique).mockResolvedValueOnce(
        validTokenRecord,
      )
      vi.mocked(prisma.note.findMany).mockResolvedValueOnce([
        {
          id: 'note1',
          tags: [],
          course: { tags: [] },
        },
        {
          id: 'note2',
          tags: [],
          course: { tags: [] },
        },
      ] as any)
      vi.mocked(prisma.note.count).mockResolvedValueOnce(25)

      // Ausführung
      const result = await getNotesByTokenIdLogic(validTokenId, searchParams)

      // Prüfungen
      expect(result.items).toHaveLength(2)
      expect(result.items[0]).toHaveProperty('displayTags')
      expect(Array.isArray(result.items[0].displayTags)).toBe(true)
      expect(result.totalCount).toBe(25)

      // Wir prüfen den exakten Prisma-Aufruf für findMany!
      expect(prisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (page 2 - 1) * pageSize 10
          take: 10,
          where: expect.objectContaining({
            courseId: courseId,
            // Prüfen, ob die Tag-Filter angewendet wurden
            tags: { some: { tagId: { in: ['tag1'] } } },
            // Prüfen, ob der Search-String in der OR-Klausel gelandet ist
            OR: expect.arrayContaining([
              expect.objectContaining({
                section: { contains: 'API', mode: 'insensitive' },
              }),
            ]),
          }),
        }),
      )
    })
  })
})
