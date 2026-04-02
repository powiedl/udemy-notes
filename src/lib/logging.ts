import { prisma } from '#/db'

export type LogSeverity = 'info' | 'warning' | 'error' | 'critical'

export async function logToDb(params: {
  component?: string
  serverFunction?: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  message: string
}) {
  return await prisma.log.create({
    data: {
      component: params.component,
      serverFunction: params.serverFunction,
      severity: params.severity,
      message: params.message,
    },
  })
}
