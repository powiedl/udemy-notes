import crypto from 'node:crypto'
import type { SingleNote } from '#/lib/prisma-types.lib'
import type { ExportMdFileSchema } from '#/schemas/export-file'
import { HTML_COMMENT_END, HTML_COMMENT_START } from './constants.lib'
import { SIGNING_SECRET } from './constants.lib.server'

export const parseMarkdownCourse = (mdContent: string) => {
  // 1. Text in Header und Notizen splitten (inkl. dynamischer Meta-Tags)
  // Baut den Regex: /(?:\s*)?^##\s+Note/gm
  const noteSplitRegex = new RegExp(
    `(?:${HTML_COMMENT_START} udemy-note-meta:\\s*\\{.*?\\}\\s*${HTML_COMMENT_END}\\s*)?^##\\s+Note`,
    'gm',
  )

  const normalizedContent = mdContent.replace(
    noteSplitRegex,
    (match) => `\n___NOTE_SPLIT___\n${match}`,
  )
  const parts = normalizedContent.split('\n___NOTE_SPLIT___\n')
  const headerContent = parts[0]
  const noteBlocks = parts.slice(1)

  // 2. Header-Informationen parsen
  let courseId: number | undefined = undefined
  let title = 'Unbekannter Kurs'

  // Baut den Regex für die Kurs-Metadaten
  const courseMetaRegex = new RegExp(
    `${HTML_COMMENT_START} udemy-course-meta:\\s*(\\{.*?\\})\\s*${HTML_COMMENT_END}`,
  )
  const courseMetaMatch = headerContent.match(courseMetaRegex)

  if (courseMetaMatch) {
    try {
      const meta = JSON.parse(courseMetaMatch[1])
      courseId = meta.courseId
      if (meta.courseTitle) title = meta.courseTitle
    } catch (e) {
      console.error('Fehler beim Parsen der Kurs-Metadaten', e)
    }
  }

  // Fallback, falls kein gültiger Titel im Meta-Tag war
  if (title === 'Unbekannter Kurs') {
    const titleMatch = headerContent.match(/^#\s+(.+)$/m)
    title = titleMatch ? titleMatch[1].trim() : 'Unbekannter Kurs'
  }

  // Trainer extrahieren
  const trainersSectionMatch = headerContent.match(
    /Trainers:\s*([\s\S]*?)(?=Tags:|##|$)/i,
  )
  let courseTrainers: string[] = []
  if (trainersSectionMatch) {
    courseTrainers = trainersSectionMatch[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('-') || line.startsWith('*'))
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
  }

  // Kurs-Tags extrahieren
  const tagsSectionMatch = headerContent.match(
    /Tags:\s*([\s\S]*?)(?=Trainers:|##|$)/i,
  )
  let courseTags: string[] = []
  if (tagsSectionMatch) {
    courseTags = tagsSectionMatch[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('-') || line.startsWith('*'))
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
  }

  // 3. Notizen parsen
  // Baut den Regex für die Notiz-Metadaten
  const noteMetaRegex = new RegExp(
    `${HTML_COMMENT_START} udemy-note-meta:\\s*(\\{.*?\\})\\s*${HTML_COMMENT_END}`,
  )

  const notes = noteBlocks.map((block) => {
    let metaSection = ''
    let metaLecture = ''
    let metaTimestamp: string | number | null = null

    const noteMetaMatch = block.match(noteMetaRegex)
    if (noteMetaMatch) {
      try {
        const meta = JSON.parse(noteMetaMatch[1])
        if (meta.section) metaSection = meta.section
        if (meta.lecture) metaLecture = meta.lecture
        if (meta.timestamp !== undefined) metaTimestamp = meta.timestamp
      } catch (e) {
        console.error('Fehler beim Parsen der Notiz-Metadaten', e)
      }
    }

    const sectionMatch = block.match(/\*\s*Section:\s*(.+)/)
    const lectureMatch = block.match(/\*\s*Lecture:\s*(.+)/)
    const timeMatch = block.match(
      /\*\s*Timestamp:\s*(\d{1,2}:\d{2}(?::\d{2})?)/,
    )

    const noteTagsMatch = block.match(/\*\s*Tags:\s*([\s\S]*?)(?=###|$)/)
    let noteTags: string[] = []
    if (noteTagsMatch) {
      noteTags = noteTagsMatch[1]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('-') || line.startsWith('*'))
        .map((line) => line.replace(/^[-*]\s*/, '').trim())
    }

    const contentMatch = block.match(
      /###\s+Content\s*\n([\s\S]*?)(?=####\s+Original Content|$)/i,
    )
    const originalMatch = block.match(
      /####\s+Original Content[^\n]*\n([\s\S]*)$/i,
    )

    return {
      section: metaSection || (sectionMatch ? sectionMatch[1].trim() : ''),
      lecture: metaLecture || (lectureMatch ? lectureMatch[1].trim() : ''),
      timestamp:
        metaTimestamp !== null
          ? String(metaTimestamp)
          : timeMatch
            ? timeMatch[1].trim()
            : '00:00',
      parsedContent: contentMatch ? contentMatch[1].trim() : '',
      parsedOriginalContent: originalMatch ? originalMatch[1].trim() : null,
      noteTags,
    }
  })

  return { courseId, title, courseTags, courseTrainers, notes }
}

export function processNoteForMarkdown(
  note: SingleNote,
  {
    includeNotesMetadata = true,
    noteVersion = 'edited_with_fallback',
  }: {
    includeNotesMetadata: boolean
    noteVersion: ExportMdFileSchema['noteVersion']
  },
): string {
  const noteMetaData = {
    section: note.section,
    lecture: note.lecture,
    timestamp: note.timestamp,
  }
  const noteSignature = generateSignature(noteMetaData)
  const noteMetaWithSig = { ...noteMetaData, sig: noteSignature }

  const noteMetaTag =
    HTML_COMMENT_START +
    ' udemy-note-meta: ' +
    JSON.stringify(noteMetaWithSig) +
    ' ' +
    HTML_COMMENT_END
  let markdown = `${noteMetaTag}\n## Note\n\n`
  if (includeNotesMetadata) {
    markdown += '### Metadata\n\n'
    markdown += `* Section: ${note.section}\n`
    markdown += `* Lecture: ${note.lecture}\n`
    markdown += `* Timestamp: ${note.timestamp}\n`
    markdown += `* Tags:\n`

    if (note.tags.length > 0) {
      note.tags.map((t) => {
        markdown += `  - ${t.tag.name}\n`
      })
    } else {
      markdown += '  - no tags'
    }
    markdown += '\n\n'
  }
  markdown += '### Content\n\n'
  if (noteVersion === 'original') {
    markdown += note.originalContent + `\n\n`
  } else if (note.editedContent.length > 0) {
    markdown += note.editedContent + '\n\n'
    if (noteVersion == 'both' && note.originalContent.length > 0) {
      markdown += `#### Original Content (from Udemy website)\n\n${note.originalContent}\n\n`
    }
  } else {
    markdown += note.originalContent + `\n\n`
  }
  return markdown
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, (match) => (match.length >= 2 ? '  ' : ''))
    .trim()
}

export function generateSignature(data: object): string {
  const secret = SIGNING_SECRET
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(data))
    .digest('hex')
    .slice(0, 16) // 16 Zeichen reichen für diesen Zweck völlig aus
}
