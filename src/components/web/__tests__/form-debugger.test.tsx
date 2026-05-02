import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FormDebugger } from '../form-debugger'
import { z } from 'zod'

// 1. Mock für die TanStack Subscribe Komponente
const mockForm = {
  state: { values: { email: '' } },
  validate: vi.fn().mockResolvedValue(undefined),
  setFieldMeta: vi.fn(),
  // Wir simulieren das Subscribe-Verhalten
  Subscribe: ({ children, selector }: any) => {
    const state = {
      values: { email: 'invalid-email' },
      errorMap: {},
      fieldMeta: {},
      isValid: true, // Wir simulieren einen "Sync Loss": Library sagt OK
    }
    return children(selector ? selector(state) : state)
  },
}

const testSchema = z.object({
  email: z.string().email('Ungültige E-Mail Adresse'),
})

describe('FormDebugger Component', () => {
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

  it('sollte die JSON-Werte anzeigen, wenn man den Details-Bereich öffnet', () => {
    render(<FormDebugger form={mockForm} />)

    const jsonOutput = screen.getByText(/"email": "invalid-email"/i)
    expect(jsonOutput).toBeInTheDocument()
  })
})
