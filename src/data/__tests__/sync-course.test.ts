import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncCourseToDatabase } from '../import-export.logic.server'
import type { ParsedCourseData } from '../import-export.logic.server'
import { prisma } from '#/lib/db.lib.server'
import { resolveTagIds } from '#/lib/tag-helpers.lib.server'
import type { ImportFileSchema } from '#/schemas/import-file.schema'

// --- 1. Mocks einrichten ---
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    tag: { create: vi.fn() },
    course: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    note: {
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    trainer: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn().mockImplementation(async (args) => {
        const name = args.create?.name || args.where?.name || 'unknown'
        return { id: `trainer-id-${name}` }
      }),
    },
    $transaction: vi.fn(async (cb) => cb(prismaMock as any)),
  },
}))

// 2. Modul mocken und den hoisted Mock injizieren
vi.mock('#/lib/db.lib.server', () => ({
  prisma: prismaMock,
}))

vi.mock('#/lib/udemy.lib', () => ({
  orderInfo: vi.fn().mockReturnValue('001-001-00000'),
}))

vi.mock('#/lib/tag-helpers.lib.server', () => ({
  resolveTagIds: vi.fn(),
}))

vi.mock('#/lib/conflict-helper.lib', () => ({
  checkConflict: vi.fn().mockReturnValue(false),
}))

