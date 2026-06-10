import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDeep, mockReset } from 'vitest-mock-extended'
import type { DeepMockProxy } from 'vitest-mock-extended'
import type { PrismaClient, Prisma } from '#/generated/prisma/client'
import { prisma } from '#/lib/db.lib.server'
import {
  getCoursesLogic,
  getCourseByIdLogic,
  deleteCourseByIdLogic,
  getTrainerSuggestionsLogic,
  removeTagFromCourseLogic,
  linkTagToCourseLogic,
  createAndLinkTagToCourseLogic,
  addTrainerToCourseLogic,
  removeTrainerFromCourseLogic,
  createAndLinkTrainerToCourseLogic,
  createShareLinkLogic,
} from '../course.logic.server'

// 1. Prisma Client mocken - Simpel & direkt
vi.mock('#/lib/db.lib.server', () => ({
  prisma: mockDeep<PrismaClient>(),
}))

// 2. Env Mock für die Share-Link Logic
vi.mock('#/lib/env.lib.server', () => ({
  env: {
    DEFAULT_AGE_SHARE_LINK_IN_DAYS: 30,
  },
}))

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
    udemyCourseId: '1234567',
    title: 'Default Title',
    userId: 'user_123',
    trainers: [],
    description: 'Course Description',
    imageUrl: 'https://udemy.com/image-1',
    courseUrl: 'https://udemy.com/course-1',
    trainerUrl: 'https://udemy.com/user-1',
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
    const expectedDbResult = [mockCourses[0]]
    const testData = {
      page: 1,
      pageSize: 10,
      search: 'React',
      tagIds: [],
      trainer: '',
    }

    prismaMock.course.findMany.mockResolvedValue(expectedDbResult)
    prismaMock.course.count.mockResolvedValue(1)

    const result = await getCoursesLogic(testData, userId)

    expect(result).toEqual({ items: expectedDbResult, totalCount: 1 })
    expect(prismaMock.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 10,
        where: expect.objectContaining({
          userId: userId,
          OR: [
            { title: { contains: 'React', mode: 'insensitive' } },
            {
              trainers: {
                some: {
                  trainer: { name: { contains: 'React', mode: 'insensitive' } },
                },
              },
            },
          ],
        }),
      }),
    )
  })

  it('Filter: Wendet Tag-Filter korrekt in der where-Klausel an', async () => {
    const testData = {
      page: 1,
      pageSize: 10,
      search: '',
      tagIds: ['tag-1', 'tag-2'],
      trainer: '',
    }

    prismaMock.course.findMany.mockResolvedValue([])
    prismaMock.course.count.mockResolvedValue(0)

    await getCoursesLogic(testData, userId)

    // Prüft, ob die zusätzliche OR-Logik für Tags eingebaut wurde
    expect(prismaMock.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tags: {
            some: {
              tagId: { in: ['tag-1', 'tag-2'] },
            },
          },
        }),
      }),
    )
  })

  it('Happy Path: Ruft eine leere Liste von Kursen für einen User erfolgreich ab', async () => {
    const expectedDbResult: Array<(typeof mockCourses)[number]> = []
    const testData = {
      page: 1,
      pageSize: 10,
      search: 'Javascript',
      tagIds: [],
      trainer: '',
    }
    prismaMock.course.findMany.mockResolvedValue(expectedDbResult)
    prismaMock.course.count.mockResolvedValue(0)

    const result = await getCoursesLogic(testData, userId)

    expect(result).toEqual({ items: expectedDbResult, totalCount: 0 })
  })

  describe('Pagination & Suche', () => {
    type CourseArray = Array<(typeof mockCourses)[number]>

    it('Seite 1: Berechnet skip=0 und take=2 korrekt', async () => {
      const expectedDbResult: CourseArray = [mockCourses[0], mockCourses[2]]
      const testData = {
        page: 1,
        pageSize: 2,
        search: 'e',
        tagIds: [],
        trainer: '',
      }
      prismaMock.course.findMany.mockResolvedValue(expectedDbResult)
      prismaMock.course.count.mockResolvedValue(3)

      const result = await getCoursesLogic(testData, userId)

      expect(result).toEqual({ items: expectedDbResult, totalCount: 3 })
      expect(prismaMock.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 2 }),
      )
    })

    it('Seite 2: Berechnet skip=2 und take=2 korrekt', async () => {
      const expectedDbResult: CourseArray = [mockCourses[4]]
      const testData = {
        page: 2,
        pageSize: 2,
        search: 'e',
        tagIds: [],
        trainer: '',
      }
      prismaMock.course.findMany.mockResolvedValue(expectedDbResult)
      prismaMock.course.count.mockResolvedValue(3)

      const result = await getCoursesLogic(testData, userId)

      expect(result).toEqual({ items: expectedDbResult, totalCount: 3 })
      expect(prismaMock.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 2, take: 2 }),
      )
    })
  })
})

