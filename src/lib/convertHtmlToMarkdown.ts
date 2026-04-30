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
import type { ImportCourse, ImportNote } from '#/types/course'

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

type CheerioAPI = cheerio.CheerioAPI
type CheerioNode = any
type CheerioSelection = cheerio.Cheerio<CheerioNode>

export function prepareAndConvertHtmlToMarkdown(
  htmlContent: string,
): ConvertResult {
  const $ = cheerio.load(htmlContent)
  const rawTitle = $('head > title').text() || 'Meine Kurs-Notizen'
  const title = rawTitle
    .replace(/^Course:\s*/, '')
    .replace(/\s*\|\s*Udemy$/, '')

  const notesContainer = $(NOTES_CONTAINER_SELECTOR)

  if (!notesContainer.length) {
    return {
      status: 'ERROR',
      message: `# ${title}\n\nEs wurden keine Notizen gefunden`,
    }
  }

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

  notes.each((_, el: CheerioNode) => {
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

    const finalNoteContent = cleanUpMarkdown(noteMarkdown)
    note.content = finalNoteContent
    course.notes.push(note)

    markdown = markdown + finalNoteContent + '\n---\n\n'
  })

  const cleanMarkdown = cleanUpMarkdown(markdown)

  return { status: 'SUCCESS', markdown: cleanMarkdown, course }
}

function processNode(node: CheerioSelection, $: CheerioAPI): string {
  let result = ''

  node.contents().each((_contentIndex, el: CheerioNode) => {
    if (el.type === 'text') {
      const text = $(el).text()
      if (text.trim() === '' && text.includes('\n')) {
        return
      }
      result += text
      return
    }

    if (el.type !== 'tag') return

    const child = $(el)
    const tagName = el.tagName.toUpperCase()

    if (
      child.hasClass(NOTE_CODE_BLOCK_SELECTOR) ||
      tagName === 'PRE' ||
      tagName === 'CODE'
    ) {
      let codeText = ''
      const lines = child.find('li')

      if (lines.length > 0) {
        codeText = lines
          .map((_lineIndex, li: CheerioNode) => $(li).text())
          .get()
          .join('\n')
      } else {
        codeText = child.text() || ''
      }

      const sanitizedCode = codeText.replace(/^\n+|\n+$/g, '')
      result += `\n\`\`\`\n${sanitizedCode}\n\`\`\`\n\n`
    } else if (tagName.match(/^H[1-6]$/)) {
      const level = Number(tagName[1])
      result += `${'#'.repeat(level)} ${child.text().trim()}\n\n`
    } else if (tagName === 'P') {
      result += `${processInlineFormatting(child, $)}\n\n`
    } else if (tagName === 'BLOCKQUOTE') {
      // 1. Inhalt des Blockquotes rekursiv verarbeiten
      const innerText = processNode(child, $)

      // 2. Überschüssige Newlines am Ende entfernen
      const trimmedInner = innerText.replace(/\n+$/, '')

      // 3. Jede Zeile mit '> ' präfixen
      const blockquoteText = trimmedInner
        .split('\n')
        .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
        .join('\n')

      result += `${blockquoteText}\n\n`
    } else if (tagName === 'UL' || tagName === 'OL') {
      const isOrdered = tagName === 'OL'
      child.children('li').each((index: number, li: CheerioNode) => {
        const $li = $(li)
        let liContent = ''
        const pInside = $li.children('p')

        if (pInside.length > 0) {
          liContent = processInlineFormatting(pInside, $)
        } else {
          liContent = processInlineFormatting($li, $)
        }

        const prefix = isOrdered ? `${index + 1}. ` : '* '
        result += `${prefix}${liContent}\n`
      })
      result += '\n'
    } else if (tagName === 'BR') {
      result += '__BR__'
    } else {
      result += processNode(child, $)
    }
  })

  return result
}

function processInlineFormatting(
  element: CheerioSelection,
  $: CheerioAPI,
): string {
  let result = ''

  element.contents().each((_, el: CheerioNode) => {
    if (el.type === 'text') {
      result += el.data
      return
    }

    if (el.type !== 'tag') return

    const $el = $(el)
    const tagName = el.tagName.toUpperCase()

    const innerContent = processInlineFormatting($el, $)

    switch (tagName) {
      case 'STRONG':
      case 'B':
        result += `**${innerContent}**`
        break
      case 'EM':
      case 'I':
        result += `*${innerContent}*`
        break
      case 'CODE':
        result += `\`${innerContent}\``
        break
      case 'BR':
        result += '__BR__'
        break
      default:
        result += innerContent
        break
    }
  })

  // Whitespace-Normalisierung:
  // Wir ersetzen alle Tabulatoren und mehrfache Leerzeichen durch ein einzelnes Leerzeichen.
  // Wir trimmen NICHT zeilenweise, da dies Zeilenanfänge innerhalb eines Absatzes verschieben kann.
  // Stattdessen entfernen wir nur führende/schleppende Newlines des gesamten Blocks.
  return result
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*__BR__\s*/g, '__BR__') // Platzhalter von Leerzeichen isolieren
    .trim()
}

function cleanUpMarkdown(markdown: string): string {
  if (!markdown) return ''

  const lines = markdown.split('\n')
  let inCodeBlock = false

  const processedLines = lines.map((line) => {
    const trimmedLine = line.trim()

    // Prüfen, ob wir einen Code-Block betreten oder verlassen
    if (trimmedLine.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      return line.trimStart() // Die Backticks selbst dürfen links bündig sein
    }

    // Wenn wir im Code-Block sind, nichts verändern (Einrückung erhalten)
    if (inCodeBlock) {
      return line
    }

    // Außerhalb von Code-Blöcken: Standard-Cleanup (HTML-Einrückungen entfernen)
    return line.trimStart()
  })

  return (
    processedLines
      .join('\n')
      // 1. Platzhalter in Markdown-Linebreaks umwandeln
      .replace(/__BR__/g, '  \n')
      // 2. Mehr als zwei Newlines zu zwei Newlines reduzieren
      .replace(/\n{3,}/g, '\n\n')
      // 4. Einzelne Leerzeichen am Zeilenende entfernen (außer gewollte 2 Leerzeichen)
      .replace(/(?<! ) {1}\n/g, '\n')
      // 5. Überschriften und Listenpunkte säubern
      .replace(/^(#+ .*?) {2}\n/gm, '$1\n')
      .replace(/^(\* .*?) {2}\n/gm, '$1\n')
      .replace(/^(\d+\. .*?) {2}\n/gm, '$1\n')
      .trim()
  )
}
