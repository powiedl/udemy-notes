import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FormDebugger } from '../form-debugger'
import { z } from 'zod'

// 1. Mock für die TanStack Subscribe Komponente
const mockForm = {
  state: { values: { email: '' } },
  validate: vi.fn().mockResolvedValue(undefined),
  setFieldMeta: vi.fn(),
  Subscribe: ({ children, selector }: any) => {
    const state = {
      values: { email: 'invalid-email' },
      errorMap: {},
      fieldMeta: {},
      isValid: true,
    }
    return children(selector ? selector(state) : state)
  },
}

const testSchema = z.object({
  email: z.string().email('Ungültige E-Mail Adresse'),
})

describe('FormDebugger Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Wir aktivieren Fake Timers, um die Zeit im Test zu kontrollieren
    vi.useFakeTimers()
  })

  afterEach(() => {
    // Wichtig: Nach jedem Test die echten Timer wiederherstellen
    vi.useRealTimers()
  })

  it('sollte in Production absolut nichts rendern', () => {
    // Wir nutzen den eingebauten Vitest-Stub.
    // Das ist typsicher und wird vom Linter geliebt.
    vi.stubEnv('NODE_ENV', 'production')

    const { container } = render(<FormDebugger form={mockForm} />)

    expect(container.firstChild).toBeNull()

    // Wichtig: Den Stub nach dem Test wieder aufheben,
    // damit andere Tests nicht beeinflusst werden.
    vi.unstubAllEnvs()
  })

  it('sollte Zod-Schema-Fehler korrekt anzeigen', () => {
    render(<FormDebugger form={mockForm} schema={testSchema} />)

    expect(screen.getByText(/Ungültige E-Mail Adresse/i)).toBeInTheDocument()
    expect(screen.getByText(/email:/i)).toBeInTheDocument()
  })

  it('sollte die "Sync Loss" Warnung anzeigen, wenn Library und Schema divergieren', () => {
    render(<FormDebugger form={mockForm} schema={testSchema} />)

    // Da mockForm.isValid = true, aber das Schema fehlschlägt:
    expect(screen.getByText(/Sync Loss/i)).toBeInTheDocument()
    // LED sollte rot sein (durch die CSS Klasse geprüft)
    const led = screen.getByRole('heading').previousSibling
    expect(led).toHaveClass('bg-red-500')
  })

  it('sollte bei Klick auf "Force Validation" die Formular-Methoden triggern', async () => {
    render(<FormDebugger form={mockForm} schema={testSchema} />)

    const button = screen.getByRole('button', { name: /Force Validation/i })

    await act(async () => {
      fireEvent.mouseDown(button)
    })

    // Prüfen, ob die Library-Methoden aufgerufen wurden
    expect(mockForm.validate).toHaveBeenCalledWith('change')
    expect(mockForm.setFieldMeta).toHaveBeenCalled()
  })

  it('sollte den Timer beim Unmounten sauber löschen (Cleanup)', async () => {
    // Wir spionieren global.clearTimeout aus
    const spyClearTimeout = vi.spyOn(global, 'clearTimeout')

    const { unmount } = render(
      <FormDebugger form={mockForm} schema={testSchema} />,
    )
    const button = screen.getByRole('button', { name: /Force Validation/i })

    // 1. Timer durch Klick starten
    await act(async () => {
      fireEvent.mouseDown(button)
    })

    // 2. Sofort unmounten (bevor die 200ms um sind)
    unmount()

    // 3. Prüfen, ob die Cleanup-Funktion den Timer gelöscht hat
    expect(spyClearTimeout).toHaveBeenCalled()

    // 4. Zeit vorspulen: Wenn der Cleanup nicht funktioniert hätte,
    // würde Vitest hier (oder kurz danach) den ReferenceError werfen.
    act(() => {
      vi.runAllTimers()
    })

    spyClearTimeout.mockRestore()
  })

  it('sollte die JSON-Werte anzeigen, wenn man den Details-Bereich öffnet', () => {
    render(<FormDebugger form={mockForm} />)

    const jsonOutput = screen.getByText(/"email": "invalid-email"/i)
    expect(jsonOutput).toBeInTheDocument()
  })
})
