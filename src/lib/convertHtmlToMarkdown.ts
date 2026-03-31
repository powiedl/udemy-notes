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
import type { ImportCourse, ImportNote } from './types'

interface ConvertResultSuccess {
  markdown: string
  course: ImportCourse
  status: 'SUCCESS'
}
interface ConvertResultError {
  status: 'ERROR'
  message: string
}
export type ConvertResult = ConvertResultSuccess | ConvertResultError

/**
 * Hilfstypen für Cheerio
 */
type CheerioAPI = cheerio.CheerioAPI
type CheerioNode = any
type CheerioSelection = cheerio.Cheerio<CheerioNode>

export function prepareAndConvertHtmlToMarkdown(
  htmlContent: string,
): ConvertResult {
  // 1. Dokument laden
  const $ = cheerio.load(htmlContent)
  const rawTitle = $('head > title').text() || 'Meine Kurs-Notizen'
  const title = rawTitle.replace(/^Course:\s*/, '').replace(/\|\s*Udemy$/, '')

  // 2. Container finden
  const notesContainer = $(NOTES_CONTAINER_SELECTOR)

  if (!notesContainer.length) {
    return {
      status: 'ERROR',
      message: '# ${title}\n\nEs wurden keine Notizen gefunden',
    }
  }

  // 3. Modifikation: Buttons entfernen
  notesContainer.find('button').remove()

  return convertToMarkdown($, title)
}

export function convertToMarkdown($: CheerioAPI, title: string): ConvertResult {
  const container = $(NOTES_CONTAINER_SELECTOR)

  if (!container.length)
    return {
      status: 'ERROR',
      message: "Fehler: 'bookmarks-container' nicht gefunden.",
    }

  let markdown = `# ${title}\n\n`
  const course: ImportCourse = { title, notes: [] }

  const notes = container.find(NOTE_SELECTOR)

  notes.each((_: number, el: any) => {
    const noteElement = $(el)
    const duration = noteElement.find(DURATION_SELECTOR).text().trim() || '0:00'
    const section = noteElement.find(SECTION_SELECTOR).text().trim() || ''
    const lecture = noteElement.find(LECTURE_SELECTOR).text().trim() || ''
    const bodyContainer = noteElement.find(NOTE_BODY_SELECTOR)
    const note: ImportNote = {
      timestamp: duration,
      section,
      lecture,
      content: '',
    }

    markdown += `## Notiz bei ${duration}\n`
    markdown += `* **Zeitpunkt:** ${duration}\n`
    markdown += `* **Sektion:** ${section}\n`
    markdown += `* **Lektion:** ${lecture}\n\n`

    let noteMarkdown = ''
    if (bodyContainer.length) {
      noteMarkdown += processNode(bodyContainer, $)
    }
    note.content = cleanUpMarkdown(noteMarkdown)
    course.notes.push(note)
    markdown = markdown + noteMarkdown + '\n---\n\n'
  })

  const cleanMarkdown = cleanUpMarkdown(markdown)

  return { status: 'SUCCESS', markdown: cleanMarkdown, course }
}

