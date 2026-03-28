import { createStart } from '@tanstack/react-start'
import { authMiddleware } from './middlewares/auth'

// const loggingMiddleware = createMiddleware().server(({ request, next }) => {
//   const url = new URL(request.url)
//   console.log(`${request.method} ${url.pathname}`)
//   return next()
// })

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [authMiddleware],
  }
})
