import { createMiddleware } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'

const publicUrls = [
  { path: '/', exact: true },
  { path: '/signup', exact: false },
  { path: '/login', exact: false },
  { path: '/about', exact: false },
]

function checkUrl(url: string): boolean {
  return publicUrls.some((publicUrl) => {
    if (publicUrl.exact) {
      return publicUrl.path.toLowerCase() === url.toLowerCase()
    }
    return url.toLowerCase().startsWith(publicUrl.path.toLowerCase())
  })
}

export const authFnMiddleware = createMiddleware().server(async ({ next }) => {
  const { auth } = await import('#/lib/auth.lib')
  const headers = getRequestHeaders()
  const session = await auth.api.getSession({ headers })

  if (!session) {
    throw redirect({ to: '/login' })
  }

  // KEIN SPREAD NÖTIG: TanStack merget session automatisch
  // mit requestId/correlationId aus der vorherigen Middleware.
  return next({
    context: {
      session,
    },
  })
})

export const authMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next, request }) => {
    const { auth } = await import('#/lib/auth.lib')
    const url = new URL(request.url)
    const headers = getRequestHeaders()
    const session = await auth.api.getSession({ headers })

    if (checkUrl(url.pathname)) return next()

    if (!session) {
      throw redirect({ to: '/login' })
    }
    return next({ context: { session } })
  },
)
