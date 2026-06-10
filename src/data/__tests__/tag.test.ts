import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDeep, mockReset } from 'vitest-mock-extended'
import type { DeepMockProxy } from 'vitest-mock-extended'
import type { PrismaClient, Prisma } from '#/generated/prisma/client'
import { prisma } from '#/lib/db.lib.server'
import {
  createDefaultTagsLogic,
  getAvailableTagsLogic,
  getTagsForSelectorLogic,
  deleteTagLogic,
  createAndLinkTagLogic,
  updateTagLogic,
  getTagUsageCountLogic,
  approveNoteTagLogic,
  rejectNoteTagLogic,
} from '../tag.logic.server'
import { DEFAULT_TAG_COLOR } from '#/schemas/tag.schema'

// 1. Prisma Client mocken
vi.mock('#/lib/db.lib.server', () => ({
  prisma: mockDeep<PrismaClient>(),
}))

// AI Service mocken (wird in der Datei importiert, auch wenn wir die Batch-Logik hier nicht voll durchtesten)
vi.mock('#/lib/ai.lib.server', () => ({
  suggestTagsWithAIBatch: vi.fn(),
}))

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>

// Typisierung für die Mock-Daten, um "as any" zu vermeiden
type Tag = Prisma.TagGetPayload<{}>