describe('getCourseByIdLogic', () => {
  const userId = 'user_123'
  const courseId = 'course_abc'

  beforeEach(() => mockReset(prismaMock))

  it('Happy Path: Gibt den Kurs erfolgreich zurück, wenn er gefunden wurde', async () => {
    const mockCourseData = {
      id: courseId,
      title: 'Single Course Test',
      userId,
      notes: [],
      tags: [],
    }
    prismaMock.course.findUnique.mockResolvedValue(mockCourseData as any)

    const result = await getCourseByIdLogic({ id: courseId }, userId)

    expect(result).toEqual(mockCourseData)
    expect(prismaMock.course.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: courseId, userId },
      }),
    )
  })

  it('Error: Wirft einen Fehler, wenn der Kurs nicht gefunden wird', async () => {
    prismaMock.course.findUnique.mockResolvedValue(null)
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
    const mockTrainers = [
      { id: 1, name: 'Maximilian Müller' },
      { id: 2, name: 'Sarah Schmidt' },
      { id: 3, name: 'Zebra Trainer' },
    ]

    prismaMock.trainer.findMany.mockResolvedValue(mockTrainers as any)
    const result = await getTrainerSuggestionsLogic({ query: '' })

    expect(result.suggestions).toHaveLength(3)
    expect(result.suggestions[0].name).toBe('Maximilian Müller')
  })

  it('sollte hasMore korrekt auf true setzen, wenn das Limit überschritten wird', async () => {
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

    expect(result.suggestions).toHaveLength(5) // Limit ist 5
    expect(result.hasMore).toBe(true)
  })
})

describe('Tag Management Logic', () => {
  const userId = 'user_123'
  const courseId = 'course_456'
  const tagId = 'tag_789'

  beforeEach(() => mockReset(prismaMock))

  it('removeTagFromCourseLogic: Löscht den Eintrag, wenn Kurs dem User gehört', async () => {
    prismaMock.course.findUnique.mockResolvedValue({
      id: courseId,
      userId,
    } as any)

    const result = await removeTagFromCourseLogic({ courseId, tagId }, userId)

    expect(result).toEqual({ success: true })
    expect(prismaMock.courseTag.delete).toHaveBeenCalledWith({
      where: { courseId_tagId: { courseId, tagId } },
    })
  })

  it('removeTagFromCourseLogic: Blockiert den Löschvorgang bei fremden Kursen', async () => {
    prismaMock.course.findUnique.mockResolvedValue(null)
    await expect(
      removeTagFromCourseLogic({ courseId, tagId }, userId),
    ).rejects.toThrow('Course not found')
  })

  it('linkTagToCourseLogic: Erstellt Verknüpfung, wenn Kurs dem User gehört', async () => {
    prismaMock.course.findUnique.mockResolvedValue({
      id: courseId,
      userId,
    } as any)

    const result = await linkTagToCourseLogic({ courseId, tagId }, userId)

    expect(result).toEqual({ success: true })
    expect(prismaMock.courseTag.create).toHaveBeenCalledWith({
      data: { courseId, tagId },
    })
  })

  it('createAndLinkTagToCourseLogic: Nutzt connectOrCreate, wenn Kurs dem User gehört', async () => {
    prismaMock.course.findUnique.mockResolvedValue({
      id: courseId,
      userId,
    } as any)

    const result = await createAndLinkTagToCourseLogic(
      { courseId, tagName: 'TypeScript' },
      userId,
    )

    expect(result).toEqual({ success: true })
    expect(prismaMock.courseTag.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        course: { connect: { id: courseId } },
        tag: expect.objectContaining({ connectOrCreate: expect.any(Object) }),
      }),
    })
  })
})

