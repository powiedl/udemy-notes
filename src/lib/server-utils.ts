import { UdNoServerResponse } from '#/types/api'
import { logToDb } from './logging'

export async function wrapServerAction<T>(
  serverFunctionName: string,
  fn: () => Promise<T>,
  clientComponent = '<no component>', // Wird vom Frontend durchgereicht
  userId?: string,
): Promise<UdNoServerResponse<T>> {
  try {
    const data = await fn()
    return { success: true, data }
  } catch (error: any) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unbekannter Fehler'

    await logToDb({
      serverFunction: serverFunctionName,
      component: clientComponent,
      severity: 'error',
      message: errorMessage,
      userId,
    })

    return {
      success: false,
      error: errorMessage,
      serverFunction: serverFunctionName,
      component: clientComponent,
    }
  }
}
