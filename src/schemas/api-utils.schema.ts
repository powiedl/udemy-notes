import { z } from 'zod'

// Das Metadaten-Objekt, das wir vom Frontend erwarten, um Logging-Informationen anzureichern
export const clientLoggingMetadataSchema = z.object({
  component: z.string().optional(),
  feature: z.string().optional(),
  actionSource: z.string().optional(),
})

// Typableitung für die Client-Logging-Metadaten
export type ClientLoggingMetadata = z.infer<typeof clientLoggingMetadataSchema>

/**
 * Hilfsfunktion, um ein beliebiges Zod-Schema mit den
 * Logging-Metadaten zu erweitern.
 */
export function withLogging<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.extend({
    loggingMetadata: clientLoggingMetadataSchema.optional(),
  })
}
