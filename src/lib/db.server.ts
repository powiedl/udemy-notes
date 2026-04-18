// src/lib/db.server.ts

// 1. Füge "Prisma" hier zum Import hinzu
import { PrismaClient, Prisma } from '#/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
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