describe('Trainer Management Logic', () => {
  const userId = 'user_123'
  const courseId = 'course_456'
  const trainerId = 'trainer_789'

  beforeEach(() => mockReset(prismaMock))

  describe('addTrainerToCourseLogic', () => {
    it('Happy Path: Verknüpft Trainer mit Kurs', async () => {
      prismaMock.course.findUnique.mockResolvedValue({
        id: courseId,
        userId,
        trainers: [],
      } as any)
      prismaMock.trainer.findUnique.mockResolvedValue({
        id: trainerId,
        name: 'Max',
      } as any)

      const result = await addTrainerToCourseLogic(
        { courseId, trainerId },
        userId,
      )

      expect(result).toEqual({ success: true })
      expect(prismaMock.courseTrainer.create).toHaveBeenCalledWith({
        data: { courseId, trainerId },
      })
    })

    it('Error: Wirft Fehler, wenn Trainer schon verknüpft ist', async () => {
      prismaMock.course.findUnique.mockResolvedValue({
        id: courseId,
        userId,
        trainers: [{ trainerId }],
      } as any)
      prismaMock.trainer.findUnique.mockResolvedValue({
        id: trainerId,
        name: 'Max',
      } as any)

      await expect(
        addTrainerToCourseLogic({ courseId, trainerId }, userId),
      ).rejects.toThrow('Trainer is already assigned to the course')
    })
  })

  describe('removeTrainerFromCourseLogic', () => {
    it('Happy Path: Entfernt die Trainer-Verknüpfung', async () => {
      prismaMock.course.findUnique.mockResolvedValue({
        id: courseId,
        userId,
        trainers: [{ trainerId }],
      } as any)

      const result = await removeTrainerFromCourseLogic(
        { courseId, trainerId },
        userId,
      )

      expect(result).toEqual({ success: true })
      expect(prismaMock.courseTrainer.delete).toHaveBeenCalledWith({
        where: { courseId_trainerId: { courseId, trainerId } },
      })
    })

    it('Error: Wirft Fehler, wenn Trainer dem Kurs gar nicht zugewiesen ist', async () => {
      prismaMock.course.findUnique.mockResolvedValue({
        id: courseId,
        userId,
        trainers: [], // Leer!
      } as any)

      await expect(
        removeTrainerFromCourseLogic({ courseId, trainerId }, userId),
      ).rejects.toThrow('Trainer is not assigned to the course')
    })
  })

  describe('createAndLinkTrainerToCourseLogic', () => {
    it('Happy Path: Erstellt Trainer via connectOrCreate', async () => {
      prismaMock.course.findUnique.mockResolvedValue({
        id: courseId,
        userId,
      } as any)

      const result = await createAndLinkTrainerToCourseLogic(
        { courseId, trainerName: 'New Trainer' },
        userId,
      )

      expect(result).toEqual({ success: true })
      expect(prismaMock.courseTrainer.create).toHaveBeenCalledWith({
        data: {
          course: { connect: { id: courseId } },
          trainer: {
            connectOrCreate: {
              where: { name: 'New Trainer' },
              create: { name: 'New Trainer' },
            },
          },
        },
      })
    })
  })
})

describe('Share Link Logic', () => {
  const userId = 'user_123'
  const courseId = 'course_456'

  beforeEach(() => mockReset(prismaMock))

  describe('createShareLinkLogic', () => {
    it('Erstellt einen neuen Token, wenn noch keiner existiert', async () => {
      prismaMock.course.findUnique.mockResolvedValue({
        id: courseId,
        userId,
      } as any)
      prismaMock.courseShareToken.findFirst.mockResolvedValue(null) // Noch kein Token da

      const futureDate = new Date(Date.now() + 100000000)
      prismaMock.courseShareToken.create.mockResolvedValue({
        id: 'new-token-123',
        courseId,
        expiresAt: futureDate,
      } as any)

      const result = await createShareLinkLogic(
        { courseId, expiresAt: futureDate },
        userId,
      )

      expect(result.token).toBe('new-token-123')
      expect(prismaMock.courseShareToken.create).toHaveBeenCalled()
    })

    it('Aktualisiert (Upsert) den existierenden Token', async () => {
      prismaMock.course.findUnique.mockResolvedValue({
        id: courseId,
        userId,
      } as any)
      prismaMock.courseShareToken.findFirst.mockResolvedValue({
        id: 'old-token',
      } as any)

      const futureDate = new Date(Date.now() + 100000000)
      prismaMock.courseShareToken.update.mockResolvedValue({
        id: 'old-token',
        courseId,
        expiresAt: futureDate,
      } as any)

      const result = await createShareLinkLogic(
        { courseId, expiresAt: futureDate },
        userId,
      )

      expect(result.token).toBe('old-token')
      expect(prismaMock.courseShareToken.update).toHaveBeenCalledWith({
        where: { id: 'old-token' },
        data: { expiresAt: futureDate },
      })
    })

    it('Korrigiert ein Ablaufdatum in der Vergangenheit auf den Standardwert in der Zukunft', async () => {
      prismaMock.course.findUnique.mockResolvedValue({
        id: courseId,
        userId,
      } as any)
      prismaMock.courseShareToken.findFirst.mockResolvedValue(null)

      const pastDate = new Date('2000-01-01')

      // Um zu überprüfen, ob das Date angepasst wurde, mocken wir die Antwort so,
      // dass sie das aufrufende Datum zurückgibt.
      prismaMock.courseShareToken.create.mockImplementation(((args: any) =>
        Promise.resolve({
          id: 'token-abc',
          courseId,
          expiresAt: args.data.expiresAt as Date,
        })) as any)

      const result = await createShareLinkLogic(
        { courseId, expiresAt: pastDate },
        userId,
      )

      // Das resultierende Datum MUSS in der Zukunft liegen (heute + env Default Days)
      expect(result.expiresAt!.getTime()).toBeGreaterThan(Date.now())
      expect(result.expiresAt!.getTime()).not.toBe(pastDate.getTime())
    })
  })
})
