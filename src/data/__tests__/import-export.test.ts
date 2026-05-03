import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDeep, mockReset } from 'vitest-mock-extended'
import type { DeepMockProxy } from 'vitest-mock-extended'
import type { PrismaClient } from '#/generated/prisma/client'
import { MAX_FILE_SIZE_UPLOAD } from '#/lib/constants'
import { prisma } from '#/lib/db.server'
import { prepareAndConvertHtmlToMarkdown } from '#/lib/convertHtmlToMarkdown'
import {
  importHtmlFileLogic,
  exportMdFileLogic,
} from '../import-export.logic.server'
import type { ExportMdFileSchema } from '#/schemas/export-file'

// 1. Mocks definieren
vi.mock('#/lib/db.server', () => ({
  prisma: mockDeep<PrismaClient>(),
}))

vi.mock('#/lib/convertHtmlToMarkdown', () => ({
  prepareAndConvertHtmlToMarkdown: vi.fn(),
}))

vi.mock('#/lib/udemy', () => ({
  orderInfo: vi.fn(() => '999-999-999'),
}))

vi.mock('#/lib/export-helper', () => ({
  processNoteForMarkdown: vi.fn(() => 'Mocked Note Markdown'),
}))

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>
const convertMock = prepareAndConvertHtmlToMarkdown as any

describe('importHtmlFileLogic', () => {
  const userId = 'user_123'
  const defaultInput = {
    content: '<html><body>Notes</body></html>',
    fileName: 'test.html',
    fileSize: 1000,
    trainers: ['Maximilian Schwarzmüller'],
    tagIds: ['tag_1'],
    newPrivateTags: [],
  }

  beforeEach(() => {
    mockReset(prismaMock)
    vi.clearAllMocks()
  })

  describe('Validierung & Fehler', () => {
    it('Wirft Fehler, wenn die Datei zu groß ist', async () => {
      await expect(
        importHtmlFileLogic(
          { ...defaultInput, fileSize: MAX_FILE_SIZE_UPLOAD + 1 },
          userId,
        ),
      ).rejects.toThrow('File too large')
    })

    it('Wirft Fehler, wenn der Inhalt kein HTML ist', async () => {
      await expect(
        importHtmlFileLogic({ ...defaultInput, content: 'not html' }, userId),
      ).rejects.toThrow('Only HTML files are allowed')
    })

    it('Wirft Fehler, wenn die Konvertierung fehlschlägt', async () => {
      convertMock.mockReturnValue({
        status: 'ERROR',
        message: 'Conversion failed',
      })

      await expect(importHtmlFileLogic(defaultInput, userId)).rejects.toThrow(
        'Conversion failed',
      )
    })
  })

  describe('Happy Path', () => {
    it('Erstellt einen neuen Kurs und neue Notizen erfolgreich', async () => {
      // --- GIVEN ---
      const mockCourse = {
        title: 'React Course',
        notes: [
          {
            timestamp: '1:00',
            section: 'S1',
            lecture: 'L1',
            content: 'Note 1',
          },
        ],
      }
      convertMock.mockReturnValue({
        status: 'SUCCESS',
        course: mockCourse,
        markdown: '# MD',
      })

      prismaMock.course.findFirst.mockResolvedValue(null) // Kurs existiert noch nicht
      prismaMock.course.create.mockResolvedValue({ id: 'new_course_id' } as any)

      // --- WHEN ---
      const result = await importHtmlFileLogic(defaultInput, userId)

      // --- THEN ---
      expect(result.courseId).toBe('new_course_id')
      expect(result.numberOfConflicts).toBe(0)
      expect(prismaMock.course.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: 'React Course', userId }),
        }),
      )
      expect(prismaMock.note.create).toHaveBeenCalledTimes(1)
    })

    it('Behandelt neue private Tags korrekt', async () => {
      // --- GIVEN ---
      convertMock.mockReturnValue({
        status: 'SUCCESS',
        course: { title: 'T', notes: [] },
        markdown: '',
      })
      prismaMock.tag.create.mockResolvedValue({ id: 'new_tag_id' } as any)
      prismaMock.course.create.mockResolvedValue({ id: 'c1' } as any)

      // --- WHEN ---
      await importHtmlFileLogic(
        { ...defaultInput, newPrivateTags: ['NewTag'] },
        userId,
      )

      // --- THEN ---
      expect(prismaMock.tag.create).toHaveBeenCalledWith({
        data: { name: 'NewTag', userId },
        select: { id: true },
      })
    })

    it('Erkennt Konflikte bei bestehenden Notizen', async () => {
      // --- GIVEN ---
      const mockCourse = {
        title: 'React Course',
        notes: [
          {
            timestamp: '1:00',
            section: 'S1',
            lecture: 'L1',
            content: 'Changed Content',
          },
        ],
      }
      convertMock.mockReturnValue({
        status: 'SUCCESS',
        course: mockCourse,
        markdown: '',
      })

      // Bestehender Kurs
      prismaMock.course.findFirst.mockResolvedValue({
        id: 'existing_id',
        tags: [],
        trainers: [],
      } as any)
      prismaMock.course.update.mockResolvedValue({ id: 'existing_id' } as any)

      // Bestehende Notiz mit manuellem Edit
      prismaMock.note.findMany.mockResolvedValue([
        {
          id: 'n1',
          timestamp: '1:00',
          section: 'S1',
          lecture: 'L1',
          originalContent: 'Old Content',
          editedContent: 'User manual edit',
        },
      ] as any)

      // --- WHEN ---
      const result = await importHtmlFileLogic(defaultInput, userId)

      // --- THEN ---
      expect(result.numberOfConflicts).toBe(1)
      expect(prismaMock.note.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'n1' },
          data: expect.objectContaining({ hasConflict: true }),
        }),
      )
    })
  })
})

