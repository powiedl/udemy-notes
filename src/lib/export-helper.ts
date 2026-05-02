import type { SingleNote } from './prisma-types'
import type { ExportMdFileSchema } from '#/schemas/export-file'

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
  let markdown = '## Note\n\n'
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
