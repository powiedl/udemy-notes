import type { ClientLoggingMetadata } from '#/types/api.type'

export type LogSeverity = 'info' | 'warning' | 'error' | 'critical'

export async function logToDb(params: {
  metadata: ClientLoggingMetadata
  serverFunction?: string
  severity: LogSeverity
  message: string
  userId?: string
  // Neu hinzugefügte optionale Parameter
  requestId?: string
  correlationId?: string
}) {
  const { prisma } = await import('#/lib/db.lib.server')
  return await prisma.log.create({
    data: {
      component: params.metadata.component,
      serverFunction: params.serverFunction,
      severity: params.severity,
      message: params.message,
      userId: params.userId,
      // Mapping auf die neuen Datenbankfelder
      requestId: params.requestId,
      correlationId: params.correlationId,
    },
  })
}
