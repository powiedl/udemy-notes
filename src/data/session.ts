import { auth } from '#/lib/auth'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'

export const getSessionFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const headers = getRequestHeaders()
    const session = await auth.api.getSession({ headers })
    if (!session) {
      throw redirect({ to: '/login' })
    }
    if (!session.user.image) {
      session.user.image = `https://api.dicebear.com/9.x/avataaars/svg?seed={session.user.name}`
    }
    return session
  },
)
