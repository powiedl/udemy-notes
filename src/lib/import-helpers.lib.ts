import type {
  AnalyzeHtmlPayloadSchema,
  ExtractedCourseMetadata,
} from '#/schemas/import-file.schema'
import type { UdemySelectors } from '#/types/api.type'

/**
 * Zählt öffnende und schließende Klammern, um ein valides JSON-Objekt
 * aus einem wilden JavaScript/Next.js-String zu extrahieren.
 */
export const extractJsonFromNextJsScript = (
  scriptContent: string,
  searchKey: string,
): any | null => {
  let contentToSearch = scriptContent

  // Next.js bettet das JSON manchmal als Objekt und manchmal als maskierten (escaped) String ein.
  // Beispiel maskiert: {\"initialState\": ... }
  // Wenn wir die maskierte Version finden, "ent-escapen" wir sie für den Suchdurchlauf,
  // damit unser Klammer-Zähler fehlerfrei funktioniert.
  if (contentToSearch.includes(`{\\"${searchKey}\\"`)) {
    contentToSearch = contentToSearch
      .replace(/\\"/g, '"') // Macht \" zu "
      .replace(/\\\\/g, '\\') // Erhält echte Backslashes im JSON
  }

  const startIndex = contentToSearch.indexOf(`{"${searchKey}"`)
  if (startIndex === -1) return null

  let openBraces = 0
  let isInsideString = false
  let escapeNext = false

  for (let i = startIndex; i < contentToSearch.length; i++) {
    const char = contentToSearch[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\') {
      escapeNext = true
      continue
    }

    if (char === '"') {
      isInsideString = !isInsideString
      continue
    }

    if (!isInsideString) {
      if (char === '{') openBraces++
      if (char === '}') {
        openBraces--
        if (openBraces === 0) {
          const jsonString = contentToSearch.substring(startIndex, i + 1)
          try {
            return JSON.parse(jsonString)
          } catch (e) {
            console.error('Fehler beim Parsen des extrahierten JSONs', e)
            return null
          }
        }
      }
    }
  }
  return null
}

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

export const prepareLegacyHtmlPayload = (
  doc: Document,
  file: File,
  values: ImportValues,
  selectors: UdemySelectors,
  notesContainer: Element,
): AnalyzeHtmlPayloadSchema => {
  const title = doc.title || 'Udemy Course'

  const trainerUrlMeta = doc.querySelector(selectors.trainerUrlSelector)
  const parsedTrainerUrl = trainerUrlMeta
    ? trainerUrlMeta.getAttribute('content') || undefined
    : undefined

  const metaTags = Array.from(doc.querySelectorAll('meta'))
    .map((meta) => meta.outerHTML)
    .join('\n    ')

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
    fileSize: new Blob([strippedHtml]).size,
    trainers: values.trainers,
    tagIds: values.tagIds,
    newPrivateTags: values.newPrivateTags,
    parsedTrainerUrl,
    loggingMetadata: { component: 'ImportForm', feature: 'legacy' },
  }
}

