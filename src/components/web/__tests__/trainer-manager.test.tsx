import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TrainerManager } from '../trainer-manager'

// --- 1. MOCKS FÜR EXTERNE LIBRARIES ---

// Router mocken
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
}))

// React Query mocken
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

// Server Functions & Server Actions mocken
vi.mock('@tanstack/react-start', () => ({
  useServerFn: (fn: any) => fn, // Gibt die Funktion einfach zurück
}))

vi.mock('#/data/course.data', () => ({
  addTrainerToCourseFn: vi.fn(),
  createAndLinkTrainerToCourseFn: vi.fn(),
  removeTrainerFromCourseFn: vi.fn(),
}))

vi.mock('#/lib/client-utils.lib', () => ({
  handleAction: vi.fn((promise) => promise), // Führt das Promise direkt aus
}))

// Den Trainer Query Hook mocken, der die Suggestions liefert
vi.mock('#/hooks/use-trainer-query.hook', () => ({
  useTrainerQuery: () => ({
    data: {
      suggestions: [{ id: 't-new', name: 'New Trainer' }],
      hasMore: false,
    },
    isFetching: false,
  }),
}))

// --- 2. DIE TESTS ---

describe('TrainerManager Component', () => {
  const defaultTrainers = [
    { id: 't-1', name: 'Max Mustermann', isDeletable: true },
    {
      id: 't-2',
      name: 'Erika Musterfrau',
      profileUrl: 'https://erika.dev',
      isDeletable: true,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('open', vi.fn())

    // Polyfill für den ResizeObserver, damit cmdk nicht abstürzt
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    // NEU: Polyfill für scrollIntoView, da jsdom das nicht unterstützt
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('renders existing trainers', () => {
    render(<TrainerManager courseId="c-1" trainers={defaultTrainers} />)

    expect(screen.getByText('Max Mustermann')).toBeInTheDocument()
    expect(screen.getByText('Erika Musterfrau')).toBeInTheDocument()
  })

  it('shows delete buttons (X) only when isEditable is true', () => {
    const { rerender } = render(
      <TrainerManager
        courseId="c-1"
        trainers={defaultTrainers}
        isEditable={true}
      />,
    )

    // Wenn editierbar, sollten Buttons zum Entfernen da sein (title="remove tag")
    expect(screen.getAllByTitle('remove tag')).toHaveLength(2)

    // Jetzt rerendern wir im Read-Only Modus
    rerender(
      <TrainerManager
        courseId="c-1"
        trainers={defaultTrainers}
        isEditable={false}
      />,
    )

    // Die Delete-Buttons müssen verschwunden sein
    expect(screen.queryByTitle('remove tag')).not.toBeInTheDocument()
  })

  it('calls the remove function when clicking the delete (X) button', async () => {
    const user = userEvent.setup()
    const { removeTrainerFromCourseFn } = await import('#/data/course.data')

    render(
      <TrainerManager
        courseId="c-1"
        trainers={defaultTrainers}
        isEditable={true}
      />,
    )

    // Klicke auf das erste "X" (das von Max)
    const removeButtons = screen.getAllByTitle('remove tag')
    await user.click(removeButtons[0])

    // Prüfen, ob die Serverfunktion mit den richtigen Parametern aufgerufen wurde
    expect(removeTrainerFromCourseFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        courseId: 'c-1',
        trainerId: 't-1',
      }),
    })
  })

  it('opens a popup window when clicking a trainer with a profileUrl', async () => {
    const user = userEvent.setup()

    render(<TrainerManager courseId="c-1" trainers={defaultTrainers} />)

    // Erika hat eine URL, Max nicht. Wir klicken auf Erikas Text.
    const erikaTag = screen.getByText('Erika Musterfrau')
    await user.click(erikaTag)

    // Prüfen, ob window.open mit der korrekten URL und Window-Features aufgerufen wurde
    expect(window.open).toHaveBeenCalledWith(
      'https://erika.dev',
      'TrainerProfile',
      expect.stringContaining('width='), // Wir prüfen nur grob, ob die Features generiert wurden
    )
  })

  it('can search and add a new trainer via the popover', async () => {
    const user = userEvent.setup()
    const { addTrainerToCourseFn } = await import('#/data/course.data')

    render(
      <TrainerManager
        courseId="c-1"
        trainers={defaultTrainers}
        isEditable={true}
      />,
    )

    // 1. Popover öffnen (Klick auf den Plus-Button)
    const addButton = screen.getByTitle('add a trainer')
    await user.click(addButton)

    // 2. Tippen, um den Query auszulösen
    const searchInput = screen.getByPlaceholderText('search trainer ...')
    await user.type(searchInput, 'New')

    // 3. Den gemockten Trainer aus der Liste auswählen
    const suggestion = await screen.findByText('New Trainer')
    await user.click(suggestion)

    // 4. Prüfen, ob die Funktion zum Hinzufügen aufgerufen wurde
    expect(addTrainerToCourseFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        courseId: 'c-1',
        trainerId: 't-new',
      }),
    })
  })
})
