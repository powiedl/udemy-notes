import { createMiddleware } from '@tanstack/react-start'
import {
  getRequestHeaders,
  setResponseHeader,
} from '@tanstack/react-start/server'
import { v4 as uuidv4 } from 'uuid'

export const requestIdMiddleware = createMiddleware().server(
  async ({ next }) => {
    const headers = getRequestHeaders()

    // Correlation ID vom Client oder neu
    const correlationId = (headers['x-correlation-id'] as string) || uuidv4()
    // Request ID immer neu für diesen Aufruf
    const requestId = uuidv4()

    setResponseHeader('x-request-id', requestId)
    setResponseHeader('x-correlation-id', correlationId)

    return next({
      context: {
        requestId,
        correlationId,
      },
    })
  },
)
