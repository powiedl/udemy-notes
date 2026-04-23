import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDeep, DeepMockProxy, mockReset } from 'vitest-mock-extended'
import type { PrismaClient, Prisma } from '#/generated/prisma/client'

// 1. Prisma Client mocken - Simpel & direkt
vi.mock('#/lib/db.server', () => ({
  prisma: mockDeep<PrismaClient>(),
}))

import { prisma } from '#/lib/db.server'
import {
  getCoursesLogic,
  getCourseByIdLogic,
  deleteCourseByIdLogic,
  getTrainerSuggestionsLogic,
  removeTagFromCourseLogic,
  linkTagToCourseLogic,
  createAndLinkTagToCourseLogic,
} from '../course.logic.server'

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>

// Dieser Typ repräsentiert exakt das, was findMany inkl. deiner includes zurückgibt
type CourseWithRelations = Prisma.CourseGetPayload<{
  include: {
    _count: { select: { notes: true } }
    tags: {
      select: { tag: { select: { id: true; name: true; userId: true } } }
    }
    trainers: {
      select: { trainer: { select: { id: true; name: true } } }
    }
  }
}>

// Die Factory füllt alle fehlenden Felder mit Standardwerten auf
function createMockCourse(
  overrides: Partial<CourseWithRelations>,
): CourseWithRelations {
  return {
    id: 'default-id',
    title: 'Default Title',
    userId: 'user_123',
    trainers: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { notes: 0 },
    tags: [],
    // Überschreibe die Standards mit den spezifischen Werten für diesen Test
    ...overrides,
  }
}

