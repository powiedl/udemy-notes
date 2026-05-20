import { prisma } from '#/lib/db.lib.server'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { env } from '#/lib/env.lib.server'

// Hilfsfunktion zur Ermittlung der korrekten URL (lokal vs. Vercel Preview vs. Vercel Prod)
const getBaseUrl = () => {
  if (env.VERCEL_ENV === 'preview' && env.VERCEL_URL) {
    return `https://${env.VERCEL_URL}`
  }
  return env.BETTER_AUTH_URL || 'http://localhost:3000'
}

const getTrustedOrigins = () => {
  if (env.VERCEL_ENV === 'preview') {
    return [
      env.VERCEL_BRANCH_URL ? `https://${env.VERCEL_BRANCH_URL}` : '',
      env.VERCEL_URL ? `https://${env.VERCEL_URL}` : '',
    ].filter(Boolean) // Filtert leere Strings heraus
  }
  return []
}
export const auth = betterAuth({
  // Hier übergeben wir unsere dynamische URL:
  baseURL: getBaseUrl(),
  trustedOrigins: getTrustedOrigins(),

  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  user: {
    additionalFields: {
      role: {
        type: 'string',
        fieldName: 'role',
        defaultValue: 'user',
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  plugins: [
    tanstackStartCookies(), // make sure this is the last plugin in the array
  ],
  advanced: {
    cookiePrefix: 'udemy-notes',
    trustHosts: true,
  },
})

export type Session = typeof auth.$Infer.Session
