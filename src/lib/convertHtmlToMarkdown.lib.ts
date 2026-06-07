import * as cheerio from 'cheerio'
import type { ImportCourse, ImportNote } from '#/types/course.type'
import type { UdemySelectors } from '#/types/api.type'
import type { HtmlFormat } from '#/schemas/import-file.schema'

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
  selectors: UdemySelectors,
  format: HtmlFormat = 'legacy', // NEU: Format-Parameter mit Default
): ConvertResult {
  const $ = cheerio.load(htmlContent)
  const rawTitle =
    $(selectors.headTitleSelector).text() ||
    $(selectors.metaTitleSelector).attr('content') ||
    $(selectors.ogTitleSelector).attr('content') ||
    $('head title').text() || // Fallback auf das generierte HTML
    'Meine Kurs-Notizen'

  const title = rawTitle
    .replace(/^Course:\s*/i, '')
    .replace(/\s*\|\s*Udemy$/i, '')
    .trim()

  const description: string | undefined =
    $(selectors.metaDescriptionSelector).attr('content') ||
    $(selectors.ogDescriptionSelector).attr('content')
  const imageUrl: string | undefined = $(selectors.imageUrlSelector).attr(
    'content',
  )
  const courseUrl: string | undefined = $(selectors.courseUrlSelector).attr(
    'content',
  )
  const trainerUrl: string | undefined = $(selectors.trainerUrlSelector).attr(
    'content',
  )

  // Container abhängig vom Format ermitteln
  let notesContainer: CheerioSelection
  if (format === 'beta') {
    notesContainer = $(
      '.notes-drawer-module-scss-module__M_NRBW__notes-drawer, #content-drawer-notes',
    )
  } else {
    notesContainer = $(selectors.notesContainerSelector)
  }

  if (!notesContainer.length) {
    return {
      status: 'ERROR',
      message: `# ${title}\n\nEs wurden keine Notizen gefunden`,
    }
  }

  // Button-Cleanup lassen wir zur Sicherheit für beide Formate drinnen
  notesContainer.find('button').remove()

  return convertToMarkdown(
    $,
    { title, description, imageUrl, courseUrl, trainerUrl },
    selectors,
    format, // Format weiterreichen
  )
}

export function convertToMarkdown(
  $: CheerioAPI,
  courseMetaData: string | Omit<ImportCourse, 'notes'>,
  selectors: UdemySelectors,
  format: HtmlFormat = 'legacy', // NEU: Format-Parameter
): ConvertResult {
  let resultCourseMetadata: Omit<ImportCourse, 'notes'> = { title: '' }
  if (!(typeof courseMetaData === 'object')) {
    resultCourseMetadata.title = courseMetaData
  } else resultCourseMetadata = courseMetaData

  let markdown = `# ${resultCourseMetadata.title}\n\n`
  const course: ImportCourse = { ...resultCourseMetadata, notes: [] }

  // ==========================================
  // WEICHE: Abhängig vom Format iterieren
  // ==========================================
  if (format === 'beta') {
    const container = $(
      '.notes-drawer-module-scss-module__M_NRBW__notes-drawer, #content-drawer-notes',
    )
    if (!container.length) {
      return {
        status: 'ERROR',
        message: 'Fehler: Beta-Notizen-Container nicht gefunden.',
      }
    }

    const SECTION_SELECTOR =
      '.section-group-module-scss-module__CmJ1TG__section-group__title'
    const LECTURE_SELECTOR =
      '.curriculum-item-group-module-scss-module__fu8uYW__curriculum-item-group__header'
    const NOTE_SELECTOR = '.note-card-module-scss-module__PRvuDG__note-card'
    const TIMESTAMP_SELECTOR = '.udemy-notes-timestamp'
    const NOTE_BODY_SELECTOR = '._rich-text-viewer-wrapper_znlt2_30'

    const sections = container.find(SECTION_SELECTOR)
    const sectionNumberRegex = /^(?:Abschnitt|Section)\s+(\d+):\s+(.*)$/

    sections.each((_, sectionEl: CheerioNode) => {
      let section = $(sectionEl).text().trim().replace(/\s+/g, ' ')
      section = section.replace(sectionNumberRegex, '$1. $2').trim()

      const sectionContainer = $(sectionEl).closest('section')
      const lectures = sectionContainer.find(LECTURE_SELECTOR)

      lectures.each((_lectureElIndex, lectureEl: CheerioNode) => {
        let lecture = $(lectureEl).text().trim().replace(/\s+/g, ' ')
        lecture = lecture.trim()

        const lectureContainer = $(lectureEl).closest(
          '.curriculum-item-group-module-scss-module__fu8uYW__curriculum-item-group',
        )
        const notesFound = lectureContainer.find(NOTE_SELECTOR)

        notesFound.each((_noteElIndex, noteEl: CheerioNode) => {
          const noteElement = $(noteEl)
          const duration =
            noteElement.find(TIMESTAMP_SELECTOR).text().trim() || '0:00'
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
            noteMarkdown += processNode(bodyContainer, $, selectors)
          }

          const finalNoteContent = cleanUpMarkdown(noteMarkdown)
          note.content = finalNoteContent
          course.notes.push(note)

          markdown = markdown + finalNoteContent + '\n---\n\n'
        })
      })
    })
  } else {
    // --- LEGACY FORMAT ---
    const container = $(selectors.notesContainerSelector)
    if (!container.length) {
      return {
        status: 'ERROR',
        message: "Fehler: Legacy 'bookmarks-container' nicht gefunden.",
      }
    }

    const notesFound = container.find(selectors.noteSelector)

    notesFound.each((_, el: CheerioNode) => {
      const noteElement = $(el)
      const duration =
        noteElement.find(selectors.durationSelector).text().trim() || '0:00'
      const section =
        noteElement.find(selectors.sectionSelector).text().trim() || ''
      const lecture =
        noteElement.find(selectors.lectureSelector).text().trim() || ''
      const bodyContainer = noteElement.find(selectors.noteBodySelector)

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
        noteMarkdown += processNode(bodyContainer, $, selectors)
      }

      const finalNoteContent = cleanUpMarkdown(noteMarkdown)
      note.content = finalNoteContent
      course.notes.push(note)

      markdown = markdown + finalNoteContent + '\n---\n\n'
    })
  }

  const cleanMarkdown = cleanUpMarkdown(markdown)

  return { status: 'SUCCESS', markdown: cleanMarkdown, course }
}

function processNode(
  node: CheerioSelection,
  $: CheerioAPI,
  selectors: UdemySelectors,
): string {
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
      child.hasClass(selectors.noteCodeBlockSelector) ||
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
      const innerText = processNode(child, $, selectors)
      const trimmedInner = innerText.replace(/\n+$/, '')
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
      result += processNode(child, $, selectors)
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

  return result
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*__BR__\s*/g, '__BR__')
    .trim()
}

function cleanUpMarkdown(markdown: string): string {
  if (!markdown) return ''

  const lines = markdown.split('\n')
  let inCodeBlock = false

  const processedLines = lines.map((line) => {
    const trimmedLine = line.trim()

    if (trimmedLine.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      return line.trimStart()
    }

    if (inCodeBlock) {
      return line
    }

    return line.trimStart()
  })

  return processedLines
    .join('\n')
    .replace(/__BR__/g, '  \n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(?<! ) {1}\n/g, '\n')
    .replace(/^(#+ .*?) {2}\n/gm, '$1\n')
    .replace(/^(\* .*?) {2}\n/gm, '$1\n')
    .replace(/^(\d+\. .*?) {2}\n/gm, '$1\n')
    .trim()
}
