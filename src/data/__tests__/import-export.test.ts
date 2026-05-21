import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDeep, mockReset } from 'vitest-mock-extended'
import type { DeepMockProxy } from 'vitest-mock-extended'
import type { PrismaClient } from '#/generated/prisma/client'
import { HTML_COMMENT_START, HTML_COMMENT_END } from '#/lib/constants.lib'
import { prisma } from '#/lib/db.lib.server'
import { prepareAndConvertHtmlToMarkdown } from '#/lib/convertHtmlToMarkdown.lib'
import {
  analyzeHtmlPayloadLogic,
  importHtmlFileLogic,
  exportMdFileLogic,
  importMdFileLogic,
} from '../import-export.logic.server'
import type { ExportMdFileSchema } from '#/schemas/export-file.schema'

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
  generateSignature: vi.fn().mockReturnValue('mock-signature-123'),
}))

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>
const convertMock = prepareAndConvertHtmlToMarkdown as any

describe('analyzeHtmlPayloadLogic', () => {
  const defaultUserId = 'user_123'
  const defaultInput = {
    content: '<html><body>Udemy Notes</body></html>',
    parsedTrainerUrl: 'https://udemy.com/user/max-mustermann/',
    // ... eventuelle weitere Felder aus AnalyzeHtmlPayloadSchema
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockReset(prismaMock) // Wichtig für saubere DB-Mocks pro Test
  })

  describe('Validierung & Fehler', () => {
    it('Wirft ServerActionError, wenn die Konvertierung fehlschlägt', async () => {
      // --- GIVEN ---
      convertMock.mockReturnValue({
        status: 'ERROR',
        message: 'Custom Error parsing HTML',
      })

      // --- WHEN & THEN ---
      // Wir übergeben input UND userId
      await expect(
        analyzeHtmlPayloadLogic(defaultInput as any, defaultUserId),
      ).rejects.toThrow('Custom Error parsing HTML')
    })
  })

  describe('Happy Path', () => {
    it('Parst HTML erfolgreich und erkennt einen UNBEKANNTEN Trainer', async () => {
      // --- GIVEN ---
      const mockCourse = {
        title: 'React Course',
        description: 'A great course',
        courseUrl: 'https://udemy.com/react',
        imageUrl: 'image.png',
        trainerUrl: 'https://udemy.com/user/max-mustermann/',
        notes: [
          {
            section: 'S1',
            lecture: 'L1',
            timestamp: '1:00',
            content: 'Note 1',
          },
        ],
      }

      convertMock.mockReturnValue({
        status: 'SUCCESS',
        course: mockCourse,
      })

      // NEU: Die URL ist global noch unbekannt
      prismaMock.trainer.findUnique.mockResolvedValue(null)

      // --- WHEN ---
      const result = await analyzeHtmlPayloadLogic(
        defaultInput as any,
        defaultUserId,
      )

      // --- THEN ---
      expect(convertMock).toHaveBeenCalledWith(
        defaultInput.content,
        expect.anything(),
      )

      // Prüfen, ob die Trainer-Abfrage abgesetzt wurde
      expect(prismaMock.trainer.findUnique).toHaveBeenCalledWith({
        where: { profileUrl: defaultInput.parsedTrainerUrl },
        select: { name: true },
      })

      // KORREKTUR: Die Course-Count-Abfrage darf jetzt gar nicht mehr aufgerufen werden!
      expect(prismaMock.course.count).not.toHaveBeenCalled()

      expect(result.parsedCourse.courseTitle).toBe('React Course')
      expect(result.trainerMatch.isKnown).toBe(false)
      expect(result.trainerMatch.existingCoursesCount).toBe(0)
      expect(result.trainerMatch.nameInDb).toBeUndefined()
    })

    it('Parst HTML erfolgreich und erkennt einen BEKANNTEN Trainer', async () => {
      // --- GIVEN ---
      convertMock.mockReturnValue({
        status: 'SUCCESS',
        course: { title: 'Vue Course', notes: [] },
      })

      // NEU: Der Trainer existiert global in der DB
      prismaMock.trainer.findUnique.mockResolvedValue({
        name: 'Max Mustermann',
      } as any)

      // Der Trainer hat bereits 3 Kurse bei diesem User
      prismaMock.course.count.mockResolvedValue(3)

      // --- WHEN ---
      const result = await analyzeHtmlPayloadLogic(
        defaultInput as any,
        defaultUserId,
      )

      // --- THEN ---
      expect(result.trainerMatch.isKnown).toBe(true)
      expect(result.trainerMatch.existingCoursesCount).toBe(3)
      expect(result.trainerMatch.nameInDb).toBe('Max Mustermann')
    })
  })
})

