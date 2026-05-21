import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ensureTagsExist } from '#/data/tag.logic.server'
import { prisma } from '#/lib/db.lib.server'

// Wir mocken den kompletten Prisma-Client
vi.mock('#/lib/db.lib.server', () => ({
  prisma: {
    tag: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

describe('ensureTagsExist (Das 1-2-3 Tag-Gesetz)', () => {
  const userId = 'user-123'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Gesetz #1: Bevorzugt ein existierendes privates Tag (ohne Upsert)', async () => {
    // Arrange: Mocke die DB so, dass beim ersten findFirst (Suche nach privatem Tag) etwas zurückkommt
    const mockPrivateTag = { id: 'priv-1', name: 'CSS', userId: 'user-123' }
    vi.mocked(prisma.tag.findFirst).mockResolvedValueOnce(mockPrivateTag as any)

    // Act
    const result = await ensureTagsExist(['CSS'], userId)

    // Assert
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(mockPrivateTag)

    // Prüfe, ob die Query exakt richtig gebaut wurde (case-insensitive & user-spezifisch)
    expect(prisma.tag.findFirst).toHaveBeenCalledWith({
      where: {
        name: { equals: 'CSS', mode: 'insensitive' },
        userId: 'user-123',
      },
    })

    // Ganz wichtig: Es durfte kein Upsert ausgeführt werden (kein neues Tag generiert)!
    expect(prisma.tag.upsert).not.toHaveBeenCalled()
  })

  it('Gesetz #2: Nutzt ein globales Tag, wenn kein privates existiert', async () => {
    // Arrange:
    // 1. Aufruf (Privat-Suche) -> null
    // 2. Aufruf (Global-Suche) -> Treffer
    const mockGlobalTag = { id: 'glob-1', name: 'JavaScript', userId: null }
    vi.mocked(prisma.tag.findFirst)
      .mockResolvedValueOnce(null) // Kein privates Tag
      .mockResolvedValueOnce(mockGlobalTag as any) // Aber ein globales Tag!

    // Act
    const result = await ensureTagsExist(['javascript'], userId)

    // Assert
    expect(result[0]).toEqual(mockGlobalTag)

    // Prüfe die zweite Abfrage (Suche nach userId: null)
    expect(prisma.tag.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        name: { equals: 'javascript', mode: 'insensitive' },
        userId: null,
      },
    })

    // Auch hier: Kein neues Tag generiert!
    expect(prisma.tag.upsert).not.toHaveBeenCalled()
  })

  it('Gesetz #3: Erstellt ein neues privates Tag, wenn es weder privat noch global existiert', async () => {
    // Arrange:
    // 1. Aufruf (Privat) -> null
    // 2. Aufruf (Global) -> null
    vi.mocked(prisma.tag.findFirst).mockResolvedValue(null)

    // Upsert mocken
    const newTag = { id: 'new-1', name: 'Svelte', userId: 'user-123' }
    vi.mocked(prisma.tag.upsert).mockResolvedValueOnce(newTag as any)

    // Act
    const result = await ensureTagsExist(['Svelte'], userId)

    // Assert
    expect(result[0]).toEqual(newTag)

    // Prüfe, ob das Upsert mit den richtigen Daten gefeuert wurde
    expect(prisma.tag.upsert).toHaveBeenCalledWith({
      where: { name_userId: { name: 'Svelte', userId: 'user-123' } },
      update: {},
      create: { name: 'Svelte', userId: 'user-123' },
    })
  })

  it('Edge Case: Leeres Array gibt leeres Array zurück, ohne die DB zu belasten', async () => {
    const result = await ensureTagsExist([], userId)
    expect(result).toEqual([])
    expect(prisma.tag.findFirst).not.toHaveBeenCalled()
  })
})
