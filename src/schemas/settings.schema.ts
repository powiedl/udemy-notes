import { DEFAULT_EXPORT_SETTINGS } from '#/lib/constants.lib'
import { z } from 'zod'

export const exportSettingsSchema = z.object({
  includeCourseTags: z.boolean(),
  includeCourseDescription: z.boolean(),
  includeCourseLinks: z.boolean(),
  includeNotesMetadata: z.boolean(),
  includeNoteTags: z.boolean(),
  includeTrainers: z.boolean(),
  noteVersion: z.enum(['original', 'edited_with_fallback', 'both']),
})

export const userSettingsSchema = z.object({
  export: exportSettingsSchema.default(DEFAULT_EXPORT_SETTINGS),
  // Später leicht erweiterbar:
  // ui: z.object({...})
})

// Typen exportieren
export type ExportSettings = z.infer<typeof exportSettingsSchema>
export type UserSettings = z.infer<typeof userSettingsSchema>
