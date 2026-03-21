import * as cheerio from 'cheerio'
import {
  DURATION_SELECTOR,
  LECTURE_SELECTOR,
  NOTE_BODY_SELECTOR,
  NOTE_CODE_BLOCK_SELECTOR,
  NOTE_SELECTOR,
  NOTES_CONTAINER_SELECTOR,
  SECTION_SELECTOR,
} from './constants'

/**
 * In Cheerio 1.2.0 ist 'cheerio.Cheerio<any>' der sicherste Weg,
 * um ein selektiertes Element-Set zu typisieren, ohne auf interne
 * Unter-Namespaces zuzugreifen.
 */
type CheerioAPI = cheerio.CheerioAPI
type CheerioSelector = cheerio.Cheerio<any>

export function prepareAndConvertHtmlToMarkdown(htmlContent: string) {
  // 1. Original laden
  const $original = cheerio.load(htmlContent)
  const title = $original('title').text() || 'Meine Kurs-Notizen'

  // 2. Den gewünschten Container finden
  const notesContainer = $original(NOTES_CONTAINER_SELECTOR)

  if (!notesContainer.length) {
    return '# ${title}\n\nEs wurden keine Notizen gefunden'
  }

  // 3. Modifikation: Buttons entfernen
  notesContainer.find('button').remove()

  // 4. Das "neue Dokument" erstellen
  const $ = cheerio.load(`<!DOCTYPE html><html><body></body></html>`)
  $('body').append(notesContainer)

  return convertToMarkdown($, title)
}

export function convertToMarkdown($: CheerioAPI, title: string) {
  const container = $(NOTES_CONTAINER_SELECTOR)

  if (!container.length) return "Fehler: 'bookmarks-container' nicht gefunden."

  let markdown = `# ${title}\n\n`
  const notes = container.find(NOTE_SELECTOR)

  notes.each((_idx1: number, el: any) => {
    const note = $(el)

    const duration = note.find(DURATION_SELECTOR).text().trim() || '0:00'
    const section = note.find(SECTION_SELECTOR).text().trim() || ''
    const lecture = note.find(LECTURE_SELECTOR).text().trim() || ''
    const bodyContainer = note.find(NOTE_BODY_SELECTOR)

    markdown += `## Notiz bei ${duration}\n`
    markdown += `* **Zeitpunkt:** ${duration}\n`
    markdown += `* **Sektion:** ${section}\n`
    markdown += `* **Lektion:** ${lecture}\n\n`

    if (bodyContainer.length) {
      markdown += processNode(bodyContainer, $)
    }

    markdown += '\n---\n\n'
  })

  const cleanMarkdown = markdown
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim()

  return cleanMarkdown
}

function processNode(node: CheerioSelector, $: CheerioAPI) {
  let result = ''

  node.children().each((_idx2: number, el: any) => {
    const child = $(el)

    // Prüfung auf Tag-Element
    if (el && 'tagName' in el) {
      const tagName = (el.tagName as string).toUpperCase()

      // 1. Spezielle Behandlung für Code-Blöcke
      if (child.hasClass(NOTE_CODE_BLOCK_SELECTOR) || tagName === 'PRE') {
        let codeText = ''
        const lines = child.find('li')

        if (lines.length > 0) {
          codeText = lines
            .map((_idx3: number, li: any) => $(li).text())
            .get()
            .join('\n')
        } else {
          codeText = child.text()
        }

        result += `\n\`\`\`\n${codeText}\n\`\`\`\n\n`
      }
      // 2. Überschriften
      else if (tagName === 'H4') {
        result += `### ${child.text().trim()}\n\n`
      }
      // 3. Paragraphen
      else if (tagName === 'P') {
        result += `${processInlineFormatting(child, $)}\n\n`
      }
      // 4. Listen
      else if (tagName === 'UL' || tagName === 'OL') {
        child.find('li').each((_idx4: number, li: any) => {
          result += `* ${processInlineFormatting($(li), $)}\n`
        })
        result += '\n'
      } else {
        result += processNode(child, $)
      }
    }
  })

  return result
}

function processInlineFormatting(element: CheerioSelector, $: CheerioAPI) {
  let html = element.html() || ''

  html = html
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')

  return $('<div/>').html(html).text().trim()
}
