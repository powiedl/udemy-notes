import { ServerActionError } from '#/types/errors'
import { SERVER_ERROR_SANITIZED_MESSAGE } from './constants'
import { logToDb } from '#/lib/logging.server'

export async function handleGlobalError(error: any): Promise<never> {
  const isSafeError = error instanceof ServerActionError
  const isZodError = error?.name === 'ZodError'

  console.error('[GlobalErrorHandler] UNCAUGHT:', error)

  // 1. ALLES loggen, was hier aufschlägt
  const realErrorMessage =
    error instanceof Error ? error.message : String(error)

  await logToDb({
    metadata: {
      component: 'Global-Error-Boundary',
      actionSource: 'Uncaught Exception',
    },
    serverFunction: isZodError ? 'Validator' : 'Unknown/Outside Action',
    // Zod/Safe Errors sind nur Warnungen, echte Crashes sind critical
    severity: isSafeError || isZodError ? 'warning' : 'critical',
    message: realErrorMessage,
  }).catch((logError) => {
    console.error(
      'Kritisch: Fallback-Log konnte nicht geschrieben werden:',
      logError,
    )
  })

  // 2. Error Masking anwenden oder im Original werfen
  if (isSafeError || isZodError) {
    throw error // Muss zum Client, damit UI (Formulare etc.) reagieren kann
  } else {
    throw new Error(SERVER_ERROR_SANITIZED_MESSAGE) // Geheimnis wahren
  }
}
