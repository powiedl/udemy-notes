import 'dotenv/config'
// Wir nutzen hier den Default-Import, falls der Named-Import zickt
import pkg from '@prisma/client'
const { PrismaClient } = pkg

const prisma = new PrismaClient()
// Wir erstellen einen lokalen Client für das Skript
// Das umgeht alle Probleme mit Adaptern oder Aliasen

async function main() {
  console.log('🚀 Starte Trainer-Migration...')

  // Überprüfe kurz, ob die DB-URL da ist
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env')
  }

  const courses = await prisma.course.findMany({
    where: {
      AND: [
        { trainer: { not: null } },
        { trainer: { not: '' } },
        { trainer: { not: 'Unknown Trainer' } },
      ],
    },
  })

  console.log(`📦 Gefunden: ${courses.length} Kurse.`)

  for (const course of courses) {
    const rawName = course.trainer.trim()

    const trainerRecord = await prisma.trainer.upsert({
      where: { name: rawName },
      update: {},
      create: { name: rawName },
    })

    await prisma.courseTrainer.upsert({
      where: {
        courseId_trainerId: {
          courseId: course.id,
          trainerId: trainerRecord.id,
        },
      },
      update: {},
      create: {
        courseId: course.id,
        trainerId: trainerRecord.id,
      },
    })

    console.log(`✅ Migriert: "${course.title}" -> "${rawName}"`)
  }

  console.log('🏁 Fertig!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
