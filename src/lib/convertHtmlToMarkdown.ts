import { JSDOM } from 'jsdom'
import {
  DURATION_SELECTOR,
  LECTURE_SELECTOR,
  NOTE_BODY_SELECTOR,
  NOTE_CODE_BLOCK_SELECTOR,
  NOTE_SELECTOR,
  NOTES_CONTAINER_SELECTOR,
  SECTION_SELECTOR,
} from './constants'

export function prepareAndConvertHtmlToMarkdown(htmlContent: string) {
  const dom = new JSDOM(htmlContent)
  const document = dom.window.document

  const newDom = new JSDOM()
  const newDoc = newDom.window.document
  newDoc.title = document.title

  const notes = document.querySelector(
    'div[data-purpose="bookmarks-container"]',
  )
  if (!notes) return '# Meine Kurs-Notizen\n\nEs wurden keine Notizen gefunden'
  const btns = notes.querySelectorAll('button')
  btns.forEach((b) => b.remove())
  newDoc.body.append(notes)
  return convertToMarkdown(newDoc)
}

export function convertToMarkdown(root: HTMLDocument) {
  const searchScope = root.body
  const container = searchScope.querySelector(NOTES_CONTAINER_SELECTOR)

  if (!container) return "Fehler: 'bookmarks-container' nicht gefunden."

  let markdown = '# Meine Kurs-Notizen\n\n'
  const notes = container.querySelectorAll(NOTE_SELECTOR)

  notes.forEach((note) => {
    const duration =
      note.querySelector(DURATION_SELECTOR)?.textContent.trim() || '0:00'
    const section =
      note.querySelector(SECTION_SELECTOR)?.textContent.trim() || ''
    const lecture =
      note.querySelector(LECTURE_SELECTOR)?.textContent.trim() || ''
    const bodyContainer = note.querySelector(NOTE_BODY_SELECTOR)

    markdown += `## Notiz bei ${duration}\n`
    markdown += `* **Zeitpunkt:** ${duration}\n`
    markdown += `* **Sektion:** ${section}\n`
    markdown += `* **Lektion:** ${lecture}\n\n`

    if (bodyContainer) {
      markdown += processNode(bodyContainer, root)
    }

    markdown += '\n---\n\n'
  })
  const cleanMarkdown = markdown
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim()

  return cleanMarkdown
}

function processNode(node: Element, docContext: HTMLDocument) {
  let result = ''

  for (const child of node.children) {
    if (child.nodeType === 1) {
      // ELEMENT_NODE

      // 1. Spezielle Behandlung für Code-Blöcke
      if (
        child.classList.contains(NOTE_CODE_BLOCK_SELECTOR) ||
        child.tagName === 'PRE'
      ) {
        let codeText = ''

        // Prüfen, ob der Code in einer Liste (ol/li) strukturiert ist
        const lines = child.querySelectorAll('li')
        if (lines.length > 0) {
          // Zeilen einzeln extrahieren und mit Newline verbinden
          codeText = Array.from(lines)
            .map((li) => li.textContent)
            .join('\n')
        } else {
          // Falls keine Liste da ist, nutzen wir innerText (respektiert meist <br>)
          codeText = child.textContent
        }

        result += `\n\`\`\`\n${codeText}\n\`\`\`\n\n`
      }
      // 2. Überschriften
      else if (child.tagName === 'H4') {
        result += `### ${child.textContent.trim()}\n\n`
      }
      // 3. Paragraphen
      else if (child.tagName === 'P') {
        result += `${processInlineFormatting(child as HTMLParagraphElement, docContext)}\n\n`
      }
      // 4. Listen (normale Aufzählungen im Text)
      else if (child.tagName === 'UL' || child.tagName === 'OL') {
        child.querySelectorAll('li').forEach((li) => {
          result += `* ${processInlineFormatting(li, docContext)}\n`
        })
        result += '\n'
      } else {
        result += processNode(child, docContext)
      }
    }
  }

  return result
}

function processInlineFormatting(
  element: HTMLLIElement | HTMLParagraphElement,
  docContext: HTMLDocument,
) {
  let html = element.innerHTML
  html = html
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')

  const temp = docContext.createElement('div')
  temp.innerHTML = html
  return temp.textContent.trim()
}
