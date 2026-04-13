// import fs from 'node:fs'
// import path from 'node:path'
import { MAX_FILE_SIZE_UPLOAD } from '#/lib/constants'

import { Course, Note } from '#/generated/prisma/client'
import { ImportNote } from '#/types/course'
import { exportMdFileSchema } from '#/schemas/export-file'
import { processNoteForMarkdown } from '#/lib/export-helper'
import { authFn } from '#/lib/rpc'
import { ServerActionError } from '#/types/errors'
import { withLogging } from '#/schemas/api-utils'
import { importHtmlFileSchema } from '#/schemas/import-file'

/**
 * Prüft, ob eine neue Notiz von Udemy im Konflikt mit einer lokal bearbeiteten Notiz steht.
 *
 * Ein Konflikt entsteht, wenn:
 * 1. Der neue Inhalt sich vom gespeicherten Original unterscheidet (Änderung auf Udemy).
 * 2. Lokal bereits manuell Änderungen im `editedContent` vorgenommen wurden.
 */
function checkConflict(
  newNote: ImportNote,
  existingNote: Pick<Note, 'originalContent' | 'editedContent'>,
): boolean {
  if (newNote.content === existingNote.originalContent) return false // der neue Content und der Originalcontent sind gleich - es kann kein Konflikt sein

  // der Content auf Udemy hat sich verändert ...
  const hasConflict =
    existingNote.editedContent !== '' &&
    existingNote.editedContent.trim() !== '' // und es gibt auch einen editedContent --> Konflikt
  return hasConflict
}

/**
 * Importiert eine von Udemy exportierte HTML-Datei mit Kursnotizen.
 *
 * Der Prozess umfasst:
 * 1. Validierung der Dateigröße und des Formats.
 * 2. Konvertierung des HTML-Inhalts in Markdown und Extraktion der Metadaten.
 * 3. Synchronisation des Kurses und der Notizen (Upsert-Logik) inkl. Konflikterkennung.
 */
export const importHtmlFile = authFn
  .inputValidator(importHtmlFileSchema)
  .handler(async ({ data, context }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { prepareAndConvertHtmlToMarkdown } =
      await import('#/lib/convertHtmlToMarkdown')
    const { orderInfo } = await import('#/lib/udemy')

    return await wrapServerAction('importHtmlFile', context, data, async () => {
      const userId = context.session.user.id
      const {
        htmlContent,
        fileName,
        fileSize,
        trainer,
        tagIds,
        newPrivateTags,
      } = data

      // --- 1. Validierung (Sicherheit & Integrität) ---
      // Da wir den String erhalten, prüfen wir hier die übergebene fileSize
      if (fileSize > MAX_FILE_SIZE_UPLOAD) {
        throw new ServerActionError('File too large. Maximum size exceeded.')
      }
      // Minimalistischer Check auf HTML-Struktur
      if (!htmlContent.trim().toLowerCase().startsWith('<')) {
        throw new ServerActionError('Only HTML files are allowed.')
      }

      const timestamp = Date.now()

      // 2. HTML zu Markdown konvertieren
      const conversionResult = prepareAndConvertHtmlToMarkdown(htmlContent)
      if (conversionResult.status === 'ERROR') {
        throw new ServerActionError(conversionResult.message)
      }

      const { course, markdown } = conversionResult

      // --- 3. Tag-Management ---
      let finalTagIds = [...tagIds]
      if (newPrivateTags.length > 0) {
        const createdTags = await Promise.all(
          newPrivateTags.map((name) =>
            prisma.tag.create({
              data: { name, userId },
              select: { id: true },
            }),
          ),
        )
        finalTagIds = [...finalTagIds, ...createdTags.map((t) => t.id)]
      }

      // --- 4. Kurs-Synchronisation (Upsert) ---
      const existingCourse = await prisma.course.findFirst({
        where: { userId, title: course.title },
      })

      let finishedCourse: Course
      let existingNotes = null
      const trainerName = trainer || 'Unbekannter Trainer'

      if (existingCourse) {
        // Bei existierendem Kurs: Metadaten und Tags aktualisieren
        existingNotes = await prisma.note.findMany({
          where: { courseId: existingCourse.id },
        })
        finishedCourse = await prisma.course.update({
          where: { id: existingCourse.id },
          data: {
            title: course.title,
            trainer: trainerName,
            // Alle alten Tag-Verknüpfungen lösen und durch neue Auswahl ersetzen
            tags: {
              deleteMany: {}, // Alle alten Verknüpfungen lösen
              create: finalTagIds.map((tagId) => ({ tagId })),
            },
          },
        })
      } else {
        // Neuen Kurs anlegen
        finishedCourse = await prisma.course.create({
          data: {
            title: course.title,
            trainer: trainerName,
            userId,
            tags: {
              create: finalTagIds.map((tagId) => ({ tagId })),
            },
          },
        })
      }

      const courseId = finishedCourse.id

      // --- 5. Notizen-Verarbeitung ---
      const notePromises = []
      let numberOfConflicts = 0

      for (const note of course.notes) {
        // Identifikation einer existierenden Notiz anhand von Timestamp und Position
        const existingNote =
          existingNotes &&
          existingNotes.find(
            (n) =>
              n.timestamp === note.timestamp &&
              n.section === note.section &&
              n.lecture === note.lecture,
          )

        const calculatedOrderInfo = orderInfo(
          note.section,
          note.lecture,
          note.timestamp,
        )

        if (existingNote) {
          // Bestehende Notiz: Auf inhaltliche Konflikte prüfen
          const conflict = checkConflict(note, existingNote)
          if (conflict) numberOfConflicts++

          notePromises.push(
            prisma.note.update({
              where: { id: existingNote.id },
              data: {
                hasConflict: conflict,
                originalContent: note.content,
                orderInfo: calculatedOrderInfo,
              },
            }),
          )
        } else {
          // Neue Notiz: In DB anlegen
          notePromises.push(
            prisma.note.create({
              data: {
                courseId,
                userId,
                timestamp: note.timestamp,
                section: note.section,
                lecture: note.lecture,
                originalContent: note.content,
                orderInfo: calculatedOrderInfo,
              },
            }),
          )
        }
      }

      await Promise.all(notePromises)

      return {
        originalFileName: fileName,
        size: fileSize,
        timestamp,
        markdownContent: markdown,
        numberOfConflicts,
        courseId,
      }
    })
  })

