import { ActionResponse, ClientLoggingMetadata } from '#/types/api'
import { requestIdMiddleware } from '#/middlewares/request-id'
import { authFnMiddleware } from '#/middlewares/auth'
import { logToDb } from '#/lib/logging'
import {
  EMPTY_CLIENT_LOGGING_METADATA,
  SERVER_ERROR_SANITIZED_MESSAGE,
} from './constants'
import { Session } from './auth'
import { createServerFn } from '@tanstack/react-start'

// Die neuen Builder für künftige Funktionen
export const publicFn = createServerFn().middleware([requestIdMiddleware])

export const authFn = createServerFn().middleware([
  requestIdMiddleware,
  authFnMiddleware,
])

/**
 * Eigene Fehlerklasse für Server Actions.
 * Wenn dieser Fehler geworfen wird, wird die Nachricht direkt an den Client weitergegeben.
 */
export class ServerActionError extends Error {
  public readonly isSafeForClient = true
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
  // ÄNDERUNG: requestId und correlationId müssen jetzt hier übergeben werden
  context: {
    session?: { user: { id: string } } | null
    requestId: string
    correlationId: string
  },
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
    const realErrorMessage =
      error instanceof Error ? error.message : String(error)

    // 1. Den echten (technischen) Fehler mit IDs in die DB loggen
    await logToDb({
      metadata: input.loggingMetadata ?? {},
      serverFunction: actionName,
      severity: 'error',
      message: realErrorMessage,
      userId: context?.session?.user?.id,
      requestId: context.requestId, // NEU
      correlationId: context.correlationId, // NEU
    }).catch((logError) => {
      console.error(
        `[${context.requestId}] Kritisch: Fehler konnte nicht in DB geloggt werden:`,
        logError,
      )
    })

    // Der robuste Check auf "sichere" Fehler
    const isSafeError =
      error instanceof ServerActionError ||
      (error !== null &&
        typeof error === 'object' &&
        'isSafeForClient' in error)

    // 2. Error Masking: Dem User die requestId mitsenden
    const clientErrorMessage = isSafeError
      ? realErrorMessage
      : `${SERVER_ERROR_SANITIZED_MESSAGE} (Referenz-Code: ${context.requestId})`

    return {
      success: false,
      error: clientErrorMessage,
    }
  }
}

export function createServerActionOptions(
  metadata = EMPTY_CLIENT_LOGGING_METADATA,
  session?: Session | null,
) {
  return { session: session?.session, metadata }
}
