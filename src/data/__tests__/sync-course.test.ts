import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncCourseToDatabase } from '../import-export.logic.server'
import type { ParsedCourseData } from '../import-export.logic.server'
import { prisma } from '#/lib/db.lib.server'
import { resolveTagIds } from '#/lib/tag-helpers.lib.server'
// import { checkConflict } from '../import-export.logic.server'
import type { ImportFileSchema } from '#/schemas/import-file.schema'

// --- 1. Mocks einrichten ---
const prismaMock = vi.hoisted(() => ({
  tag: { create: vi.fn() },
  course: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  note: { findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
}))

vi.mock('#/lib/db.lib.server', () => ({
  prisma: {
    ...prismaMock,
    // Simuliert das Verhalten von Prisma Transactions im Unit-Test
    $transaction: vi.fn(async (callback) => callback(prismaMock)),
  },
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
    trainers: ['FormTrainer'], // Kommt aus dem Formular
    tagIds: ['form-tag-1'], // Kommt aus dem Formular
    newPrivateTags: [],
  }

  // Dummy-Daten aus dem Markdown-Parser
  const parsedData: ParsedCourseData = {
    title: 'Mein Kurs',
    courseTags: ['md-tag'], // Kommt aus dem MD-Header
    courseTrainers: ['MdTrainer'], // Kommt aus dem MD-Header
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
    // Standard-Mock für resolveTagIds: Gibt einfach Dummy-IDs zurück
    vi.mocked(resolveTagIds).mockResolvedValue(['resolved-md-tag-id'])
  })

  it('1. sollte einen neuen Kurs anlegen, wenn er noch nicht existiert (Merge von Formular und MD)', async () => {
    // Kurs existiert noch NICHT
    vi.mocked(prisma.course.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.course.create).mockResolvedValue({
      id: 'new-course-id',
    } as any)

    await syncCourseToDatabase(parsedData, formData, userId)

    // Prüfen, ob Kurs-Erstellung aufgerufen wurde
    expect(prisma.course.create).toHaveBeenCalledTimes(1)

    // Prüfen, ob Formular-Trainer UND Markdown-Trainer zusammengefasst wurden
    const createCallArgs = vi.mocked(prisma.course.create).mock.calls[0][0].data

    // Erwartet "FormTrainer" und "MdTrainer"
    expect(createCallArgs.trainers?.create).toHaveLength(2)
    // Erwartet "form-tag-1" und "resolved-md-tag-id"
    expect(createCallArgs.tags?.create).toHaveLength(2)
  })

  it('2. Delta-Logik: sollte bei existierendem Kurs nur NEUE Trainer und Tags hinzufügen', async () => {
    // Kurs EXISTIERT BEREITS und hat schon "FormTrainer" und "form-tag-1"
    vi.mocked(prisma.course.findFirst).mockResolvedValue({
      id: 'existing-course-id',
      tags: [{ tagId: 'form-tag-1' }],
      trainers: [{ trainer: { name: 'FormTrainer' } }],
    } as any)

    vi.mocked(prisma.course.update).mockResolvedValue({
      id: 'existing-course-id',
    } as any)
    vi.mocked(prisma.note.findMany).mockResolvedValue([]) // Keine bestehenden Notizen

    await syncCourseToDatabase(parsedData, formData, userId)

    expect(prisma.course.update).toHaveBeenCalledTimes(1)

    const updateCallArgs = vi.mocked(prisma.course.update).mock.calls[0][0].data

    const createdTrainers = updateCallArgs.trainers?.create as any[]
    const createdTags = updateCallArgs.tags?.create as any[]

    // Da "FormTrainer" schon existiert, darf NUR noch "MdTrainer" neu angelegt werden!
    expect(createdTrainers).toHaveLength(1)
    expect(createdTrainers[0].trainer.connectOrCreate.create.name).toBe(
      'MdTrainer',
    )

    // Da "form-tag-1" schon existiert, darf NUR noch "resolved-md-tag-id" neu verknüpft werden!
    expect(createdTags).toHaveLength(1)
    expect(createdTags[0].tagId).toBe('resolved-md-tag-id')

    // WICHTIG: Prüfen, dass deleteMany NICHT aufgerufen wurde
    expect(updateCallArgs.tags?.deleteMany).toBeUndefined()
    expect(updateCallArgs.trainers?.deleteMany).toBeUndefined()
  })

  it('3. Delta-Logik bei Notizen: sollte nur neue Note-Tags verknüpfen', async () => {
    // Kurs existiert
    vi.mocked(prisma.course.findFirst).mockResolvedValue({
      id: 'course-id',
      tags: [],
      trainers: [],
    } as any)

    // Notiz EXISTIERT BEREITS und hat schon das Tag "resolved-md-tag-id"
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
    const createdNoteTags = noteUpdateArgs.tags?.create as any[]

    // Da das Tag schon an der Notiz hängt, darf "create" leer sein!
    expect(createdNoteTags).toHaveLength(0)
  })

  it('4. Legacy-Import: Sucht den Kurs anhand des Titels, wenn keine courseId (DNA) übergeben wurde', async () => {
    vi.mocked(prismaMock.course.findFirst).mockResolvedValue(null)

    // Wir stellen sicher, dass keine courseId im formData ist
    const legacyFormData = { ...formData, courseId: undefined }

    await syncCourseToDatabase(parsedData, legacyFormData, userId)

    // Prüfen, ob nach Titel gesucht wurde (Legacy-Verhalten)
    expect(prismaMock.course.findFirst).toHaveBeenCalledTimes(1)
    const findArgs = vi.mocked(prismaMock.course.findFirst).mock.calls[0][0]

    expect(findArgs?.where).toEqual(
      expect.objectContaining({
        title: parsedData.title,
        userId: userId,
      }),
    )
  })

  it('5. DNA-Import: Sucht den Kurs zwingend über die courseId, selbst wenn der Titel abweicht', async () => {
    vi.mocked(prismaMock.course.findFirst).mockResolvedValue(null)

    const dnaCourseId = 'eiserne-dna-id-123'
    const dnaFormData = { ...formData, courseId: dnaCourseId }

    // Der Titel im Markdown weicht absichtlich ab
    const alteredParsedData = {
      ...parsedData,
      title: 'Ein völlig neuer Kursname',
      courseId: dnaCourseId,
    }

    await syncCourseToDatabase(alteredParsedData, dnaFormData, userId)

    expect(prismaMock.course.findFirst).toHaveBeenCalledTimes(1)
    const findArgs = vi.mocked(prismaMock.course.findFirst).mock.calls[0][0]

    // Der wichtigste Check: Es MUSS nach der ID gesucht werden, nicht nach dem Titel
    expect(findArgs?.where).toEqual(
      expect.objectContaining({
        id: dnaCourseId,
        userId: userId,
      }),
    )

    // Absicherung: Der Titel darf nicht in der where-Klausel auftauchen,
    // da sonst das Matching fehlschlägt, wenn der User den Kurs umbenannt hat.
    expect(findArgs?.where).not.toHaveProperty('title')
  })
})
