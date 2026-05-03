import { prisma } from '#/lib/db.server'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

// Hilfsfunktion zur Ermittlung der korrekten URL (lokal vs. Vercel Preview vs. Vercel Prod)
const getBaseUrl = () => {
  if (process.env.VERCEL_ENV === 'preview') {
    // Use the friendly branch name if available, otherwise fallback to the ID-URL
    const url = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
    return `https://${url}`
  }
  // 2. Ansonsten (Produktion oder lokale Entwicklung) nutze die fixe Variable oder localhost
  return process.env.BETTER_AUTH_URL || 'http://localhost:3000'
}

export const auth = betterAuth({
  // Hier übergeben wir unsere dynamische URL:
  baseURL: getBaseUrl(),

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
