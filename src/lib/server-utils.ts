import { UdNoServerResponse } from '#/types/api'
import { ClientLoggingMetadata } from '#/schemas/api-utils'
import { Session } from './auth'
import {
  EMPTY_CLIENT_LOGGING_METADATA,
  MISSING_COMPONENT_NAME,
} from './constants'
import { logToDb } from './logging'

interface PublicLogOptions {
  metadata: ClientLoggingMetadata
}

interface ProtectedLogOptions extends PublicLogOptions {
  session: {
    userId: string
    sessionId?: string
  }
}

export async function wrapPublicServerAction<T>(
  serverFunctionName: string,
  fn: () => Promise<T>,
  options: PublicLogOptions,
): Promise<UdNoServerResponse<T>> {
  options.metadata.component =
    options.metadata?.component || MISSING_COMPONENT_NAME
  try {
    const data = await fn()
    return { success: true, data }
  } catch (error: any) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unbekannter Fehler'
    await logToDb({
      serverFunction: serverFunctionName,
      metadata: options.metadata,
      severity: 'error',
      message: errorMessage,
    })

    return {
      success: false,
      error: errorMessage,
      serverFunction: serverFunctionName,
      component: options.metadata.component,
    }
  }
}

export async function wrapProtectedServerAction<T>(
  serverFunctionName: string,
  fn: () => Promise<T>,
  options: ProtectedLogOptions,
): Promise<UdNoServerResponse<T>> {
  const component = options.metadata?.component || MISSING_COMPONENT_NAME
  try {
    const data = await fn()
    return { success: true, data }
  } catch (error: any) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unbekannter Fehler'

    // Log error mit userId
    await logToDb({
      serverFunction: serverFunctionName,
      metadata: options.metadata,
      severity: 'error',
      message: errorMessage,
      userId: options.session.userId,
    })

    return {
      success: false,
      error: errorMessage,
      serverFunction: serverFunctionName,
      component,
    }
  }
}

export async function wrapServerAction<T>(
  serverFuncionName: string,
  fn: () => Promise<T>,
  options: ProtectedLogOptions | PublicLogOptions,
) {
  if ('session' in options) {
    return wrapProtectedServerAction(serverFuncionName, fn, options)
  } else {
    return wrapPublicServerAction(serverFuncionName, fn, options)
  }
}

export function createServerActionOptions(
  metadata = EMPTY_CLIENT_LOGGING_METADATA,
  session?: Session | null,
) {
  return { session: session?.session, metadata }
}
