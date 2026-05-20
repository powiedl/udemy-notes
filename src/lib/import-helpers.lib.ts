import type { AnalyzeHtmlPayloadSchema } from '#/schemas/import-file'
import type { UdemySelectors } from '#/types/api'

export const validateMarkdown = (content: string): boolean => {
  if (!content || content.trim() === '') {
    return false
  }

  // 1. Prüfe auf Kurstitel: Mindestens eine H1-Überschrift (z.B. "# Mein Udemy Kurs")
  const hasCourseTitle = /^#\s+.+$/m.test(content)

  // 2. Prüfe auf Notizen: Mindestens eine H2-Überschrift, die mit "Note" beginnt (z.B. "## Note 1")
  const hasNote = /^##\s+Note/m.test(content)

  // 3. Prüfe auf Metadaten: Mindestens eine H3-Überschrift für Metadaten (z.B. "### Metadata")
  // Hinweis: Wir machen das tolerant für eventuelle Leerzeichen am Ende.
  const hasMetadata = /^###\s+Metadata/m.test(content)

  // Die Datei ist nur gültig, wenn alle drei Kern-Elemente gefunden wurden
  return hasCourseTitle && hasNote && hasMetadata
}

// Typ für die Formular-Werte, damit TypeScript nicht meckert
export type ImportValues = {
  trainers: string[]
  tagIds: string[]
  newPrivateTags: string[]
}

export const prepareMdPayload = (
  file: File,
  fileContent: string,
  values: ImportValues,
) => {
  if (!validateMarkdown(fileContent)) {
    throw new Error(
      'The markdown has not the expected structure (it needs a H1 with the course title, at least one H2 "Note" and a H3 with Metadata for the note).',
    )
  }

  return {
    content: fileContent,
    fileName: file.name,
    fileSize: file.size,
    trainers: values.trainers,
    tagIds: values.tagIds,
    newPrivateTags: values.newPrivateTags,
    loggingMetadata: { component: 'ImportForm' },
  }
}

export const prepareHtmlPayload = (
  file: File,
  fileContent: string,
  values: ImportValues,
  selectors: UdemySelectors,
): AnalyzeHtmlPayloadSchema => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(fileContent, 'text/html')
  const title = doc.title || 'Udemy Course'
  const notesContainer = doc.querySelector(selectors.notesContainerSelector)

  if (!notesContainer) {
    throw new Error(
      'No notes found. Are you sure the file is a Udemy HTML file (from the browsers Dev Tools)?',
    )
  }
  const trainerUrlMeta = doc.querySelector(selectors.trainerUrlSelector)
  const parsedTrainerUrl = trainerUrlMeta
    ? trainerUrlMeta.getAttribute('content') || undefined
    : undefined

  const metaTags = Array.from(doc.querySelectorAll('meta'))
    .map((meta) => meta.outerHTML)
    .join('\n        ')

  const strippedHtml = `
  <!DOCTYPE html>
  <html>
   <head>
    <title>${title}</title>
    ${metaTags}
   </head>
   <body>
    ${notesContainer.outerHTML}
   </body>
  </html>`.trim()

  return {
    content: strippedHtml,
    fileName: file.name,
    fileSize: new Blob([strippedHtml]).size, // Größe des reduzierten HTMLs
    trainers: values.trainers,
    tagIds: values.tagIds,
    newPrivateTags: values.newPrivateTags,
    parsedTrainerUrl,
    loggingMetadata: { component: 'ImportForm' },
  }
}
