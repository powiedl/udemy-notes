import { MAX_FILE_SIZE_UPLOAD } from '#/lib/constants'
import z from 'zod'

export const importHtmlFileSchema = z.object({
  file: z
    .instanceof(File, {
      message: 'Please choose a Udemy course notes HTML file',
    })
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

export type ImportHtmlFileSchema = z.infer<typeof importHtmlFileSchema>