function processNode(node: CheerioSelection, $: CheerioAPI): string {
  let result = ''

  node.contents().each((_: number, el: CheerioNode) => {
    if (el.type === 'text') {
      const text = $(el).text()
      // Ignoriere reine Whitespace-Knoten, die Zeilenumbrüche enthalten (typische HTML-Einrückung)
      if (text.trim() === '' && text.includes('\n')) {
        return
      }
      result += text
      return
    }

    if (el.type !== 'tag') return

    const child = $(el)
    const tagName = el.tagName.toUpperCase()
    console.log('tagName', tagName)

    // 1. Code-Blöcke (Udemy nutzt oft Klassen oder PRE/CODE)
    if (
      child.hasClass(NOTE_CODE_BLOCK_SELECTOR) ||
      tagName === 'PRE' ||
      tagName === 'CODE'
    ) {
      let codeText = ''
      const lines = child.find('li')

      if (lines.length > 0) {
        codeText = lines
          .map((_: number, li: any) => $(li).text())
          .get()
          .join('\n')
      } else {
        codeText = child.text()
      }

      result += `\n\`\`\`\n${codeText}\n\`\`\`\n\n`
    }
    // 2. Überschriften (H1-H6 flexibel)
    else if (tagName.match(/^H[1-6]$/)) {
      const level = Number(tagName[1])
      result += `${'#'.repeat(level)} ${child.text().trim()}\n\n`
    }
    // 3. Paragraphen
    else if (tagName === 'P') {
      result += `${processInlineFormatting(child, $)}\n\n`
    }
    // 4. Listen
    else if (tagName === 'UL' || tagName === 'OL') {
      child.find('li').each((_: number, li: any) => {
        result += `* ${processInlineFormatting($(li), $)}\n`
      })
      result += '\n'
    }
    // 5. Explizite Zeilenumbrüche
    else if (tagName === 'BR') {
      result += '  \n'
    }
    // 6. Andere Tags (div, span, etc.) rekursiv behandeln, um Texte darin zu finden
    else {
      result += processNode(child, $)
    }
  })

  return result
}

function processInlineFormatting(
  element: CheerioSelection,
  $: CheerioAPI,
): string {
  // Verwende einen eindeutigen Token für <br>, um sie von Source-Code-Umbrüchen zu unterscheiden
  const BR_TOKEN = '___MD_BR_TOKEN___'
  element.find('br').replaceWith(BR_TOKEN)

  const formatMap = [
    { tags: 'strong, b', wrapper: '**' },
    { tags: 'em, i', wrapper: '_' },
    { tags: 'code', wrapper: '`' },
  ]

  formatMap.forEach(({ tags, wrapper }) => {
    element.find(tags).each((_: number, el: any) => {
      const $el = $(el)
      // Für 'code' verwenden wir .html(), um eingebettete Tags wie <a> zu erhalten.
      // Bei anderen Formaten wie fett/kursiv reicht .text().
      const content = (tags === 'code' ? $el.html() : $el.text()) || ''

      const leading = content.match(/^\s+/)?.[0] || ''
      const trailing = content.match(/\s+$/)?.[0] || ''
      const trimmed = content.trim()

      if (trimmed.length === 0) {
        $el.replaceWith(leading)
        return
      }

      // Zero-Width-Space Logik für korrektes Markdown-Parsing bei fehlenden Leerzeichen
      const prev = el.prev as any
      const next = el.next as any
      const needsPrefix = prev?.type === 'text' && !/\s$/.test(prev.data)
      const needsSuffix = next?.type === 'text' && !/^\s/.test(next.data)

      const prefix = needsPrefix ? '\u200B' : ''
      const suffix = needsSuffix ? '\u200B' : ''

      $el.replaceWith(
        `${leading}${wrapper}${prefix}${trimmed}${suffix}${wrapper}${trailing}`,
      )
    })
  })

  // Extrahiere den Text und bereinige die HTML-Einrückungen
  let text = element.text()

  return (
    text
      // 1. Alle Folgen von Whitespace (Tabs, Newlines aus dem HTML) durch ein Leerzeichen ersetzen
      .replace(/[\t\n\r ]+/g, ' ')
      // 2. Platzhalter für <br> in Markdown-Linebreaks umwandeln und Segmente trimmen
      .split(BR_TOKEN)
      .map((part) => part.trim())
      .join('  \n')
      .trim()
  )
}

function cleanUpMarkdown(markdown: string): string {
  return (
    markdown
      .replace(/\n{3,}/g, '\n\n')
      // Behalte genau zwei Leerzeichen am Ende (Markdown Linebreak), entferne andere
      .replace(/[ \t]+$/gm, (match) => (match.length >= 2 ? '  ' : ''))
      .trim()
  )
}
