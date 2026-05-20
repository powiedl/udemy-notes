import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTagManagement } from '../use-tag-management.hook'
import * as ReactQuery from '@tanstack/react-query'
import type * as ReactRouter from '@tanstack/react-router'
import type * as ReactStart from '@tanstack/react-start'

// --- 1. MOCKS FÜR DATA & UTILS ---
// Wir mocken die Server-Funktionen, damit sie nicht wirklich ausgeführt werden
vi.mock('#/data/course', () => ({
  linkTagToCourseFn: vi.fn().mockResolvedValue({ success: true }),
  removeTagFromCourseFn: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('#/data/note', () => ({
  toggleNoteTagFn: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('#/data/tag', () => ({
  createAndLinkTagToTargetFn: vi.fn().mockResolvedValue({ success: true }),
}))

// handleAction auspacken, damit es das Promise einfach direkt ausführt
vi.mock('#/lib/client-utils', () => ({
  handleAction: vi.fn(async (promise) => {
    const result = await promise
    // Falls die Funktion nichts zurückgibt, tun wir so als wäre sie erfolgreich
    return result || { success: true }
  }),
}))

// --- 2. MOCKS FÜR ROUTER & TANSTACK ---
const mockInvalidate = vi.fn()
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>()
  return {
    ...actual,
    useRouter: () => ({ invalidate: mockInvalidate }),
  }
})

vi.mock('@tanstack/react-start', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactStart>()
  return {
    ...actual,
    useServerFn: vi.fn((fn) => fn),
  }
})

const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
    useQuery: vi.fn().mockReturnValue({ data: [{ id: '1', name: 'MockTag' }] }),
  }
})

describe('useTagManagement Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ==========================================
  // BLOCK 1: READ-ONLY vs. EDIT MODUS (Hosenträger)
  // ==========================================
  describe('Read-Only Behavior', () => {
    it('works normally in EDIT mode (readOnly = false)', () => {
      const { result } = renderHook(() =>
        useTagManagement('target-1', 'course', 'TestComponent', false),
      )

      expect(typeof result.current.handleLink).toBe('function')
      const useQueryCallArgs = vi.mocked(ReactQuery.useQuery).mock
        .calls[0][0] as any
      expect(useQueryCallArgs.enabled).toBe(true)
    })

    it('blocks all interactions in READ-ONLY mode (readOnly = true)', () => {
      const { result } = renderHook(() =>
        useTagManagement('target-1', 'course', 'TestComponent', true),
      )

      expect(result.current.handleLink).toBeUndefined()
      expect(result.current.handleCreateAndLink).toBeUndefined()
      expect(result.current.handleDeleteTagAssociation).toBeUndefined()

      const useQueryCallArgs = vi.mocked(ReactQuery.useQuery).mock
        .calls[0][0] as any
      expect(useQueryCallArgs.enabled).toBe(false)
    })
  })

  // ==========================================
  // BLOCK 2: STATE-VERWALTUNG
  // ==========================================
  describe('Local State Management', () => {
    it('initializes with correct default states', () => {
      const { result } = renderHook(() =>
        useTagManagement('1', 'course', 'Test'),
      )

      expect(result.current.isAdding).toBe(false)
      expect(result.current.tagQuery).toBe('')
      expect(result.current.deletingTagId).toBeNull()
      expect(result.current.availableTags).toHaveLength(1) // Wegen unseres useQuery Mocks
    })

    it('updates simple states correctly', () => {
      const { result } = renderHook(() =>
        useTagManagement('1', 'course', 'Test'),
      )

      // State-Updates müssen in act() gewrappt werden!
      act(() => {
        result.current.setIsAdding(true)
        result.current.setTagQuery('New Tag')
      })

      expect(result.current.isAdding).toBe(true)
      expect(result.current.tagQuery).toBe('New Tag')
    })
  })

  // ==========================================
  // BLOCK 3: AKTIONEN & MUTATIONEN
  // ==========================================
  describe('Actions and Server Functions', () => {
    it('handleLink calls correct note-function and resets state', async () => {
      const { toggleNoteTagFn } = await import('#/data/note.data')
      const { result } = renderHook(() =>
        useTagManagement('note-1', 'note', 'Test'),
      )

      // Vorbedingungen setzen
      act(() => {
        result.current.setIsAdding(true)
        result.current.setTagQuery('search...')
      })

      // Aktion ausführen (da es asynchron ist und State ändert: await act())
      await act(async () => {
        await result.current.handleLink?.('tag-123')
      })

      // Prüfen, ob die Funktion für NOTIZEN gerufen wurde
      expect(toggleNoteTagFn).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            noteId: 'note-1',
            tagId: 'tag-123',
            action: 'add',
          }),
        }),
      )

      // Prüfen, ob UI zurückgesetzt wurde
      expect(result.current.isAdding).toBe(false)
      expect(result.current.tagQuery).toBe('')
      expect(mockInvalidate).toHaveBeenCalled()
    })

    it('handleCreateAndLink bails out if tag name is empty', async () => {
      const { createAndLinkTagToTargetFn } = await import('#/data/tag.data')
      const { result } = renderHook(() =>
        useTagManagement('course-1', 'course', 'Test'),
      )

      await act(async () => {
        // Leerer String mit Leerzeichen
        await result.current.handleCreateAndLink?.('   ')
      })

      // Darf nicht aufgerufen worden sein
      expect(createAndLinkTagToTargetFn).not.toHaveBeenCalled()
    })

    it('handleDeleteTagAssociation sets deletingTagId temporarily and removes tag from course', async () => {
      const { removeTagFromCourseFn } = await import('#/data/course.data')
      const { result } = renderHook(() =>
        useTagManagement('course-1', 'course', 'Test'),
      )

      // Wir führen die Lösch-Aktion aus
      await act(async () => {
        await result.current.handleDeleteTagAssociation?.('tag-999')
      })

      // Prüfen, ob die Backend-Funktion gerufen wurde
      expect(removeTagFromCourseFn).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            courseId: 'course-1',
            tagId: 'tag-999',
          }),
        }),
      )

      // Prüfen, ob router invalidiert wurde
      expect(mockInvalidate).toHaveBeenCalled()

      // WICHTIG: Prüfen, ob der deletingTagId im `finally`-Block wieder gelöscht wurde
      expect(result.current.deletingTagId).toBeNull()
    })
  })
})
