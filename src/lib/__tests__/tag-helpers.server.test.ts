import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveTagIds } from '../tag-helpers.server'
import { prisma } from '#/lib/db.server'

// 1. Prisma Modul mocken
vi.mock('#/lib/db.server', () => ({
  prisma: {
    tag: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))

describe('resolveTagIds', () => {
  const userId = 'user-123'

  beforeEach(() => {
    // Setzt die Mocks vor jedem Test zurück, damit keine alten Aufrufe das Ergebnis verfälschen
    vi.clearAllMocks()
  })

  it('1. sollte bestehende Verknüpfungen direkt zurückgeben (kein DB Aufruf)', async () => {
    const existingLinkedTags = [
      { tag: { id: 'tag-1', name: 'html', userId: null } },
    ]

    const result = await resolveTagIds(['html'], userId, existingLinkedTags)

    expect(result).toEqual(['tag-1'])
    // Prisma darf nicht aufgerufen werden, da wir alle Tags schon haben
    expect(prisma.tag.findMany).not.toHaveBeenCalled()
    expect(prisma.tag.create).not.toHaveBeenCalled()
  })

  it('2. sollte das globale Tag verwenden, wenn kein privates existiert', async () => {
    // Mock: Die DB findet nur das globale Tag
    vi.mocked(prisma.tag.findMany).mockResolvedValue([
      {
        id: 'global-tag',
        name: 'react',
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const result = await resolveTagIds(['react'], userId, [])

    expect(result).toEqual(['global-tag'])
    expect(prisma.tag.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.tag.create).not.toHaveBeenCalled()
  })

  it('3. sollte das private Tag bevorzugen, wenn sowohl global als auch privat existieren', async () => {
    // Mock: Die DB findet BEIDE Tags
    vi.mocked(prisma.tag.findMany).mockResolvedValue([
      {
        id: 'global-tag',
        name: 'css',
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'private-tag',
        name: 'css',
        userId: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const result = await resolveTagIds(['css'], userId, [])

    expect(result).toEqual(['private-tag'])
    expect(prisma.tag.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.tag.create).not.toHaveBeenCalled()
  })

  it('4. sollte ein neues privates Tag erstellen, wenn das Tag noch gar nicht existiert', async () => {
    // Mock: Die DB findet nichts
    vi.mocked(prisma.tag.findMany).mockResolvedValue([])
    // Mock: Das Create gibt eine neue ID zurück
    vi.mocked(prisma.tag.create).mockResolvedValue({ id: 'new-tag-id' } as any)

    const result = await resolveTagIds(['neu'], userId, [])

    expect(result).toEqual(['new-tag-id'])
    expect(prisma.tag.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.tag.create).toHaveBeenCalledTimes(1)
    // Prüfen, ob es korrekt als privates Tag angelegt wurde
    expect(prisma.tag.create).toHaveBeenCalledWith({
      data: { name: 'neu', userId: userId },
      select: { id: true },
    })
  })

  it('5. sollte gemischte Szenarien korrekt verarbeiten', async () => {
    const existingLinkedTags = [
      { tag: { id: 'linked-1', name: 'javascript', userId: null } },
    ]

    vi.mocked(prisma.tag.findMany).mockResolvedValue([
      {
        id: 'global-2',
        name: 'typescript',
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    vi.mocked(prisma.tag.create).mockResolvedValue({ id: 'new-3' } as any)

    const result = await resolveTagIds(
      ['javascript', 'typescript', 'python'], // 1. Linked, 2. Global, 3. Neu
      userId,
      existingLinkedTags,
    )

    // Erwartet genau diese drei IDs
    expect(result).toEqual(['linked-1', 'global-2', 'new-3'])

    // findMany sollte nur für "typescript" und "python" aufgerufen werden
    expect(prisma.tag.findMany).toHaveBeenCalledWith({
      where: {
        name: { in: ['typescript', 'python'] },
        OR: [{ userId: userId }, { userId: null }],
      },
    })

    // create sollte nur für "python" aufgerufen werden
    expect(prisma.tag.create).toHaveBeenCalledTimes(1)
  })
})