describe('exportMdFileLogic', () => {
  const userId = 'user_123'
  const courseId = 'course_456'
  const defaultInput: ExportMdFileSchema = {
    courseId,
    includeCourseTags: true,
    includeNotesMetadata: true,
    includeNoteTags: true,
    includeTrainers: true,
    noteVersion: 'edited_with_fallback',
  }

  beforeEach(() => {
    mockReset(prismaMock)
  })

  it('Wirft Fehler, wenn der Kurs nicht gefunden wurde', async () => {
    prismaMock.course.findUnique.mockResolvedValue(null)

    await expect(exportMdFileLogic(defaultInput, userId)).rejects.toThrow(
      'Course not found',
    )
  })

  it('Generiert Markdown für einen Kurs mit Tags und Notizen', async () => {
    // --- GIVEN ---
    const mockCourse = {
      id: courseId,
      title: 'My Course',
      tags: [{ tag: { name: 'React' } }],
      trainers: [{ trainer: { name: 'Max Muster' } }],
      notes: [
        { id: 'note_1', orderInfo: '1', tags: [] },
        { id: 'note_2', orderInfo: '2', tags: [] },
      ],
    }
    prismaMock.course.findUnique.mockResolvedValue(mockCourse as any)

    // --- WHEN ---
    const result = await exportMdFileLogic(defaultInput, userId)

    // --- THEN ---
    expect(result.markdown).toContain('# My Course')
    expect(result.markdown).toContain('* React')
    expect(result.markdown).toContain('Mocked Note Markdown')
    // 2 Notizen + Trenner
    expect(result.markdown).toContain('---')

    expect(prismaMock.course.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: courseId, userId },
        include: expect.objectContaining({
          // Wir prüfen auf die exakte Struktur, die Prisma hier erwartet
          tags: {
            include: { tag: true },
          },
          notes: expect.objectContaining({
            where: { isDeleted: false },
            orderBy: { orderInfo: 'desc' },
            include: expect.any(Object), // Spart uns Schreibarbeit bei tiefer Verschachtelung
          }),
        }),
      }),
    )
  })

  it('Behandelt Kurse ohne Notizen korrekt', async () => {
    // --- GIVEN ---
    const mockCourse = {
      id: courseId,
      title: 'Empty Course',
      tags: [],
      trainers: [],
      notes: [],
    }
    prismaMock.course.findUnique.mockResolvedValue(mockCourse as any)

    // --- WHEN ---
    const result = await exportMdFileLogic(defaultInput, userId)

    // --- THEN ---
    expect(result.markdown).toContain('No notes found')
  })

  it('Respektiert includeCourseTags: false', async () => {
    // --- GIVEN ---
    const mockCourse = {
      id: courseId,
      title: 'No Tags Export',
      trainers: [{ trainer: { name: 'TrainerShouldNotBeSeen' } }],
      tags: [{ tag: { name: 'CourseTagShouldNotBeSeen' } }],
      notes: [{ tags: [{ tag: { name: 'NoteTagShouldNotBeSeen' } }] }],
    }
    prismaMock.course.findUnique.mockResolvedValue(mockCourse as any)

    // --- WHEN ---
    const result = await exportMdFileLogic(
      { ...defaultInput, includeCourseTags: false },
      userId,
    )

    // --- THEN ---
    expect(result.markdown).not.toContain('CourseTagShouldNotBeSeen')
  })

  it('Respektiert includeNoteTags: false', async () => {
    // --- GIVEN ---
    const mockCourse = {
      id: courseId,
      title: 'No Tags Export',
      trainers: [{ trainer: { name: 'TrainerShouldNotBeSeen' } }],
      tags: [{ tag: { name: 'CourseTagShouldNotBeSeen' } }],
      notes: [{ tags: [{ tag: { name: 'NoteTagShouldNotBeSeen' } }] }],
    }
    prismaMock.course.findUnique.mockResolvedValue(mockCourse as any)

    // --- WHEN ---
    const result = await exportMdFileLogic(
      { ...defaultInput, includeNoteTags: false },
      userId,
    )

    // --- THEN ---
    expect(result.markdown).not.toContain('NoteTagShouldNotBeSeen')
  })

  it('Respektiert includeTrainers: false', async () => {
    // --- GIVEN ---
    const mockCourse = {
      id: courseId,
      title: 'No Tags Export',
      trainers: [{ trainer: { name: 'TrainerShouldNotBeSeen' } }],
      tags: [{ tag: { name: 'CourseTagShouldNotBeSeen' } }],
      notes: [{ tags: [{ tag: { name: 'NoteTagShouldNotBeSeen' } }] }],
    }
    prismaMock.course.findUnique.mockResolvedValue(mockCourse as any)

    // --- WHEN ---
    const result = await exportMdFileLogic(
      { ...defaultInput, includeTrainers: false },
      userId,
    )

    // --- THEN ---
    expect(result.markdown).not.toContain('TrainerShouldNotBeSeen')
  })
})
