import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended'
import type { PrismaClient } from '#/generated/prisma/client'

// 1. Prisma Client mocken
vi.mock('#/lib/db.server', () => ({
  prisma: mockDeep<PrismaClient>(),
}))

import { prisma } from '#/lib/db.server'
import { getNotesLogic } from '../note.logic.server'

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>

describe('getNotesLogic', () => {
  const userId = 'user_123'

  // Wir definieren uns ein sauberes Default-Objekt für die Tests,
  // um nicht in jedem Test alle Pagination-Werte neu schreiben zu müssen.
  const defaultInput = {
    page: 1,
    pageSize: 10,
    search: '',
    tagIds: [],
    sortBy: 'course' as const,
    sortOrder: 'asc' as const,
  }

  beforeEach(() => {
    mockReset(prismaMock)
    // Standard-Mock-Antworten für die Promise.all Aufrufe
    prismaMock.note.findMany.mockResolvedValue([] as any)
    prismaMock.note.count.mockResolvedValue(0)
  })

  describe('Basis & Security', () => {
    it('Holt eigene und öffentliche Notizen inkl. korrekter Pagination', async () => {
      // --- WHEN ---
      const testData = { ...defaultInput, page: 2, pageSize: 5 }
      await getNotesLogic(testData, userId)

      // --- THEN ---
      expect(prismaMock.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5, // (Page 2 - 1) * 5
          take: 5,
          where: expect.objectContaining({
            // SECURITY CHECK: Das Root-OR muss vorhanden sein!
            OR: [{ course: { userId: userId } }, { isPublic: true }],
          }),
        }),
      )
    })
  })

  describe('Volltext-Suche', () => {
    it('Sucht in Original-Text, Editiertem Text, Sektion und Lektion', async () => {
      // --- WHEN ---
      await getNotesLogic({ ...defaultInput, search: 'React Context' }, userId)

      // --- THEN ---
      expect(prismaMock.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              // Prüft, ob das Such-OR-Array im AND-Array landet
              expect.objectContaining({
                OR: [
                  {
                    originalContent: {
                      contains: 'React Context',
                      mode: 'insensitive',
                    },
                  },
                  {
                    editedContent: {
                      contains: 'React Context',
                      mode: 'insensitive',
                    },
                  },
                  {
                    section: { contains: 'React Context', mode: 'insensitive' },
                  },
                  {
                    lecture: { contains: 'React Context', mode: 'insensitive' },
                  },
                ],
              }),
            ]),
          }),
        }),
      )
    })
  })

  describe('Tag-Filterung', () => {
    it('Filtert auf Notizen, die das Tag selbst oder über den Kurs haben', async () => {
      // --- WHEN ---
      await getNotesLogic(
        { ...defaultInput, tagIds: ['tag_1', 'tag_2'] },
        userId,
      )

      // --- THEN ---
      expect(prismaMock.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: [
                  { tags: { some: { tagId: { in: ['tag_1', 'tag_2'] } } } },
                  {
                    course: {
                      tags: { some: { tagId: { in: ['tag_1', 'tag_2'] } } },
                    },
                  },
                ],
              }),
            ]),
          }),
        }),
      )
    })

    it('Kombiniert Textsuche und Tag-Filter sicher', async () => {
      // --- WHEN ---
      await getNotesLogic(
        { ...defaultInput, search: 'Test', tagIds: ['tag_1'] },
        userId,
      )

      // --- THEN ---
      // Wir prüfen den Aufruf des Mocks ab, um die Liste im AND-Array zu checken
      const callArgs = prismaMock.note.findMany.mock.calls[0][0]
      const andConditions = callArgs?.where?.AND as any[]

      expect(andConditions).toHaveLength(2) // 1x Search, 1x Tags
    })
  })

  describe('Sortierung', () => {
    it('Gruppiert-Modus: Sortiert nach Kurs-Titel und dann nach Order-Info', async () => {
      // --- WHEN ---
      await getNotesLogic(
        { ...defaultInput, sortBy: 'course', sortOrder: 'desc' },
        userId,
      )

      // --- THEN ---
      expect(prismaMock.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { course: { title: 'asc' } }, // Kurs immer ASC (alphabetisch) gruppiert
            { orderInfo: 'desc' }, // Reihenfolge innerhalb des Kurses
          ],
        }),
      )
    })

    it('Flacher Modus: Sortiert strikt chronologisch ohne Kurs-Gruppierung', async () => {
      // --- WHEN ---
      await getNotesLogic(
        { ...defaultInput, sortBy: 'createdAt', sortOrder: 'desc' },
        userId,
      )

      // --- THEN ---
      expect(prismaMock.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      )
    })
  })
})
