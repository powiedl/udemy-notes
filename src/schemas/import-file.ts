import { z } from 'zod'
import { withLogging } from './api-utils'
import { MAX_FILE_SIZE_UPLOAD } from '#/lib/constants.lib'

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

export const analyzeHtmlPayloadSchema = withLogging(
  z.object({
    content: z.string(),
    fileName: z.string(),
    fileSize: z.number().max(MAX_FILE_SIZE_UPLOAD, {
      message: `File size exceeds the maximum allowed limit of ${Math.round((MAX_FILE_SIZE_UPLOAD / 1024 / 1024) * 10) / 10}`,
    }),
    trainers: z.array(z.string()),
    tagIds: z.array(z.string()),
    newPrivateTags: z.array(z.string()),
    parsedTrainerUrl: z.string().optional(),
  }),
)
export type AnalyzeHtmlPayloadSchema = z.infer<typeof analyzeHtmlPayloadSchema>

export const importedNoteSchema = z.object({
  section: z.string().min(1, 'Section is missing'),
  lecture: z.string().min(1, 'Lecture is missing'),
  timestamp: z.string().min(1, 'Timestamp is missing'),
  // Hier erzwingen wir, dass der vom User bearbeitete Text nicht leer ist:
  content: z.string().trim().min(1, 'The note must have a content'),
})
export type ImportedNoteSchema = z.infer<typeof importedNoteSchema>

export const importedCourseSchema = z.object({
  courseId: z.string().optional(),
  courseTitle: z.string().min(1),
  courseDescription: z.string().optional(),
  // --- NEU: Diese Felder müssen die Reise ins Frontend und zurück überleben ---
  courseUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  trainerUrl: z.string().optional(),
  notes: z
    .array(importedNoteSchema)
    .min(1, 'The file does not contain any valid notes'),
})
export type ImportedCourseSchema = z.infer<typeof importedCourseSchema>

// --- NEU: Schemata für den zweistufigen HTML Import ---

// 1. Definiert die Antwort des Servers nach der initialen HTML-Analyse (Vorschau-Daten)
export const analyzeHtmlResponseSchema = z.object({
  parsedCourse: importedCourseSchema.extend({
    notesCount: z.number(), // Komfort-Feld für die schnelle Anzeige im UI
  }),
  trainerMatch: z.object({
    url: z.string().optional(),
    isKnown: z.boolean(),
    existingCoursesCount: z.number().default(0),
  }),
})
export type AnalyzeHtmlResponseSchema = z.infer<
  typeof analyzeHtmlResponseSchema
>
export interface HtmlPreviewState extends AnalyzeHtmlResponseSchema {
  rawFileContent: string
  originalValue: {
    trainers: string[]
    tagIds: string[]
    newPrivateTags: string[]
    forceReplace?: boolean
  }
}

// 2. Definiert den Payload, der beim finalen Speichern ("Confirm & Save") gesendet wird
export const saveParsedCourseSchema = withLogging(
  z.object({
    parsedCourse: importedCourseSchema,
    fileName: z.string(),
    trainers: z.array(z.string().optional()),
    tagIds: z.array(z.string()).default([]),
    newPrivateTags: z.array(z.string()).default([]),
    forceReplace: z.boolean().optional(),
  }),
)
export type SaveParsedCourseSchema = z.infer<typeof saveParsedCourseSchema>
