/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCourseActions } from '../use-course-actions.hook'
import { handleAction } from '#/lib/client-utils.lib'
import { useRouter } from '@tanstack/react-router'

// --- MOCKS ---

// 1. Router mocken
vi.mock('@tanstack/react-router', () => ({
  useRouter: vi.fn(),
}))

// 2. React Start Server Functions mocken
// useServerFn reicht die Funktion im Test meistens einfach durch,
// aber wir spionieren sie hier explizit aus.
vi.mock('@tanstack/react-start', () => ({
  useServerFn: vi.fn((fn) => fn),
}))

// 3. Echte Server-Aufrufe mocken
const mockExportFn = vi.fn()
const mockDeleteFn = vi.fn()
const mockShareFn = vi.fn()

vi.mock('#/data/import-export.data', () => ({
  exportMdFileFn: (...args: any[]) => mockExportFn(...args),
}))
vi.mock('#/data/course.data', () => ({
  deleteCourseByIdFn: (...args: any[]) => mockDeleteFn(...args),
  createShareLinkFn: (...args: any[]) => mockShareFn(...args),
}))

// 4. Client Utils (handleAction) mocken
vi.mock('#/lib/client-utils.lib', () => ({
  handleAction: vi.fn(),
}))

describe('useCourseActions Hook', () => {
  const mockInvalidate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // Default Router Mock
    vi.mocked(useRouter).mockReturnValue({ invalidate: mockInvalidate } as any)

    // DOM APIs Mocken
    global.URL.createObjectURL = vi.fn(() => 'blob:dummy-url')
    global.URL.revokeObjectURL = vi.fn()

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('handleDelete', () => {
    it('Happy Path: Löscht den Kurs und invalidiert den Router', async () => {
      // GIVEN
      mockDeleteFn.mockReturnValue('delete-promise')
      vi.mocked(handleAction).mockResolvedValue(true)

      const { result } = renderHook(() => useCourseActions())

      // WHEN
      await act(async () => {
        await result.current.handleDelete('course-123')
      })

      // THEN
      expect(mockDeleteFn).toHaveBeenCalledWith({
        data: {
          id: 'course-123',
          loggingMetadata: expect.any(Object),
        },
      })
      // Prüfen, ob handleAction mit dem Promise der deleteFn aufgerufen wurde
      expect(handleAction).toHaveBeenCalledWith(
        'delete-promise',
        expect.objectContaining({
          successToast: 'Course deleted successfully',
        }),
      )
      expect(mockInvalidate).toHaveBeenCalled()
    })

    it('Error Path: Bricht ab und invalidiert nicht, wenn handleAction fehlschlägt', async () => {
      // GIVEN
      vi.mocked(handleAction).mockRejectedValue(new Error('Server Error'))

      const { result } = renderHook(() => useCourseActions())

      // WHEN
      await act(async () => {
        await result.current.handleDelete('course-123')
      })

      // THEN
      expect(mockInvalidate).not.toHaveBeenCalled()
    })
  })

  describe('handleShare', () => {
    it('Happy Path: Erstellt einen Token und kopiert den absoluten Link ins Clipboard', async () => {
      // GIVEN
      mockShareFn.mockReturnValue('share-promise')
      vi.mocked(handleAction).mockResolvedValue({ token: 'secure-token-xyz' })

      const { result } = renderHook(() => useCourseActions())

      // WHEN
      await act(async () => {
        await result.current.handleShare('course-456')
      })

      // THEN
      expect(mockShareFn).toHaveBeenCalledWith({
        data: expect.objectContaining({ courseId: 'course-456' }),
      })

      // Prüfen, ob der Clipboard-Aufruf den Token enthält
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/share-public/secure-token-xyz'),
      )
    })

    it('Error Path: Schreibt nichts ins Clipboard, wenn Server fehlschlägt', async () => {
      // GIVEN
      vi.mocked(handleAction).mockRejectedValue(new Error('Failed'))

      const { result } = renderHook(() => useCourseActions())

      // WHEN
      await act(async () => {
        await result.current.handleShare('course-456')
      })

      // THEN
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
    })
  })

  describe('handleExport', () => {
    const mockExportData = {
      courseId: 'course-789',
      includeCourseTags: true,
      includeNoteTags: true,
      includeNotesMetadata: false,
      includeTrainers: true,
      includeCourseDescription: true,
      includeCourseLinks: false,
      noteVersion: 'original' as const,
    }

    it('Happy Path: Konvertiert Markdown in einen Blob und triggert den Download', async () => {
      // GIVEN
      mockExportFn.mockReturnValue('export-promise')
      vi.mocked(handleAction).mockResolvedValue({ markdown: '# Hello Course' })

      // Anchor-Element (Link) im DOM abfangen
      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
      }
      const createElementSpy = vi
        .spyOn(document, 'createElement')
        .mockReturnValue(mockAnchor as any)
      const appendChildSpy = vi
        .spyOn(document.body, 'appendChild')
        .mockImplementation(() => document.body)
      const removeChildSpy = vi
        .spyOn(document.body, 'removeChild')
        .mockImplementation(() => document.body)

      const { result } = renderHook(() => useCourseActions())

      // WHEN
      await act(async () => {
        await result.current.handleExport(mockExportData)
      })

      // THEN
      expect(mockExportFn).toHaveBeenCalledWith({
        data: expect.objectContaining({
          courseId: 'course-789',
          includeTrainers: true,
        }),
      })

      // Prüfen der DOM-Manipulationen für den Datei-Download
      expect(createElementSpy).toHaveBeenCalledWith('a')
      expect(mockAnchor.download).toBe('course-course-789.md')
      expect(mockAnchor.href).toBe('blob:dummy-url')

      // Hat er ihn angehängt, geklickt und wieder entfernt?
      expect(appendChildSpy).toHaveBeenCalledWith(mockAnchor)
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(removeChildSpy).toHaveBeenCalledWith(mockAnchor)

      // Wurde der Blob-Speicher wieder freigegeben?
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:dummy-url')
    })

    it('Error Path: Bricht DOM-Manipulation ab, wenn der Export fehlschlägt', async () => {
      // GIVEN
      vi.mocked(handleAction).mockRejectedValue(new Error('Export Failed'))
      const createElementSpy = vi.spyOn(document, 'createElement')

      const { result } = renderHook(() => useCourseActions())

      // WHEN
      await act(async () => {
        await result.current.handleExport(mockExportData)
      })

      // THEN
      expect(createElementSpy).not.toHaveBeenCalledWith('a')
    })
  })
})