describe('getCoursesLogic', () => {
  const userId = 'user_12345'
  const differentUserId = 'user_23456'

  // Alle theoretisch in der DB vorhandenen Kurse
  const mockCourses = [
    createMockCourse({ id: 'c1', title: 'React Testing', userId }),
    createMockCourse({
      id: 'c2',
      title: 'React Testing',
      userId: differentUserId,
    }),
    createMockCourse({ id: 'c3', title: 'Typescript Essentials', userId }),
    createMockCourse({
      id: 'c4',
      title: 'Typescript Essentials',
      userId: differentUserId,
    }),
    createMockCourse({ id: 'c5', title: 'Cooking Essentials', userId }),
  ]

  beforeEach(() => {
    mockReset(prismaMock)
  })

  it('Happy Path: Ruft eine Liste von Kursen für einen User erfolgreich ab', async () => {
    // WICHTIG: Wir definieren hier das erwartete ERGEBNIS der Datenbank-Abfrage.
    // Da wir nach 'React' und 'user_12345' suchen, würde eine echte DB nur den 1. Kurs liefern.
    // Also weisen wir den Mock an, auch nur dieses eine Element (als Array) zurückzugeben!
    const expectedDbResult = [mockCourses[0]]
    const testData = {
      page: 1,
      pageSize: 10,
      search: 'React', // <--- FIX THIS (was 'Javascript')
      tagIds: [],
      trainer: '',
    }

    prismaMock.course.findMany.mockResolvedValue(expectedDbResult as any)
    prismaMock.course.count.mockResolvedValue(1)

    // --- WHEN ---
    const result = await getCoursesLogic(testData, userId)

    // --- THEN ---
    // Wir prüfen, ob unsere Funktion das Datenbank-Ergebnis sauber durchreicht
    expect(result).toEqual({ items: expectedDbResult, totalCount: 1 })

    // Der wichtigste Teil: Hat unsere Funktion der Datenbank gesagt, dass sie
    // nach 'React' und 'user_12345' filtern soll?
    expect(prismaMock.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 10,
        where: expect.objectContaining({
          userId: userId,
          OR: [
            { title: { contains: 'React', mode: 'insensitive' } }, // 'React', 'Javascript' oder 'e' je nach Test
            {
              trainers: {
                some: {
                  trainer: { name: { contains: 'React', mode: 'insensitive' } },
                },
              },
            }, // Muss denselben Suchbegriff haben wie title!
          ],
        }),
      }),
    )
  })

  it('Happy Path: Ruft eine leere Liste von Kursen für einen User erfolgreich ab', async () => {
    // --- GIVEN ---
    const expectedDbResult: Array<(typeof mockCourses)[number]> = []
    const testData = {
      page: 1,
      pageSize: 10, // <--- FIX THIS (was 2)
      search: 'Javascript', // <--- FIX THIS (was 'e')
      tagIds: [],
      trainer: '',
    }
    prismaMock.course.findMany.mockResolvedValue(expectedDbResult as any)
    prismaMock.course.count.mockResolvedValue(0)

    // --- WHEN ---
    // Wir rufen direkt die neue Logik-Funktion auf!
    const result = await getCoursesLogic(testData, userId)

    // --- THEN ---
    expect(result).toEqual({ items: expectedDbResult, totalCount: 0 })

    // Prüfen, ob Prisma richtig aufgerufen wurde
    expect(prismaMock.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 10,
        where: expect.objectContaining({
          userId: userId,
          OR: [
            { title: { contains: 'Javascript', mode: 'insensitive' } }, // 'React', 'Javascript' oder 'e' je nach Test
            {
              trainers: {
                some: {
                  trainer: {
                    name: { contains: 'Javascript', mode: 'insensitive' },
                  },
                },
              },
            },
          ], // Muss denselben Suchbegriff haben wie title!
        }),
      }),
    )
  })

  describe('Pagination & Suche', () => {
    // Wir definieren den genauen Typ für unsere Mock-Ergebnisse, um "as any" loszuwerden
    type CourseArray = Array<(typeof mockCourses)[number]>

    it('Seite 1: Berechnet skip=0 und take=2 korrekt', async () => {
      // --- GIVEN ---
      const expectedDbResult: CourseArray = [mockCourses[0], mockCourses[2]]
      const testData = {
        page: 1, // <--- FIX THIS (was 2)
        pageSize: 2,
        search: 'e',
        tagIds: [],
        trainer: '',
      }
      prismaMock.course.findMany.mockResolvedValue(expectedDbResult)
      prismaMock.course.count.mockResolvedValue(3)

      // --- WHEN ---
      const result = await getCoursesLogic(testData, userId)

      // --- THEN ---
      expect(result).toEqual({ items: expectedDbResult, totalCount: 3 })
      expect(prismaMock.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 2,
          where: expect.objectContaining({
            userId: userId,
            OR: [
              { title: { contains: 'e', mode: 'insensitive' } }, // 'React', 'Javascript' oder 'e' je nach Test
              {
                trainers: {
                  some: {
                    trainer: { name: { contains: 'e', mode: 'insensitive' } },
                  },
                },
              },
            ], // Muss denselben Suchbegriff haben wie title!
          }),
        }),
      )
    })

    it('Seite 2: Berechnet skip=2 und take=2 korrekt', async () => {
      // --- GIVEN ---
      const expectedDbResult: CourseArray = [mockCourses[4]]
      const testData = {
        page: 2, // <--- FIX THIS (was 1)
        pageSize: 2, // <--- FIX THIS (was 10)
        search: 'e', // <--- FIX THIS (was 'React')
        tagIds: [],
        trainer: '',
      }
      prismaMock.course.findMany.mockResolvedValue(expectedDbResult)
      prismaMock.course.count.mockResolvedValue(3)

      // --- WHEN ---
      const result = await getCoursesLogic(testData, userId)

      // --- THEN ---
      expect(result).toEqual({ items: expectedDbResult, totalCount: 3 })

      // Da wir in einem NEUEN 'it'-Block sind, hat das beforeEach()
      // den Mock-Speicher vorher geleert. toHaveBeenCalledWith ist hier absolut sicher!
      expect(prismaMock.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 2,
          take: 2,
          where: expect.objectContaining({
            userId: userId,
            OR: [
              { title: { contains: 'e', mode: 'insensitive' } }, // 'React', 'Javascript' oder 'e' je nach Test
              {
                trainers: {
                  some: {
                    trainer: { name: { contains: 'e', mode: 'insensitive' } },
                  },
                },
              },
            ], // Muss denselben Suchbegriff haben wie title!
          }),
        }),
      )
    })
  })
})

