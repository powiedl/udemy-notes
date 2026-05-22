import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CourseHeader from '../course-header'
import type * as ReactRouter from '@tanstack/react-router'
import type * as ReactStart from '@tanstack/react-start'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// --- MOCKS ---
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>()
  return {
    ...actual,
    useRouter: () => ({ invalidate: vi.fn() }),
    Link: ({ children }: any) => <a>{children}</a>,
  }
})

vi.mock('@tanstack/react-start', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactStart>()
  return {
    ...actual,
    useServerFn: vi.fn(),
  }
})

// Wir mocken unseren eigenen Hook, damit wir uns rein auf die UI konzentrieren können
vi.mock('#/hooks/use-tag-management', () => ({
  useTagManagement: () => ({
    availableTags: [],
    isPending: false,
    deletingTagId: null,
    handleLink: vi.fn(),
    handleCreateAndLink: vi.fn(),
    handleDeleteTagAssociation: vi.fn(),
  }),
}))

describe('CourseHeader Component', () => {
  // --- NEU: Wir erstellen einen frischen QueryClient für die Tests ---
  // Wir schalten 'retry' ab, damit fehlschlagende Queries im Test nicht in Endlosschleifen hängen
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  const mockCourse = {
    id: 'course-1',
    title: 'Advanced React',
    tags: [],
    trainers: [],
    _count: { notes: 5 },
  } as any

  it('renders all action buttons in EDIT mode (readOnly = false)', () => {
    // --- NEU: Wir wrappen die Komponente in den QueryClientProvider ---
    render(
      <QueryClientProvider client={queryClient}>
        <CourseHeader
          course={mockCourse}
          readOnly={false}
          onExport={vi.fn()}
          onDelete={vi.fn()}
          onShare={vi.fn()}
        />
      </QueryClientProvider>,
    )

    // Alle Admin/Edit-Aktionen sollten sichtbar sein
    expect(screen.getByTitle('Share Course')).toBeInTheDocument()
    // Auto-Tag, Export und Delete haben Text-Spans, die auf größeren Screens sichtbar sind
    expect(screen.getByText('Auto-Tag')).toBeInTheDocument()
    expect(screen.getByText('Export')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('hides all action buttons in READ-ONLY mode (readOnly = true)', () => {
    // --- NEU: Wir wrappen die Komponente in den QueryClientProvider ---
    render(
      <QueryClientProvider client={queryClient}>
        <CourseHeader course={mockCourse} readOnly={true} />
      </QueryClientProvider>,
    )

    // Elementarer Check: Sind die Daten trotzdem da?
    expect(
      screen.getByRole('heading', { name: 'Advanced React' }),
    ).toBeInTheDocument()
    expect(screen.getByText('5 notes')).toBeInTheDocument()

    // Sicherheits-Check: Sind die Buttons weg?
    expect(screen.queryByTitle('Share Course')).not.toBeInTheDocument()
    expect(screen.queryByText('Auto-Tag')).not.toBeInTheDocument()
    expect(screen.queryByText('Export')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
  })
})