describe('Tag Logik Funktionen', () => {
  const userId = 'user_123'

  // Mock-Daten: Eine Mischung aus globalen (userId: null) und privaten Tags
  const globalTag: Tag = {
    id: 'tag_global_1',
    name: 'react',
    userId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    color: null,
  }
  const privateTag: Tag = {
    id: 'tag_private_1',
    name: 'my-custom-tag',
    userId: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
    color: DEFAULT_TAG_COLOR,
  }

  beforeEach(() => {
    mockReset(prismaMock)
  })

  describe('createDefaultTagsLogic', () => {
    it('Erstellt Standard-Tags als Massen-Einfügung und ignoriert Duplikate', async () => {
      // GIVEN
      prismaMock.tag.createMany.mockResolvedValue({ count: 11 })

      // WHEN
      const result = await createDefaultTagsLogic()

      // THEN
      expect(result).toEqual({ success: true })

      // Prüfen, ob Prisma mit skipDuplicates aufgerufen wurde
      expect(prismaMock.tag.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skipDuplicates: true,
          data: expect.any(Array), // Prüft, ob ein Array übergeben wurde
        }),
      )
    })
  })

  describe('getAvailableTagsLogic', () => {
    it('Paginierung & Suche: Ruft globale und eigene Tags ab', async () => {
      // GIVEN
      const expectedTags = [globalTag, privateTag]
      prismaMock.tag.findMany.mockResolvedValue(expectedTags)
      prismaMock.tag.count.mockResolvedValue(2)

      const testData = { page: 2, pageSize: 10, search: 're' }

      // WHEN
      const result = await getAvailableTagsLogic(testData, userId)

      // THEN
      expect(result).toEqual({ items: expectedTags, totalCount: 2 })

      // Prüfen, ob Pagination (skip/take) und der komplexe OR-Filter korrekt sind
      expect(prismaMock.tag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (Page 2 - 1) * 10
          take: 10,
          orderBy: { name: 'asc' },
          where: expect.objectContaining({
            OR: [
              {
                userId: null,
                name: { contains: 're', mode: 'insensitive' },
              },
              {
                userId: userId,
                name: { contains: 're', mode: 'insensitive' },
              },
            ],
          }),
        }),
      )
    })

    it('Liefert eine leere Liste, wenn keine Tags gefunden werden', async () => {
      // GIVEN
      prismaMock.tag.findMany.mockResolvedValue([])
      prismaMock.tag.count.mockResolvedValue(0)

      const testData = { page: 1, pageSize: 10, search: 'gibt-es-nicht' }

      // WHEN
      const result = await getAvailableTagsLogic(testData, userId)

      // THEN
      expect(result).toEqual({ items: [], totalCount: 0 })
    })
  })

  describe('getTagsForSelectorLogic (Deduplizierung & Shadowing)', () => {
    it('sollte private Tags gegenüber globalen Tags bei gleichem Namen bevorzugen', async () => {
      const mockTags = [
        { id: 'glob-1', name: 'React', userId: null },
        { id: 'priv-1', name: 'React', userId: 'user-1' }, // Shadowing!
        { id: 'glob-2', name: 'TypeScript', userId: null },
      ]

      vi.mocked(prisma.tag.findMany).mockResolvedValue(mockTags as any)

      const result = await getTagsForSelectorLogic({}, userId)

      expect(result).toHaveLength(2)
      // Das private React muss gewonnen haben
      const reactTag = result.find((t) => t.name === 'React')
      expect(reactTag?.id).toBe('priv-1')
      expect(reactTag?.userId).toBe('user-1')

      expect(result.map((t) => t.name)).toContain('TypeScript')
    })

    it('sollte Case-Insensitive deduplizieren', async () => {
      const mockTags = [
        { id: 'glob-1', name: 'react', userId: null },
        { id: 'priv-1', name: 'REACT', userId: 'user-1' },
      ]

      vi.mocked(prisma.tag.findMany).mockResolvedValue(mockTags as any)

      const result = await getTagsForSelectorLogic({}, userId)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('REACT') // Das private gewinnt und behält sein Casing
    })

    it('sollte das Ergebnis alphabetisch sortieren', async () => {
      const mockTags = [
        { id: '1', name: 'Zebra', userId: null },
        { id: '2', name: 'Affe', userId: null },
      ]

      vi.mocked(prisma.tag.findMany).mockResolvedValue(mockTags as any)

      const result = await getTagsForSelectorLogic({}, userId)

      expect(result[0].name).toBe('Affe')
      expect(result[1].name).toBe('Zebra')
    })
  })

  describe('deleteTagLogic', () => {
    const tagId = 'tag_private_1'

    it('Happy Path: Löscht das Tag, wenn es dem anfragenden User gehört', async () => {
      // GIVEN: Security-Check via findUnique ist erfolgreich
      prismaMock.tag.findUnique.mockResolvedValue(privateTag)
      prismaMock.tag.delete.mockResolvedValue(privateTag)

      // WHEN
      const result = await deleteTagLogic({ id: tagId }, userId)

      // THEN
      expect(result).toBe('tag deleted successfully')
      expect(prismaMock.tag.delete).toHaveBeenCalledWith({
        where: { id: tagId, userId },
      })
    })

    it('Security Block: Wirft Fehler, wenn das Tag fremd ist, global ist oder nicht existiert', async () => {
      // GIVEN: Security-Check schlägt fehl (findUnique liefert null)
      prismaMock.tag.findUnique.mockResolvedValue(null)

      // WHEN & THEN: Es muss ein Fehler fliegen und delete() darf NIE aufgerufen werden!
      await expect(deleteTagLogic({ id: tagId }, userId)).rejects.toThrow(
        'Tag could not be found.',
      )

      expect(prismaMock.tag.delete).not.toHaveBeenCalled()
    })
  })

  describe('createAndLinkTagLogic', () => {
    it('verknüpft ein Tag erfolgreich mit einem Kurs', async () => {
      prismaMock.course.findUnique.mockResolvedValue({
        id: 'course1',
        userId,
      } as any)
      prismaMock.courseTag.create.mockResolvedValue({} as any)

      await createAndLinkTagLogic(
        {
          targetId: 'course1',
          targetType: 'course',
          tagName: 'NewTag',
          color: 'red',
        },
        userId,
      )

      expect(prismaMock.courseTag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tag: {
              connectOrCreate: expect.objectContaining({
                create: { name: 'NewTag', userId: userId, color: 'red' },
              }),
            },
          }),
        }),
      )
    })

    it('verknüpft ein Tag erfolgreich mit einer Notiz und nutzt Default-Farbe', async () => {
      // Mock: Notiz gehört zu einem Kurs, der dem User gehört
      prismaMock.note.findUnique.mockResolvedValue({
        id: 'note1',
        course: { userId },
      } as any)
      prismaMock.noteTag.create.mockResolvedValue({} as any)

      await createAndLinkTagLogic(
        { targetId: 'note1', targetType: 'note', tagName: 'NewTag' },
        userId,
      )

      expect(prismaMock.noteTag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tag: {
              connectOrCreate: expect.objectContaining({
                create: {
                  name: 'NewTag',
                  userId: userId,
                  color: DEFAULT_TAG_COLOR,
                },
              }),
            },
          }),
        }),
      )
    })

    it('wirft einen Fehler, wenn die Ziel-Notiz einem anderen User gehört', async () => {
      prismaMock.note.findUnique.mockResolvedValue({
        id: 'note1',
        course: { userId: 'anderer-user' },
      } as any)

      await expect(
        createAndLinkTagLogic(
          { targetId: 'note1', targetType: 'note', tagName: 'NewTag' },
          userId,
        ),
      ).rejects.toThrow('Note not found or unauthorized')
    })
  })

  describe('updateTagLogic', () => {
    it('aktualisiert Name und Farbe erfolgreich', async () => {
      prismaMock.tag.findUnique.mockResolvedValue(privateTag)
      prismaMock.tag.findFirst.mockResolvedValue(null) // Kein Namenskonflikt
      prismaMock.tag.update.mockResolvedValue({
        ...privateTag,
        name: 'neu',
        color: 'red',
      })

      const result = await updateTagLogic(
        { id: privateTag.id, newName: 'Neu ', color: 'red' },
        userId,
      )

      expect(result.success).toBe(true)
      expect(prismaMock.tag.update).toHaveBeenCalledWith({
        where: { id: privateTag.id },
        data: { name: 'neu', color: 'red' },
      })
    })

    it('wirft einen Fehler bei Namenskollision', async () => {
      prismaMock.tag.findUnique.mockResolvedValue(privateTag)
      // Simuliere: Ein anderes Tag mit diesem Namen existiert bereits
      prismaMock.tag.findFirst.mockResolvedValue({ id: 'anderes-tag' } as any)

      await expect(
        updateTagLogic(
          { id: privateTag.id, newName: 'existiert-schon' },
          userId,
        ),
      ).rejects.toThrow("Tag 'existiert-schon' already exists")
    })

    it('führt kein Datenbank-Update durch, wenn sich nichts geändert hat', async () => {
      prismaMock.tag.findUnique.mockResolvedValue(privateTag)

      const result = await updateTagLogic(
        { id: privateTag.id, newName: 'my-custom-tag' }, // Name ist identisch
        userId,
      )

      expect(result.success).toBe(true)
      expect(prismaMock.tag.update).not.toHaveBeenCalled()
    })
  })

  describe('getTagUsageCountLogic', () => {
    it('gibt die Zähler für Kurse und Notizen zurück', async () => {
      prismaMock.tag.findUnique.mockResolvedValue({
        ...privateTag,
        _count: { courses: 5, notes: 12 },
      } as any)

      const result = await getTagUsageCountLogic(privateTag.id, userId)

      expect(result).toEqual({ courses: 5, notes: 12 })
    })

    it('wirft einen Fehler, wenn der Tag dem User nicht gehört', async () => {
      prismaMock.tag.findUnique.mockResolvedValue(null)

      await expect(
        getTagUsageCountLogic('fremdes-tag', userId),
      ).rejects.toThrow('Tag not found or unauthorized')
    })
  })

  describe('approveNoteTagLogic & rejectNoteTagLogic', () => {
    it('approveNoteTagLogic aktualisiert den Status auf APPROVED', async () => {
      prismaMock.note.findUnique.mockResolvedValue({
        id: 'note1',
        userId,
      } as any)
      prismaMock.noteTag.update.mockResolvedValue({} as any)

      const result = await approveNoteTagLogic(
        { noteId: 'note1', tagId: 'tag1' },
        userId,
      )

      expect(result.success).toBe(true)
      expect(prismaMock.noteTag.update).toHaveBeenCalledWith({
        where: { noteId_tagId: { noteId: 'note1', tagId: 'tag1' } },
        data: { status: 'APPROVED' },
      })
    })

    it('rejectNoteTagLogic löscht die Verknüpfung', async () => {
      prismaMock.note.findUnique.mockResolvedValue({
        id: 'note1',
        userId,
      } as any)
      prismaMock.noteTag.delete.mockResolvedValue({} as any)

      const result = await rejectNoteTagLogic(
        { noteId: 'note1', tagId: 'tag1' },
        userId,
      )

      expect(result.success).toBe(true)
      expect(prismaMock.noteTag.delete).toHaveBeenCalledWith({
        where: { noteId_tagId: { noteId: 'note1', tagId: 'tag1' } },
      })
    })
  })
})