describe('importHtmlFileLogic', () => {
  const userId = 'user_123'

  // 1. NEU: Das Input-Objekt entspricht jetzt exakt dem Payload,
  // den der Client (unsere neue Import-Form) sendet!
  const defaultInput = {
    parsedCourse: {
      courseTitle: 'React Course',
      notes: [
        {
          timestamp: '1:00',
          section: 'S1',
          lecture: 'L1',
          content: 'Note 1',
        },
      ],
    },
    fileName: 'test.html',
    trainers: ['Maximilian Schwarzmüller'],
    tagIds: ['tag_1'],
    newPrivateTags: [],
    forceReplace: false,
  }

  beforeEach(() => {
    mockReset(prismaMock)
    vi.clearAllMocks()
  })

  // HINWEIS: Die alten Validierungs-Tests wurden entfernt, da diese
  // Logik jetzt in der Analyse-Funktion (Schritt 1) stattfindet.

  describe('Happy Path', () => {
    it('Erstellt einen neuen Kurs und neue Notizen erfolgreich', async () => {
      // --- GIVEN ---
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
      // Wir überschreiben den Default-Input, um den "neuen" bearbeiteten Text zu simulieren
      const conflictInput = {
        ...defaultInput,
        parsedCourse: {
          ...defaultInput.parsedCourse,
          notes: [
            {
              timestamp: '1:00',
              section: 'S1',
              lecture: 'L1',
              content: 'Changed Content', // Der geänderte Import-Text
            },
          ],
        },
      }

      // Bestehender Kurs
      prismaMock.course.findFirst.mockResolvedValue({
        id: 'existing_id',
        tags: [],
        trainers: [],
      } as any)
      prismaMock.course.update.mockResolvedValue({ id: 'existing_id' } as any)

      // Bestehende Notiz mit manuellem Edit in der Datenbank
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
      const result = await importHtmlFileLogic(conflictInput, userId)

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
// --- NEUER BLOCK: Tabula Rasa & Markdown Import Sicherheit ---
describe('importMdFileLogic (Tabula Rasa & Sicherheit)', () => {
  const userId = 'user_123'
  const targetCourseId = 'c_999'

  // Ein perfekt signierter Markdown-String für unsere Tests (DNA-Sicher)
  const mdContent = [
    HTML_COMMENT_START +
      ' udemy-course-meta: {"courseId":"' +
      targetCourseId +
      '","courseTitle":"DNA Title","sig":"mock-signature-123"} ' +
      HTML_COMMENT_END,
    '# DNA Title',
    HTML_COMMENT_START +
      ' udemy-note-meta: {"section":"S","lecture":"L","timestamp":"00:00","sig":"mock-signature-123"} ' +
      HTML_COMMENT_END,
    '## Note',
    '* Section: S',
    '* Lecture: L',
    '* Timestamp: 00:00',
    '### Content',
    'Valid content',
  ].join('\n')

  const baseInput = {
    content: mdContent,
    fileName: 'test.md',
    fileSize: 1000,
    trainers: [],
    tagIds: [],
    newPrivateTags: [],
    forceReplace: true, // Wir testen explizit das erzwungene Überschreiben
  }

  beforeEach(() => {
    mockReset(prismaMock)
    vi.clearAllMocks()
  })

  it('1. Tabula Rasa: Sollte den Kurs und Notizen löschen, wenn forceReplace=true und der Kurs dem User gehört', async () => {
    // --- GIVEN ---
    // Der findFirst wird zweimal aufgerufen:
    // 1. Im Tabula-Rasa-Check (wir sagen: Ja, Kurs gehört dem User -> Objekt zurückgeben)
    // 2. In der syncCourseToDatabase (wir sagen: Null, da er ja im Schritt davor gelöscht wurde)
    prismaMock.course.findFirst
      .mockResolvedValueOnce({ id: targetCourseId } as any)
      .mockResolvedValueOnce(null)

    prismaMock.course.create.mockResolvedValue({ id: 'new_id' } as any)

    // --- WHEN ---
    await importMdFileLogic(baseInput, userId)

    // --- THEN ---
    // Erwartung: Das System hat die alten Daten restlos gelöscht
    expect(prismaMock.note.deleteMany).toHaveBeenCalledWith({
      where: { courseId: targetCourseId },
    })
    expect(prismaMock.course.delete).toHaveBeenCalledWith({
      where: { id: targetCourseId },
    })
    // Und danach den Kurs neu angelegt
    expect(prismaMock.course.create).toHaveBeenCalled()
  })

  it('2. Eigentümer-Schutz: Sollte das Löschen VERWEIGERN, wenn der Kurs-Eigentümer nicht übereinstimmt', async () => {
    // --- GIVEN ---
    // User hat eine fremde ID ins Markdown geschmuggelt.
    // Der findFirst mit { id, userId } wird daher nichts finden -> null
    prismaMock.course.findFirst.mockResolvedValue(null)
    prismaMock.course.create.mockResolvedValue({ id: 'new_id' } as any)

    // --- WHEN ---
    await importMdFileLogic(baseInput, userId)

    // --- THEN ---
    // Erwartung: Das System ignoriert den Löschbefehl, da der Kurs dem User nicht gehört.
    expect(prismaMock.note.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.course.delete).not.toHaveBeenCalled()

    // Stattdessen wird der Kurs einfach als komplett neuer Kurs für diesen User angelegt.
    expect(prismaMock.course.create).toHaveBeenCalled()
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
