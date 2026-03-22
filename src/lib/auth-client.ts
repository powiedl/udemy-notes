import { createAuthClient } from 'better-auth/react'

// console.log(
//   'import.meta.env.VITE_BETTER_AUTH_URL=',
//   import.meta.env.VITE_BETTER_AUTH_URL,
// )
// console.log(
//   'process.env.VITE_BETTER_AUTH_URL=',
//   process.env.VITE_BETTER_AUTH_URL,
// )
let baseURL
if (process.env.VITE_BETTER_AUTH_URL) {
  baseURL = process.env.VITE_BETTER_AUTH_URL
} else if (import.meta.env.VITE_BETTER_AUTH_URL) {
  baseURL = import.meta.env.VITE_BETTER_AUTH_URL
} else if (process.env.NODE_ENV === 'production') {
  baseURL = 'https://udemy-notes.vercel.app/'
} else {
  baseURL = 'http://localhost:3000'
}

//console.log('authClient,baseUrl=', baseURL)
export const authClient = createAuthClient({
  /** The base URL of the server (optional if you're using the same domain) */
  baseURL,
})
