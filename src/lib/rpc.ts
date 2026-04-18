// src/lib/rpc.ts
import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { authFnMiddleware } from '#/middlewares/auth' // Achte darauf, dass dieses File "clean" ist
import { requestIdMiddleware } from '#/middlewares/request-id'

export const errorHandlingMiddleware = createMiddleware().server(
  async ({ next }) => {
    try {
      return await next()
    } catch (error: any) {
      const { handleGlobalError } = await import('#/lib/error-handler.server')
      return await handleGlobalError(error)
    }
  },
)

export const baseServerFn = createServerFn({ method: 'POST' }).middleware([
  errorHandlingMiddleware,
])

export const baseGetServerFn = createServerFn({ method: 'GET' }).middleware([
  errorHandlingMiddleware,
])

export const publicFn = baseServerFn.middleware([requestIdMiddleware])
export const publicGetFn = baseGetServerFn.middleware([requestIdMiddleware])

export const authFn = baseServerFn.middleware([
  requestIdMiddleware,
  authFnMiddleware,
])

export const authGetFn = baseGetServerFn.middleware([
  requestIdMiddleware,
  authFnMiddleware,
])
