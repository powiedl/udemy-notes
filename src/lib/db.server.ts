import { PrismaClient, Prisma } from '#/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { env } from './env.server'
import { getNodeEnv } from './utils'

let connectionString = env.DATABASE_URL

// Prüfen, ob die URL fehlt (außer im Test-Modus)
if (!connectionString && !getNodeEnv('test')) {
  throw new Error(
    '🚨 KRITISCHER FEHLER: DATABASE_URL ist undefined! Vercel liefert die Variable nicht an den Code.',
  )
}

if (connectionString && !getNodeEnv('test')) {
  // (er)setzen der sslmode Option auf den gewünschten Wert
  const dbUrl = new URL(connectionString)
  dbUrl.searchParams.set('sslmode', 'verify-full')
  connectionString = dbUrl.toString()
}

const adapter = new PrismaPg({
  connectionString: connectionString || '',
})

declare global {
  var __prisma: PrismaClient | undefined
}

export const prisma = globalThis.__prisma || new PrismaClient({ adapter })

if (!getNodeEnv('production')) {
  globalThis.__prisma = prisma
}

export { Prisma }