describe('getCourseByIdLogic', () => {
  const userId = 'user_123'
  const courseId = 'course_abc'

  beforeEach(() => {
    mockReset(prismaMock)
  })

  it('Happy Path: Gibt den Kurs erfolgreich zurück, wenn er gefunden wurde', async () => {
    // --- GIVEN ---
    const mockCourseData = {
      id: courseId,
      title: 'Single Course Test',
      userId,
      notes: [],
      tags: [],
    }
    prismaMock.course.findUnique.mockResolvedValue(mockCourseData as any)

    // --- WHEN ---
    const result = await getCourseByIdLogic({ id: courseId }, userId)

    // --- THEN ---
    expect(result).toEqual(mockCourseData)
    expect(prismaMock.course.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: courseId, userId },
      }),
    )
  })

  it('Error: Wirft einen Fehler, wenn der Kurs nicht gefunden wird', async () => {
    // --- GIVEN ---
    prismaMock.course.findUnique.mockResolvedValue(null)

    // --- WHEN & THEN ---
    // Wir prüfen hier auf die Nachricht, die in der Logic definiert ist
    await expect(
      getCourseByIdLogic({ id: 'non-existent' }, userId),
    ).rejects.toThrow('Course not found')
  })
})

describe('deleteCourseByIdLogic', () => {
  const userId = 'user_123'
  const courseId = 'course_456'

  beforeEach(() => mockReset(prismaMock))

  it('Happy Path: Löscht den Kurs erfolgreich, wenn er existiert', async () => {
    prismaMock.course.findUnique.mockResolvedValue({
      id: courseId,
      userId,
    } as any)
    prismaMock.course.delete.mockResolvedValue({ id: courseId } as any)

    const result = await deleteCourseByIdLogic({ id: courseId }, userId)

    expect(result).toBe('Course deleted successfully')
    expect(prismaMock.course.delete).toHaveBeenCalledWith({
      where: { id: courseId },
    })
  })

  it('Error: Wirft Fehler wenn der Kurs nicht gefunden wird', async () => {
    prismaMock.course.findUnique.mockResolvedValue(null)

    await expect(
      deleteCourseByIdLogic({ id: 'wrong-id' }, userId),
    ).rejects.toThrow('Course not found')
  })
})

describe('getTrainerSuggestionsLogic', () => {
  beforeEach(() => mockReset(prismaMock))

  it('sollte die Namen aus der Trainer-Tabelle korrekt extrahieren', async () => {
    // Da die Sortierung jetzt die Datenbank (Prisma) übernimmt,
    // simulieren wir einfach das, was Prisma uns fertig zurückgibt.
    const mockTrainers = [
      { name: 'Maximilian Müller' },
      { name: 'Sarah Schmidt' },
      { name: 'Zebra Trainer' },
    ]

    // WICHTIG: Wir mocken jetzt prisma.trainer, nicht mehr prisma.course!
    prismaMock.trainer.findMany.mockResolvedValue(mockTrainers as any)

    const result = await getTrainerSuggestionsLogic({ query: '' })

    // Check, ob die Map-Logik funktioniert und die Strings korrekt ankommen
    expect(result.suggestions[0]).toBe('Maximilian Müller')
    expect(result.suggestions[1]).toBe('Sarah Schmidt')
    expect(result.suggestions[2]).toBe('Zebra Trainer')
    expect(result.suggestions).toHaveLength(3)
  })

  it('sollte hasMore korrekt auf true setzen, wenn das Limit überschritten wird', async () => {
    // Wir simulieren 6 verschiedene Trainer (das Backend-Limit ist intern auf 5 gesetzt, wir holen limit + 1)
    const mockTrainers = [
      { name: 'T1' },
      { name: 'T2' },
      { name: 'T3' },
      { name: 'T4' },
      { name: 'T5' },
      { name: 'T6' },
    ]

    prismaMock.trainer.findMany.mockResolvedValue(mockTrainers as any)

    const result = await getTrainerSuggestionsLogic({ query: '' })

    // Es sollten nur 5 zurückkommen, aber hasMore muss true sein
    expect(result.suggestions).toHaveLength(5)
    expect(result.hasMore).toBe(true)
  })

  it('sollte den Filter (contains) korrekt an die Trainer-Tabelle weitergeben', async () => {
    prismaMock.trainer.findMany.mockResolvedValue([])

    await getTrainerSuggestionsLogic({ query: 'Schmidt' })

    // Prüfen, ob Prisma in der TRAINER-Tabelle mit dem richtigen Namens-Filter aufgerufen wurde
    expect(prismaMock.trainer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: { contains: 'Schmidt', mode: 'insensitive' },
        }),
      }),
    )
  })
})

