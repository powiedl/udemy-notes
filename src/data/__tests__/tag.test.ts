import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended'
import type { PrismaClient, Prisma } from '#/generated/prisma/client'

// 1. Prisma Client mocken
vi.mock('#/lib/db.server', () => ({
  prisma: mockDeep<PrismaClient>(),
}))

import { prisma } from '#/lib/db.server'
import {
  createDefaultTagsLogic,
  getAvailableTagsLogic,
  getTagsForSelectorLogic,
  deleteTagLogic,
} from '../tag.logic.server'

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
  }
  const privateTag: Tag = {
    id: 'tag_private_1',
    name: 'my-custom-tag',
    userId: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
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

  describe('getTagsForSelectorLogic', () => {
    it('Liefert alle relevanten Tags ohne Paginierung für Dropdowns', async () => {
      // GIVEN
      const expectedTags = [globalTag, privateTag]
      prismaMock.tag.findMany.mockResolvedValue(expectedTags)

      // WHEN
      const result = await getTagsForSelectorLogic({}, userId)

      // THEN
      expect(result).toEqual(expectedTags)

      // Prüfen, ob keine Pagination-Parameter gesendet wurden und der OR-Filter stimmt
      expect(prismaMock.tag.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ userId: null }, { userId: userId }],
        },
        orderBy: { name: 'asc' },
      })
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
        'Tag konnte nicht gefunden werden.',
      )

      expect(prismaMock.tag.delete).not.toHaveBeenCalled()
    })
  })
})
