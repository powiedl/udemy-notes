import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  // baseURL komplett weggelassen.
  // Der Client zieht sich die URL im Browser automatisch!
})
