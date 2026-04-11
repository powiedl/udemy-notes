// src/lib/rpc.ts
import { createServerFn } from '@tanstack/react-start'
import { authFnMiddleware } from '#/middlewares/auth' // Achte darauf, dass dieses File "clean" ist
import { requestIdMiddleware } from '#/middlewares/request-id'

// Diese Datei ist "isomorph" - sie darf vom Client gelesen werden.
// Sie enthält KEINE Prisma-Imports und KEIN wrapServerAction.

export const publicFn = createServerFn({ method: 'POST' }).middleware([
  requestIdMiddleware,
])

export const authFn = createServerFn({ method: 'POST' }).middleware([
  requestIdMiddleware,
  authFnMiddleware,
])

export const authGetFn = createServerFn({ method: 'GET' }).middleware([
  requestIdMiddleware,
  authFnMiddleware,
])
