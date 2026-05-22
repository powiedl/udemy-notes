import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleAction, ActionAbortedError } from '#/lib/client-utils.lib'
import { toast } from 'sonner'

// 1. Wir mocken Sonner, damit keine echten DOM-Elemente gerendert werden müssen
vi.mock('sonner', () => ({
  toast: {
    // Wir geben eine fiktive ID zurück, damit wir testen können, ob dismiss() richtig aufgerufen wird
    error: vi.fn(() => 'toast-id-123'),
    success: vi.fn(),
    dismiss: vi.fn(),
  },
}))

// 2. Wir mocken die globale Browser-Zwischenablage
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
})

describe('handleAction Utility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sollte bei Erfolg die Daten zurückgeben und einen Success-Toast zeigen', async () => {
    const mockResponse = {
      success: true,
      data: { id: 1 },
      message: 'Aktion erfolgreich!',
    }

    // handleAction erwartet ein Promise
    const result = await handleAction(Promise.resolve(mockResponse as any))

    expect(result).toEqual({ id: 1 })
    expect(toast.success).toHaveBeenCalledWith('Aktion erfolgreich!')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('sollte bei einem normalen Fehler (ohne ID) einen Standard-Error-Toast zeigen', async () => {
    const mockResponse = {
      success: false,
      error: 'Einfacher Validierungsfehler',
    }

    // Da handleAction bei Fehlern einen ActionAbortedError wirft, müssen wir das abfangen
    await expect(
      handleAction(Promise.resolve(mockResponse as any)),
    ).rejects.toThrow(ActionAbortedError)

    expect(toast.error).toHaveBeenCalledWith(
      'Einfacher Validierungsfehler',
      expect.objectContaining({
        duration: 5000,
        action: undefined, // Kein Kopier-Button!
      }),
    )
  })

  it('sollte bei einem harten Fehler (mit ID) einen Sticky-Toast mit Kopier-Button zeigen', async () => {
    const mockResponse = {
      success: false,
      error: 'Server explodiert',
      requestId: 'req_999',
    }

    await expect(
      handleAction(Promise.resolve(mockResponse as any)),
    ).rejects.toThrow(ActionAbortedError)

    // Prüfen, ob die Konfiguration für den permanenten Toast stimmt
    expect(toast.error).toHaveBeenCalledWith(
      'Server explodiert',
      expect.objectContaining({
        duration: expect.any(Number), // Infinity oder 600000 je nach deiner finalen Implementierung
        description: 'Referenz: req_999',
        action: expect.objectContaining({
          label: 'ID kopieren',
          onClick: expect.any(Function),
        }),
      }),
    )
  })

  it('sollte beim Klick auf "ID kopieren" die ID ins Clipboard legen und den Toast schließen', async () => {
    const mockResponse = {
      success: false,
      error: 'Harter Fehler',
      requestId: 'req_999',
    }

    await expect(
      handleAction(Promise.resolve(mockResponse as any)),
    ).rejects.toThrow(ActionAbortedError)

    // 1. Wir "klauen" uns die onClick-Funktion aus dem Mock-Aufruf, den handleAction gemacht hat
    const errorCallArgs = vi.mocked(toast.error).mock.calls[0]
    const toastOptions = errorCallArgs[1] as any
    const onClickFn = toastOptions.action.onClick

    // 2. Wir simulieren das Event-Objekt für den Klick
    const mockEvent = { preventDefault: vi.fn() }

    // 3. Wir führen den Klick manuell aus
    onClickFn(mockEvent)

    // 4. Was sollte jetzt passiert sein?
    expect(mockEvent.preventDefault).toHaveBeenCalled()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('req_999')
    expect(toast.success).toHaveBeenCalledWith('ID in Zwischenablage kopiert')
    expect(toast.dismiss).toHaveBeenCalledWith('toast-id-123') // Genau die ID aus unserem Mock!
  })
})
