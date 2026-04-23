import { prisma } from '#/lib/db.server'

function toTitleCase(str: string) {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

async function main() {
  console.log('🧹 Starte Trainer-Daten-Bereinigung...')

  // 1. Alle Trainer mit ihren Kurs-Verknüpfungen laden
  const allTrainers = await prisma.trainer.findMany({
    include: {
      courses: true,
    },
  })

  const processedNames = new Map<string, string>() // lowerCaseName -> targetTrainerId

  for (const trainer of allTrainers) {
    const lowerName = trainer.name.toLowerCase().trim()

    if (processedNames.has(lowerName)) {
      // DUPLIKAT GEFUNDEN
      const targetTrainerId = processedNames.get(lowerName)!
      console.log(
        `♻️  Verschmelze "${trainer.name}" (ID: ${trainer.id}) -> Ziel-ID: ${targetTrainerId}`,
      )

      // Alle Kurse des Duplikats auf den Ziel-Trainer umhängen
      for (const courseRel of trainer.courses) {
        try {
          await prisma.courseTrainer.upsert({
            where: {
              courseId_trainerId: {
                courseId: courseRel.courseId,
                trainerId: targetTrainerId,
              },
            },
            update: {}, // Wenn die Verbindung schon existiert, mach nichts
            create: {
              courseId: courseRel.courseId,
              trainerId: targetTrainerId,
            },
          })
        } catch (err) {
          console.error(
            `Fehler beim Umhängen von Kurs ${courseRel.courseId}:`,
            err,
          )
        }
      }

      // Das Duplikat löschen
      await prisma.trainer.delete({
        where: { id: trainer.id },
      })
      console.log(`🗑️  Duplikat "${trainer.name}" gelöscht.`)
    } else {
      // ERSTER EINTRAG DIESES NAMENS
      // Wir normalisieren den Namen direkt auf eine schöne Schreibweise
      const beautifulName = toTitleCase(trainer.name)

      if (beautifulName !== trainer.name) {
        await prisma.trainer.update({
          where: { id: trainer.id },
          data: { name: beautifulName },
        })
        console.log(
          `✨ Name verschönert: "${trainer.name}" -> "${beautifulName}"`,
        )
      }

      processedNames.set(lowerName, trainer.id)
    }
  }

  console.log('🏁 Cleanup abgeschlossen!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
