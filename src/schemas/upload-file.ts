import { MAX_FILE_SIZE_UPLOAD } from '#/lib/constants'
import z from 'zod'

export const uploadFileSchema = z.object({
  file: z
    .instanceof(File, { message: 'Bitte wählen Sie eine Datei aus.' })
    // Validierung der Dateigröße
    .refine(
      (file) => file.size <= MAX_FILE_SIZE_UPLOAD,
      `Die Datei ist zu groß (Maximal erlaubt: ${MAX_FILE_SIZE_UPLOAD / 1024 / 1024} MB)`,
    )
    // Validierung des MIME-Typs
    .refine(
      (file) => file.type === 'text/html',
      'Es sind nur HTML-Dateien für den Upload zulässig.',
    ),
})

export type UploadFileSchema = z.infer<typeof uploadFileSchema>
