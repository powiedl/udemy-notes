import { ActionResponse, ClientLoggingMetadata } from '#/types/api'
import { logToDb } from '#/lib/logging'
import {
  EMPTY_CLIENT_LOGGING_METADATA,
  SERVER_ERROR_SANITIZED_MESSAGE,
} from './constants'
import { Session } from './auth'

/**
 * Eigene Fehlerklasse für Server Actions.
 * Wenn dieser Fehler geworfen wird, wird die Nachricht direkt an den Client weitergegeben.
 */
export class ServerActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServerActionError'
    // WICHTIG: Repariert instanceof in kompiliertem JS
    Object.setPrototypeOf(this, ServerActionError.prototype)
  }
}

/**
 * Ein globaler Wrapper für Server Actions, der Logging und standardisierte
 * Fehlerbehandlung (Sicherheit vor technischen Details) übernimmt.
 */
export async function wrapServerAction<T>(
  actionName: string,
  context: { session?: { user: { id: string } } | null },
  input: { loggingMetadata?: ClientLoggingMetadata },
  action: () => Promise<T>,
  successMessage?: string,
): Promise<ActionResponse<T>> {
  try {
    const data = await action()
    return {
      success: true,
      data,
      message: successMessage,
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unbekannter Fehler'

    // 1. Den echten (technischen) Fehler für Debugging-Zwecke in die DB loggen
    await logToDb({
      metadata: input.loggingMetadata ?? {},
      serverFunction: actionName,
      severity: 'error',
      message: errorMessage,
      userId: context?.session?.user?.id,
    }).catch((logError) => {
      console.error(
        'Kritisch: Fehler konnte nicht in DB geloggt werden:',
        logError,
      )
    })
    if (process.env.NODE_ENV === 'development') {
      console.error(`[ServerAction: ${actionName}] Fehler:`, error)
    }

    // 2. Antwort an den Client vorbereiten
    // Wenn es ein expliziter ServerActionError ist, schicken wir die Nachricht durch.
    if (error instanceof ServerActionError) {
      return {
        success: false,
        error: error.message,
      }
    }

    // Ansonsten maskieren wir den Fehler aus Sicherheitsgründen.
    return {
      success: false,
      error: SERVER_ERROR_SANITIZED_MESSAGE,
    }
  }
}

export function createServerActionOptions(
  metadata = EMPTY_CLIENT_LOGGING_METADATA,
  session?: Session | null,
) {
  return { session: session?.session, metadata }
}
