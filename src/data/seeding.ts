import { createServerFn } from '@tanstack/react-start'
import { prisma } from '#/db'
import { z } from 'zod'
import { authFnMiddleware } from '#/middlewares/auth'

// Validierungsschema für den Input
const seedTaggingSchema = z.object({
  relations: z.array(
    z.object({
      type: z.enum(['course', 'note']),
      parentId: z.string().uuid(),
      tagId: z.string().uuid(),
    }),
  ),
})

export const seedTagging = createServerFn({ method: 'POST' })
  .middleware([authFnMiddleware]) // Schützt die Funktion vor unbefugtem Zugriff
  .inputValidator(seedTaggingSchema)
  .handler(async ({ data }) => {
    const { relations } = data

    console.log(`Server: Verarbeite ${relations.length} Tagging-Relationen...`)

    // Wir nutzen eine Transaktion, um sicherzustellen, dass entweder alles
    // oder nichts passiert (optional, aber sauberer)
    try {
      const results = await prisma.$transaction(
        relations.map((rel) => {
          if (rel.type === 'course') {
            return prisma.courseTag.upsert({
              where: {
                courseId_tagId: { courseId: rel.parentId, tagId: rel.tagId },
              },
              update: {},
              create: { courseId: rel.parentId, tagId: rel.tagId },
            })
          } else {
            return prisma.noteTag.upsert({
              where: {
                noteId_tagId: { noteId: rel.parentId, tagId: rel.tagId },
              },
              update: {},
              create: { noteId: rel.parentId, tagId: rel.tagId },
            })
          }
        }),
      )

      return { success: true, count: results.length }
    } catch (error) {
      console.error('Seed Transaction Error:', error)
      throw new Error(
        'Fehler beim Speichern der Tag-Relationen in der Datenbank.',
      )
    }
  })
