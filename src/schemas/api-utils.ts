import { z } from 'zod'

// Das Metadaten-Objekt, das wir vom Frontend erwarten, um Logging-Informationen anzureichern
export const clientLoggingMetadataSchema = z.object({
  component: z.string().optional(),
  feature: z.string().optional(),
})

// Typableitung für die Client-Logging-Metadaten
export type ClientLoggingMetadata = z.infer<typeof clientLoggingMetadataSchema>

/**
 * Hilfsfunktion, um ein beliebiges Zod-Schema mit den
 * Logging-Metadaten zu erweitern.
 */
export function withLogging<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const combined = schema.extend({
    loggingMetadata: clientLoggingMetadataSchema.optional(),
  })
  // Wenn der Input fehlt (undefined), füttern wir das Schema mit einem leeren Objekt,
  // damit die internen Defaults berechnet werden.
  return z.preprocess((val) => val ?? {}, combined)
  //return combined.optional().default({} as z.infer<typeof combined>)
}
