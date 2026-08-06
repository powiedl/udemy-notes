import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react' // <-- 'act' importieren
import CourseHeader from '../course-header'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import type * as ReactStart from '@tanstack/react-start'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// --- MOCKS ---
vi.mock('@tanstack/react-start', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactStart>()
  return {
    ...actual,
    useServerFn: vi.fn(),
  }
})

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
  const mockCourse = {
    id: 'course-1',
    title: 'Advanced React',
    tags: [],
    trainers: [],
    _count: { notes: 5 },
  } as any

  async function renderWithProviders(ui: React.ReactElement) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const rootRoute = createRootRoute({
      component: () => ui,
    })

    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    // Render-Vorgang in act() verpacken, um die internen Router-Transitions abzufangen
    let renderResult: ReturnType<typeof render>
    await act(async () => {
      renderResult = render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      )
    })

    return renderResult!
  }

  it('renders all action buttons in EDIT mode (readOnly = false)', async () => {
    await renderWithProviders(
      <CourseHeader
        course={mockCourse}
        readOnly={false}
        onExport={vi.fn()}
        onDelete={vi.fn()}
        onShare={vi.fn()}
      />,
    )

    expect(screen.getByTitle('Share Course')).toBeInTheDocument()
    expect(screen.getByText('Auto-Tag')).toBeInTheDocument()
    expect(screen.getByText('Export')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('hides all action buttons in READ-ONLY mode (readOnly = true)', async () => {
    await renderWithProviders(
      <CourseHeader course={mockCourse} readOnly={true} />,
    )

    expect(
      screen.getByRole('heading', { name: 'Advanced React' }),
    ).toBeInTheDocument()
    expect(screen.getByText('5 notes')).toBeInTheDocument()

    expect(screen.queryByTitle('Share Course')).not.toBeInTheDocument()
    expect(screen.queryByText('Auto-Tag')).not.toBeInTheDocument()
    expect(screen.queryByText('Export')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
  })
})
