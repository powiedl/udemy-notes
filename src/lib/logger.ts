import { prisma } from '#/db'

export type LogSeverity = 'info' | 'warning' | 'error' | 'critical'

export async function logToDb({
  component,
  severity = 'error',
  message,
}: {
  component: string
  severity?: LogSeverity
  message: string
}) {
  try {
    return await prisma.log.create({
      data: {
        component,
        severity,
        message,
      },
    })
  } catch (err) {
    // Fallback: Wenn die DB down ist, zumindest in die Console schreiben
    console.error('Failed to write log to database:', err)
  }
}
