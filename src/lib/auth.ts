import { prisma } from '#/lib/db.server'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

// Hilfsfunktion zur Ermittlung der korrekten URL (lokal vs. Vercel Preview vs. Vercel Prod)
const getBaseUrl = () => {
  // 1. Wenn wir in einem Vercel Preview sind, nutze die dynamisch generierte URL
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
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
  },
})

export type Session = typeof auth.$Infer.Session
