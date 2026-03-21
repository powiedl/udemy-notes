import { createMiddleware } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '#/lib/auth'
import { redirect } from '@tanstack/react-router'

const publicUrls: { path: string; exact: boolean }[] = [
  { path: '/', exact: true },
  { path: '/signup', exact: false },
  { path: '/login', exact: false },
  { path: '/about', exact: false },
]

function checkUrl(url: string): boolean {
  publicUrls.forEach((publicUrl) => {
    if (
      publicUrl.exact &&
      publicUrl.path.toLocaleLowerCase() === url.toLocaleLowerCase()
    )
      return true
    if (
      !publicUrl.exact &&
      url.toLocaleLowerCase().startsWith(publicUrl.path.toLocaleLowerCase())
    )
      return true
  })
  return false
}
export const authFnMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const headers = getRequestHeaders()
    const session = await auth.api.getSession({ headers })

    if (!session) {
      throw redirect({ to: '/login' })
    }
    return next({ context: { session } })
  },
)

export const authMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next, request }) => {
    const url = new URL(request.url)
    console.log(`Checking ${url.pathname} ...`)

    if (checkUrl(url.pathname)) return next()

    const headers = getRequestHeaders()
    const session = await auth.api.getSession({ headers })

    if (!session) {
      throw redirect({ to: '/login' })
    }
    return next({ context: { session } })
  },
)
