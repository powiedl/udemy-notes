import { createServerFn } from '@tanstack/react-start'
import { prisma } from '#/lib/db.server'
import z from 'zod'

export const logClientError = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      component: z.string(),
      severity: z.string().optional(),
      message: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await prisma.log.create({
        data: {
          component: data.component,
          severity: data.severity || 'error',
          message: data.message,
        },
      })
      return { success: true }
    } catch (err) {
      console.error('Konnte Client-Error nicht loggen:', err)
      return { success: false }
    }
  })
