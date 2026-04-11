import { toast } from 'sonner'
import { ActionResponse } from '#/types/api'

export class ActionAbortedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ActionAbortedError'
    Object.setPrototypeOf(this, ActionAbortedError.prototype)
  }
}

/**
 * Optionen für die handleAction-Funktion, um das Verhalten von Toasts anzupassen.
 */
export interface HandleActionOptions {
  successToast?: string // Benutzerdefinierte Erfolgsmeldung für den Toast
  errorToast?: string // Benutzerdefinierte Fehlermeldung für den Toast
  showSuccessToast?: boolean // Steuert, ob ein Erfolgs-Toast angezeigt werden soll (Standard: true)
  showErrorToast?: boolean // Steuert, ob ein Fehler-Toast angezeigt werden soll (Standard: true)
}

/**
 * Ein globaler Helfer, um Server Actions zu wrappen, Toasts anzuzeigen
 * und Fehler konsistent zu behandeln.
 *
 * @param promise Das Promise, das eine ActionResponse<T> zurückgibt.
 * @param options Optionale Einstellungen für die Toast-Anzeige.
 * @returns Die Daten der erfolgreichen Aktion (T).
 * @throws Einen Error, wenn die Aktion fehlschlägt.
 */
export async function handleAction<T>(
  promise: Promise<ActionResponse<T>>,
  options?: HandleActionOptions,
): Promise<T> {
  const showSuccessToast = options?.showSuccessToast ?? true
  const showErrorToast = options?.showErrorToast ?? true

  try {
    const result = await promise

    // --- FALL 1: FEHLER ---
    if (!result.success) {
      if (showErrorToast) {
        const toastId = toast.error(options?.errorToast || result.error, {
          duration: result.requestId ? 600000 : 5000, // 10 Min. wenn ID da ist
          description: result.requestId
            ? `Referenz: ${result.requestId}`
            : undefined,
          action: result.requestId
            ? {
                label: 'ID kopieren',
                onClick: (e) => {
                  e.preventDefault()
                  if (result.requestId) {
                    navigator.clipboard.writeText(result.requestId)
                    toast.success('ID in Zwischenablage kopiert')
                    toast.dismiss(toastId) // Schließt den Fehler-Toast automatisch
                  }
                },
              }
            : undefined,
        })
      }
      throw new ActionAbortedError(result.error)
    }

    // --- FALL 2: ERFOLG ---
    // Hier ist er wieder, der verlorene Sohn!
    if (showSuccessToast && (options?.successToast || result.message)) {
      toast.success(options?.successToast || result.message)
    }

    return result.data
  } catch (err) {
    if (err instanceof ActionAbortedError) {
      throw err
    }

    // Unerwartete Fehler (Netzwerk-Timeout etc.)
    toast.error('Netzwerk- oder Serverfehler')
    throw new ActionAbortedError('Netzwerk- oder Serverfehler')
  }
}
