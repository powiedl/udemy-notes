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

    if (!result.success) {
      if (showErrorToast) toast.error(options?.errorToast || result.error)
      throw new ActionAbortedError(result.error)
    }

    if (showSuccessToast && (options?.successToast || result.message)) {
      toast.success(options?.successToast || result.message)
    }

    return result.data
  } catch (err) {
    if (err instanceof ActionAbortedError) {
      throw err
    }
    toast.error('Network or server error')
    throw new ActionAbortedError('Network or server error')
  }
}
