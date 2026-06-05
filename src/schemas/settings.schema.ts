import {
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_UI_SETTINGS,
} from '#/lib/constants.lib'
import { UI_THEMES } from '#/types/ui.type'
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

export const uiSettingsSchema = z.object({
  theme: z.enum(UI_THEMES),
  sidebar: z.object({
    collapsed: z.boolean(),
  }),
})

export const userSettingsSchema = z.object({
  export: exportSettingsSchema.default(DEFAULT_EXPORT_SETTINGS),
  ui: uiSettingsSchema.default(DEFAULT_UI_SETTINGS),
})

export const updateUserSettingsSchema = z.object({
  export: exportSettingsSchema.partial().optional(),
  ui: uiSettingsSchema.partial().optional(),
})

// Typen exportieren
export type ExportSettings = z.infer<typeof exportSettingsSchema>
export type UiSettings = z.infer<typeof uiSettingsSchema>
export type UserSettings = z.infer<typeof userSettingsSchema>
export type UpdateUserSettingsInput = z.infer<typeof updateUserSettingsSchema>