export const prepareBetaHtmlPayload = (
  doc: Document,
  file: File,
  values: ImportValues,
  notesContainer: Element,
): AnalyzeHtmlPayloadSchema => {
  // Hinweis: Schema muss 'courseMetadata?: ExtractedCourseMetadata' erlauben

  // 1a. Timestamps aus den Footern retten
  const footers = notesContainer.querySelectorAll(
    'div[class*="__note-card__footer"]',
  )

  footers.forEach((footer) => {
    // Wir suchen das span, das "__timestamp-badge" in der Klasse hat.
    // (Nutzen von *= "enthält" statt $= "endet mit", da oft noch Modifikatoren wie "--clickable" am Ende der Klasse stehen)
    const timestampSpan = footer.querySelector(
      'span[class*="__timestamp-badge"]',
    )

    if (timestampSpan) {
      // Neues sicheres Wrapper-div erstellen
      const timestampDiv = doc.createElement('div')
      timestampDiv.className = 'udemy-notes-timestamp'

      // Den originalen Timestamp-Span in unser neues Div klonen
      timestampDiv.appendChild(timestampSpan.cloneNode(true))

      // Unser neues Div VOR dem originalen Footer in den DOM einhängen
      footer.parentNode?.insertBefore(timestampDiv, footer)
    }

    // Den alten Footer samt Inhalt (inklusive der Bearbeiten/Löschen Buttons) restlos entfernen
    footer.remove()
  })

  // 1b. Restlichen Container bereinigen (Footer ist hier nicht mehr nötig, da schon gelöscht)
  const trashSelectors = [
    'div[class$="__notes-filter-controls"]',
    'button', // Falls noch andere Buttons im HTML herumfliegen
    'div[class$="__notes-drawer__create-overlay"]',
  ].join(', ')
  notesContainer.querySelectorAll(trashSelectors).forEach((el) => el.remove())

  // 2. Metadaten aus dem Next.js Skript extrahieren
  let courseMetadata: ExtractedCourseMetadata = {}
  const scripts = Array.from(doc.querySelectorAll('script'))

  for (const script of scripts) {
    const text = script.textContent || ''
    if (
      text.includes('initialState') &&
      text.includes('contentPlayerPageStore')
    ) {
      const parsedData = extractJsonFromNextJsScript(text, 'initialState')

      if (
        parsedData?.initialState?.contentPlayerPageStore?.courseStore?.course
      ) {
        const courseInfo =
          parsedData.initialState.contentPlayerPageStore.courseStore.course

        courseMetadata = {
          udemyCourseId: courseInfo.id ? courseInfo.id.toString() : undefined,
          courseTitle: courseInfo.title,
          images: courseInfo.images,
          instructors: courseInfo.instructors?.map((inst: any) => ({
            name: inst.name,
            url: inst.url,
            image: inst.images?.px50x50,
          })),
        }
        break
      }
    }
  }

  // 3. Valides, minimales HTML für die Notizen bauen
  const metaTags = Array.from(doc.querySelectorAll('meta'))
    .map((meta) => meta.outerHTML)
    .join('\n    ')

  const strippedHtml = `
<!DOCTYPE html>
<html>
  <head>
    <title>${doc.title}</title>
    ${metaTags}
  </head>
  <body>
    ${notesContainer.outerHTML}
  </body>
</html>`.trim()
  // console.log('prepareBetaHtmlPayload,strippedHTML:', strippedHtml)

  // 4. Payload zurückgeben (inklusive sauberem Metadaten-Objekt)
  return {
    content: strippedHtml,
    fileName: file.name,
    fileSize: new Blob([strippedHtml]).size,
    trainers: values.trainers,
    tagIds: values.tagIds,
    newPrivateTags: values.newPrivateTags,
    parsedTrainerUrl: courseMetadata.instructors?.[0]?.url,
    courseMetadata, // <-- Direktes Übergeben des Objekts an den Server
    loggingMetadata: { component: 'ImportForm', feature: 'beta' },
    format: 'beta',
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

  // Prüfen, ob wir im neuen Beta-Format sind
  const betaContainer = doc.querySelector(
    '.notes-drawer-module-scss-module__M_NRBW__notes-drawer, #content-drawer-notes',
  )

  if (betaContainer) {
    // Neues Format an den neuen Parser leiten
    return prepareBetaHtmlPayload(doc, file, values, betaContainer)
  }

  // Fallback auf das alte Format
  const legacyContainer = doc.querySelector(selectors.notesContainerSelector)
  if (!legacyContainer) {
    throw new Error(
      'No notes found. Are you sure the file is a Udemy HTML file (from the browsers Dev Tools)?',
    )
  }

  return prepareLegacyHtmlPayload(doc, file, values, selectors, legacyContainer)
}
