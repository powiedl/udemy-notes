import { z } from 'zod'
import { exportSettingsSchema } from '#/schemas/settings.schema'

export const exportMdFileSchema = exportSettingsSchema.extend({
  courseId: z.string(), // .max(10) falls du das wieder einkommentieren willst
})

export type ExportMdFileSchema = z.infer<typeof exportMdFileSchema>
