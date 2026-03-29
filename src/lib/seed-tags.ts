import { prisma } from '#/db'

interface SeedRelation {
  type: 'course' | 'note'
  parentId: string
  tagId: string
}

/**
 * Verknüpft Kurse oder Notizen mit Tags.
 * Nutzt upsert auf den Join-Tabellen, um Duplikate zu verhindern.
 */
export async function seedTagsToParents(relations: SeedRelation[]) {
  //console.log(`Starte Seeding von ${relations.length} Relationen...`)

  for (const relation of relations) {
    const { type, parentId, tagId } = relation

    try {
      if (type === 'course') {
        await prisma.courseTag.upsert({
          where: {
            courseId_tagId: {
              courseId: parentId,
              tagId: tagId,
            },
          },
          update: {}, // Nichts tun, wenn es schon existiert
          create: {
            courseId: parentId,
            tagId: tagId,
          },
        })
      } else if (type === 'note') {
        await prisma.noteTag.upsert({
          where: {
            noteId_tagId: {
              noteId: parentId,
              tagId: tagId,
            },
          },
          update: {}, // Nichts tun, wenn es schon existiert
          create: {
            noteId: parentId,
            tagId: tagId,
          },
        })
      }
    } catch (error) {
      console.error(
        `Fehler beim Verknüpfen von ${type} ${parentId} mit Tag ${tagId}:`,
        error,
      )
    }
  }

  //console.log('Seeding der Relationen abgeschlossen.')
}
