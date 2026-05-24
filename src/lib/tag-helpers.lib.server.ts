import { prisma } from '#/lib/db.lib.server'
import type { Prisma } from '#/lib/db.lib.server'

type ExistingNoteOrCourseTag = {
  tag: {
    id: string
    name: string
    userId: string | null
  }
}

export const resolveTagIds = async (
  tagNames: string[],
  userId: string,
  existingLinkedTags: ExistingNoteOrCourseTag[] = [],
  dbClient: Prisma.TransactionClient = prisma,
): Promise<string[]> => {
  const finalTagIds: string[] = []
  const namesToResolve: string[] = []

  // 1. Bereits verknüpfte Tags bewahren
  for (const name of tagNames) {
    const existing = existingLinkedTags.find((e) => e.tag.name === name)
    if (existing) {
      finalTagIds.push(existing.tag.id)
    } else {
      namesToResolve.push(name)
    }
  }

  // Wenn alle Tags bereits verknüpft sind, sind wir hier fertig
  if (namesToResolve.length === 0) {
    return finalTagIds
  }

  // 2. Datenbank-Bulk-Abfrage für alle verbleibenden Tags
  // Wir suchen alle Tags, die diesen Namen haben UND entweder dem User gehören oder global sind.
  const dbTags = await dbClient.tag.findMany({
    where: {
      name: { in: namesToResolve },
      OR: [{ userId: userId }, { userId: null }],
    },
  })

  const namesToCreate: string[] = []

  // 3. Die Konfliktlösung (Privat vor Global)
  for (const name of namesToResolve) {
    const privateTag = dbTags.find(
      (t: any) => t.name === name && t.userId === userId,
    )
    const globalTag = dbTags.find(
      (t: any) => t.name === name && t.userId === null,
    )

    if (privateTag) {
      finalTagIds.push(privateTag.id)
    } else if (globalTag) {
      finalTagIds.push(globalTag.id)
    } else {
      // Weder privat noch global existiert -> wir müssen es neu anlegen
      namesToCreate.push(name)
    }
  }

  // 4. Nicht existierende Tags als private Tags neu anlegen
  if (namesToCreate.length > 0) {
    // Wir nutzen Promise.all statt createMany, da createMany in Prisma (je nach DB)
    // nicht die generierten IDs zurückgibt, wir diese aber für die Verknüpfung zwingend brauchen.
    const createdTags = await Promise.all(
      namesToCreate.map((name) =>
        dbClient.tag.create({
          data: { name, userId },
          select: { id: true },
        }),
      ),
    )
    finalTagIds.push(...createdTags.map((t) => t.id))
  }

  return finalTagIds
}