describe('syncCourseToDatabase', () => {
  const userId = 'user-123'

  // Dummy-Daten aus dem Formular (Frontend)
  const formData: ImportFileSchema = {
    content: '...',
    fileName: 'test.md',
    fileSize: 1000,
    trainers: ['FormTrainer'],
    tagIds: ['form-tag-1'],
    newPrivateTags: [],
  }

  // Dummy-Daten aus dem Parser
  const parsedData: ParsedCourseData = {
    title: 'Mein Kurs',
    courseTags: ['md-tag'],
    courseTrainers: ['MdTrainer'],
    notes: [
      {
        section: '1',
        lecture: '1',
        timestamp: '00:00',
        parsedContent: 'Text',
        parsedOriginalContent: null,
        noteTags: ['note-tag'],
      },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveTagIds).mockResolvedValue(['resolved-md-tag-id'])

    // 🟢 NEU: Standard-Mock für upsert, damit wir immer eine Trainer-ID zurückbekommen
    vi.mocked(prismaMock.trainer.upsert).mockImplementation(
      async (args: any) => ({
        id: `trainer-id-${args.create.name}`,
      }),
    )
  })

  it('1. sollte einen neuen Kurs anlegen, wenn er noch nicht existiert (Merge von Formular und MD)', async () => {
    vi.mocked(prisma.course.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.course.create).mockResolvedValue({
      id: 'new-course-id',
    } as any)

    await syncCourseToDatabase(parsedData, formData, userId)

    expect(prisma.course.create).toHaveBeenCalledTimes(1)
    const createCallArgs = vi.mocked(prisma.course.create).mock.calls[0][0].data

    expect(createCallArgs.trainers?.create).toHaveLength(2)
    // 🟢 NEU: Wir prüfen nun auf connect.id (da upsert vorher aufgerufen wird)
    expect(
      (createCallArgs.trainers?.create as any[])[0].trainer.connect.id,
    ).toBe('trainer-id-FormTrainer')
    expect(
      (createCallArgs.trainers?.create as any[])[1].trainer.connect.id,
    ).toBe('trainer-id-MdTrainer')
    expect(createCallArgs.tags?.create).toHaveLength(2)
  })

  it('2. Delta-Logik: sollte bei existierendem Kurs nur NEUE Trainer und Tags hinzufügen', async () => {
    vi.mocked(prisma.course.findFirst).mockResolvedValue({
      id: 'existing-course-id',
      tags: [{ tagId: 'form-tag-1' }],
      // 🟢 NEU: Wir mocken die bestehenden Trainer-Relationen mit IDs
      trainers: [
        {
          trainerId: 'trainer-id-FormTrainer',
          trainer: { name: 'FormTrainer' },
        },
      ],
    } as any)

    vi.mocked(prisma.course.update).mockResolvedValue({
      id: 'existing-course-id',
    } as any)
    vi.mocked(prisma.note.findMany).mockResolvedValue([])

    await syncCourseToDatabase(parsedData, formData, userId)

    expect(prisma.course.update).toHaveBeenCalledTimes(1)

    const updateCallArgs = vi.mocked(prisma.course.update).mock.calls[0][0].data
    const createdTrainers = updateCallArgs.trainers?.create as any[]
    const createdTags = updateCallArgs.tags?.create as any[]

    expect(createdTrainers).toHaveLength(1)
    // 🟢 NEU: connect.id statt connectOrCreate
    expect(createdTrainers[0].trainer.connect.id).toBe('trainer-id-MdTrainer')

    expect(createdTags).toHaveLength(1)
    expect(createdTags[0].tagId).toBe('resolved-md-tag-id')

    expect(updateCallArgs.tags?.deleteMany).toBeUndefined()
    expect(updateCallArgs.trainers?.deleteMany).toBeUndefined()
  })

  it('3. Delta-Logik bei Notizen: sollte nur neue Note-Tags verknüpfen', async () => {
    vi.mocked(prisma.course.findFirst).mockResolvedValue({
      id: 'course-id',
      tags: [],
      trainers: [],
    } as any)

    vi.mocked(prisma.note.findMany).mockResolvedValue([
      {
        id: 'existing-note-id',
        section: '1',
        lecture: '1',
        timestamp: '00:00',
        originalContent: 'Text',
        editedContent: '',
        tags: [{ tagId: 'resolved-md-tag-id' }],
      },
    ] as any)

    await syncCourseToDatabase(parsedData, formData, userId)

    expect(prisma.note.update).toHaveBeenCalledTimes(1)
    const noteUpdateArgs = vi.mocked(prisma.note.update).mock.calls[0][0].data
    expect(noteUpdateArgs.tags?.create as any[]).toHaveLength(0)
  })

  it('4. Legacy-Import: Sucht den Kurs anhand des Titels, wenn keine courseId (DNA) übergeben wurde', async () => {
    vi.mocked(prismaMock.course.findFirst).mockResolvedValue(null)
    const legacyFormData = { ...formData, courseId: undefined }

    await syncCourseToDatabase(parsedData, legacyFormData, userId)

    expect(prismaMock.course.findFirst).toHaveBeenCalledTimes(1)
    const findArgs = vi.mocked(prismaMock.course.findFirst).mock.calls[0][0]
    expect(findArgs?.where).toEqual(
      expect.objectContaining({ title: parsedData.title, userId }),
    )
  })

  it('5. DNA-Import: Sucht den Kurs zwingend über die courseId, selbst wenn der Titel abweicht', async () => {
    vi.mocked(prismaMock.course.findFirst).mockResolvedValue(null)

    const dnaCourseId = 'eiserne-dna-id-123'
    const alteredParsedData = {
      ...parsedData,
      title: 'Ein völlig neuer Kursname',
      courseId: dnaCourseId,
    }

    await syncCourseToDatabase(alteredParsedData, formData, userId)

    expect(prismaMock.course.findFirst).toHaveBeenCalledTimes(2)
    const firstCall = vi.mocked(prismaMock.course.findFirst).mock.calls[0][0]
    expect(firstCall?.where).toEqual(
      expect.objectContaining({ id: dnaCourseId }),
    )

    const findArgs = vi.mocked(prismaMock.course.findFirst).mock.calls[0][0]

    expect(findArgs?.where).toEqual(
      expect.objectContaining({ id: dnaCourseId, userId }),
    )
    expect(findArgs?.where).not.toHaveProperty('title')
  })

  it('6. TDD: Ordnet die Trainer-URL dem einzigen passenden Trainer zu, wenn mehrere Trainer angegeben wurden', async () => {
    const newCourseTrainerUrl = 'https://udemy.com/user/neuer-kurs-trainer'
    const tddParsedData = {
      ...parsedData,
      courseTrainers: [],
      trainerUrl: newCourseTrainerUrl,
    }
    const tddFormData = {
      ...formData,
      trainers: ['Trainer Ohne URL', 'Trainer Mit Alter URL'],
    }

    vi.mocked(prismaMock.course.findFirst).mockResolvedValue(null)
    vi.mocked(prismaMock.course.create).mockResolvedValue({
      id: 'new-course',
    } as any)
    vi.mocked(prismaMock.trainer.findUnique).mockResolvedValue(null)
    vi.mocked(prismaMock.trainer.findMany).mockResolvedValue([
      { name: 'Trainer Ohne URL', profileUrl: null },
      {
        name: 'Trainer Mit Alter URL',
        profileUrl: 'https://udemy.com/user/alt',
      },
    ] as any)

    await syncCourseToDatabase(tddParsedData, tddFormData, userId)

    expect(prismaMock.trainer.update).toHaveBeenCalledTimes(1)
    expect(prismaMock.trainer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: 'Trainer Ohne URL' },
        data: { profileUrl: newCourseTrainerUrl },
      }),
    )
  })

  it('7. TDD: Single Trainer Update - Setzt die profileUrl, wenn der einzige angegebene Trainer noch keine hat', async () => {
    const newCourseTrainerUrl = 'https://udemy.com/user/einzel-trainer'
    const tddParsedData = {
      ...parsedData,
      courseTrainers: [],
      trainerUrl: newCourseTrainerUrl,
    }
    const tddFormData = {
      ...formData,
      trainers: ['Bekannter Trainer Ohne URL'],
    }

    vi.mocked(prismaMock.course.findFirst).mockResolvedValue(null)
    vi.mocked(prismaMock.course.create).mockResolvedValue({
      id: 'new-course',
    } as any)
    vi.mocked(prismaMock.trainer.findUnique).mockResolvedValue(null)
    vi.mocked(prismaMock.trainer.findMany).mockResolvedValue([
      { name: 'Bekannter Trainer Ohne URL', profileUrl: null },
    ] as any)

    await syncCourseToDatabase(tddParsedData, tddFormData, userId)

    expect(prismaMock.trainer.update).toHaveBeenCalledTimes(1)
    expect(prismaMock.trainer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: 'Bekannter Trainer Ohne URL' },
        data: { profileUrl: newCourseTrainerUrl },
      }),
    )
  })

  it('8. TDD: Sicherheits-Check - Korrigiert den Trainer, wenn die URL bereits einem ANDEREN Trainer gehört', async () => {
    const existingProfileUrl = 'https://udemy.com/user/echter-trainer'
    const tddParsedData = {
      ...parsedData,
      courseTrainers: [],
      trainerUrl: existingProfileUrl,
    }
    const tddFormData = { ...formData, trainers: ['Falscher Eingabe Trainer'] }

    vi.mocked(prismaMock.course.findFirst).mockResolvedValue(null)
    vi.mocked(prismaMock.course.create).mockResolvedValue({
      id: 'new-course',
    } as any)
    vi.mocked(prismaMock.trainer.findUnique).mockResolvedValue({
      name: 'Echter Trainer',
    } as any)

    await syncCourseToDatabase(tddParsedData, tddFormData, userId)

    expect(prismaMock.course.create).toHaveBeenCalledTimes(1)
    const createArgs = vi.mocked(prismaMock.course.create).mock.calls[0][0].data
    const createdTrainers = createArgs.trainers?.create as any[]

    expect(createdTrainers).toHaveLength(1)
    // 🟢 NEU: Da existingTrainerByUrl triggert, wird "Echter Trainer" ge-upserted und hier verknüpft
    expect(createdTrainers[0].trainer.connect.id).toBe(
      'trainer-id-Echter Trainer',
    )
  })
})