describe('Tag Management Logic', () => {
  const userId = 'user_123'
  const courseId = 'course_456'
  const tagId = 'tag_789'

  beforeEach(() => mockReset(prismaMock))

  // --- removeTagFromCourseLogic Tests ---
  it('removeTagFromCourseLogic: Löscht den Eintrag, wenn Kurs dem User gehört', async () => {
    // GIVEN: Der Sicherheits-Check findet den Kurs
    prismaMock.course.findUnique.mockResolvedValue({
      id: courseId,
      userId,
    } as any)

    // WHEN
    const result = await removeTagFromCourseLogic({ courseId, tagId }, userId)

    // THEN
    expect(result).toEqual({ success: true })
    expect(prismaMock.courseTag.delete).toHaveBeenCalledWith({
      where: { courseId_tagId: { courseId, tagId } },
    })
  })

  it('removeTagFromCourseLogic: Blockiert den Löschvorgang bei fremden Kursen (Security)', async () => {
    // GIVEN: Der Sicherheits-Check findet den Kurs NICHT (oder gehört wem anders)
    prismaMock.course.findUnique.mockResolvedValue(null)

    // WHEN & THEN: Es muss ein Fehler fliegen!
    await expect(
      removeTagFromCourseLogic({ courseId, tagId }, userId),
    ).rejects.toThrow('Course not found') // Passe den Fehlertext an deine Logik an
  })

  // --- linkTagToCourseLogic Tests ---
  it('linkTagToCourseLogic: Erstellt Verknüpfung, wenn Kurs dem User gehört', async () => {
    // GIVEN: Der Sicherheits-Check findet den Kurs
    prismaMock.course.findUnique.mockResolvedValue({
      id: courseId,
      userId,
    } as any)

    // WHEN
    const result = await linkTagToCourseLogic({ courseId, tagId }, userId)

    // THEN
    expect(result).toEqual({ success: true })
    expect(prismaMock.courseTag.create).toHaveBeenCalledWith({
      data: { courseId, tagId },
    })
  })

  it('linkTagToCourseLogic: Blockiert die Verknüpfung bei fremden Kursen (Security)', async () => {
    // GIVEN: Kurs gehört wem anders
    prismaMock.course.findUnique.mockResolvedValue(null)

    // WHEN & THEN
    await expect(
      linkTagToCourseLogic({ courseId, tagId }, userId),
    ).rejects.toThrow('Course not found')
  })

  // --- createAndLinkTagToCourseLogic Tests ---
  it('createAndLinkTagToCourseLogic: Nutzt connectOrCreate, wenn Kurs dem User gehört', async () => {
    // GIVEN: Der Sicherheits-Check findet den Kurs
    prismaMock.course.findUnique.mockResolvedValue({
      id: courseId,
      userId,
    } as any)
    const tagName = 'TypeScript'

    // WHEN
    const result = await createAndLinkTagToCourseLogic(
      { courseId, tagName },
      userId,
    )

    // THEN
    expect(result).toEqual({ success: true })
    expect(prismaMock.courseTag.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        course: { connect: { id: courseId } },
        tag: expect.objectContaining({ connectOrCreate: expect.any(Object) }),
      }),
    })
  })
})
