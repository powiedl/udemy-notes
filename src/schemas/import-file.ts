import { z } from 'zod'
import { withLogging } from './api-utils'

export const importFileSchema = withLogging(
  z.object({
    content: z.string().min(1, 'Content is required'),
    fileName: z
      .string()
      .refine(
        (name) =>
          name.toLowerCase().endsWith('.html') ||
          name.toLowerCase().endsWith('.md'),
        { message: 'Only HTML (.html) or Markdown (.md) files are allowed' },
      ),
    fileSize: z.number(), // Für die Validierung im Handler
    trainers: z.array(z.string().optional()),
    tagIds: z.array(z.string()).default([]),
    newPrivateTags: z.array(z.string()).default([]),
    forceReplace: z.boolean().optional(),
  }),
)
export type ImportFileSchema = z.infer<typeof importFileSchema>

export const checkImportFileSchema = z.object({
  fileContent: z.string().min(1, 'File is empty'),
})
export type CheckImportFileSchema = z.infer<typeof checkImportFileSchema>

export const ImportedNoteSchema = z.object({
  section: z.string().min(1, 'Section fehlt'),
  lecture: z.string().min(1, 'Lecture fehlt'),
  timestamp: z.number().min(0),
  // Hier erzwingen wir, dass der vom User bearbeitete Text nicht leer ist:
  content: z.string().trim().min(1, 'Die Notiz darf nicht komplett leer sein'),
})

export const ImportedCourseSchema = z.object({
  courseId: z.number().optional(), // Optional, falls es ein ganz neuer Kurs wird
  courseTitle: z.string().min(1),
  notes: z
    .array(ImportedNoteSchema)
    .min(1, 'Die Datei enthält keine gültigen Notizen'),
})
