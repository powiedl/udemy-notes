// src/lib/rpc.ts
import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { authFnMiddleware } from '#/middlewares/auth' // Achte darauf, dass dieses File "clean" ist
import { requestIdMiddleware } from '#/middlewares/request-id'
import { ServerActionError } from '#/types/errors'
import { SERVER_ERROR_SANITIZED_MESSAGE } from './constants'

// Diese Datei ist "isomorph" - sie darf vom Client gelesen werden.
// Sie enthält KEINE Prisma-Imports und KEIN wrapServerAction.
// 1. Die isolierte, testbare Fehler-Logik
export async function handleGlobalError(error: any): Promise<never> {
  const isSafeError = error instanceof ServerActionError
  const isZodError = error?.name === 'ZodError'

  console.error('[GlobalErrorHandler] UNCAUGHT:', error)

  // 1. ALLES loggen, was hier aufschlägt
  const { logToDb } = await import('#/lib/logging.server')
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

export const errorHandlingMiddleware = createMiddleware().server(
  async ({ next }) => {
    try {
      return await next()
    } catch (error: any) {
      return await handleGlobalError(error)
    }
  },
)

export const baseServerFn = createServerFn().middleware([
  errorHandlingMiddleware,
])

export const baseGetServerFn = createServerFn({ method: 'GET' }).middleware([
  errorHandlingMiddleware,
])

export const publicFn = baseServerFn.middleware([requestIdMiddleware])
export const publicGetFn = baseGetServerFn.middleware([requestIdMiddleware])

export const authFn = baseServerFn.middleware([
  requestIdMiddleware,
  authFnMiddleware,
])

export const authGetFn = baseGetServerFn.middleware([
  requestIdMiddleware,
  authFnMiddleware,
])