/**
 * Generiert einen Markdown-Export für einen gesamten Kurs.
 *
 * Berücksichtigt dabei Kurs-Tags, Notiz-Metadaten (Zeitstempel, Lektion)
 * und optional die Originalinhalte der Notizen.
 */
export const exportMdFile = authFn
  .inputValidator(withLogging(exportMdFileSchema))
  .handler(async ({ data, context }) => {
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    return await wrapServerAction('exportMdFile', context, data, async () => {
      const {
        courseId,
        includeNotesMetadata,
        includeTags,
        includeOriginalNote,
      } = data
      const userId = context.session.user.id
      const course = await prisma.course.findUnique({
        where: {
          id: courseId,
          userId: userId,
        },
        include: {
          // 1. Tags des Kurses selbst laden
          tags: {
            include: {
              tag: true,
            },
          },
          // 2. Notizen laden
          notes: {
            where: {
              isDeleted: false, // Optional: Nur nicht gelöschte Notizen laden
            },
            orderBy: {
              orderInfo: 'desc', // Wie gewünscht absteigend sortiert
            },
            include: {
              // 3. Tags der jeweiligen Notiz laden
              tags: {
                include: {
                  tag: true,
                },
              },
            },
          },
        },
      })
      if (!course) throw new ServerActionError('Course not found')

      // --- Markdown-Generierung ---
      let markdown = `# ${course.title}\n\n`

      // Kurs-Tags hinzufügen
      if (includeTags) {
        if (course.tags.length > 0) {
          markdown += `Tags:\n\n`
          course.tags.map((t) => {
            if (t.tag.name) markdown += `* ${t.tag.name}`
          })
        }
      }

      // Notizen verarbeiten und mit Trennern zusammenfügen
      const notesMarkdownArray: string[] = []

      if (course.notes.length > 0) {
        course.notes.map((n) => {
          notesMarkdownArray.push(
            processNoteForMarkdown(n, {
              includeNotesMetadata,
              includeOriginalNote,
            }),
          )
        })
        markdown += notesMarkdownArray.join('\n\n---\n\n')
      } else {
        markdown += '## Notes\n\nNo notes found...'
      }

      // Letzten Trenner entfernen
      markdown = markdown.replace(/\n\n---\n\n$/, '')
      return { markdown }
    })
  })
