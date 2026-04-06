import { prisma } from '#/db'
import { ClientLoggingMetadata } from '#/types/api'

export type LogSeverity = 'info' | 'warning' | 'error' | 'critical'

export async function logToDb(params: {
  metadata: ClientLoggingMetadata
  serverFunction?: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  message: string
  userId?: string
}) {
  return await prisma.log.create({
    data: {
      component: params.metadata.component,
      serverFunction: params.serverFunction,
      severity: params.severity,
      message: params.message,
      userId: params.userId,
    },
  })
}
