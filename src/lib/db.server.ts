// src/lib/db.server.ts

// 1. Füge "Prisma" hier zum Import hinzu
import { PrismaClient, Prisma } from '#/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL

if (!connectionString && process.env.NODE_ENV !== 'test') {
  throw new Error(
    '🚨 KRITISCHER FEHLER: DATABASE_URL ist undefined! Vercel liefert die Variable nicht an den Code.',
  )
}

const adapter = new PrismaPg({
  connectionString,
})

declare global {
  var __prisma: PrismaClient | undefined
}

export const prisma = globalThis.__prisma || new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma
}

// 2. Exportiere den Namespace, damit du überall an die Typen kommst
export { Prisma }
