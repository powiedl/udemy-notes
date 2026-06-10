import { describe, it, expect } from 'vitest'
import {
  parseMarkdownCourse,
  processNoteForMarkdown,
  generateSignature,
} from '../export-helper.lib'
import type { SingleNote } from '#/lib/prisma-types.lib'

describe('export-helper.lib', () => {
  describe('generateSignature', () => {
    it('should generate a stable 16-character hex signature', () => {
      const data = {
        section: 'Section 1',
        lecture: 'Lecture 1',
        timestamp: '00:10',
      }
      const sig = generateSignature(data)

      expect(sig).toHaveLength(16)
      expect(sig).toMatch(/^[0-9a-f]+$/)
      // Die Signatur muss für die gleichen Daten immer gleich sein
      expect(generateSignature(data)).toBe(sig)
    })

    it('should generate the same signature regardless of key order in the object', () => {
      const sig1 = generateSignature({ a: 1, b: 2 })
      const sig2 = generateSignature({ b: 2, a: 1 })
      expect(sig1).toBe(sig2)
    })
  })

  describe('processNoteForMarkdown', () => {
    const mockNote = {
      section: 'Einführung',
      lecture: 'Willkommen zum Kurs',
      timestamp: '00:45',
      originalContent: 'Originaler Inhalt von Udemy.',
      editedContent: 'Meine bearbeitete Notiz.',
      tags: [{ tag: { name: 'Wichtig' } }, { tag: { name: 'Einführung' } }],
    } as unknown as SingleNote

    it('should generate markdown including metadata tags and content', () => {
      const result = processNoteForMarkdown(mockNote, {
        includeNotesMetadata: true,
        noteVersion: 'edited_with_fallback',
      })

      expect(result).toContain('udemy-note-meta')
      expect(result).toContain('## Note')
      expect(result).toContain('* Section: Einführung')
      expect(result).toContain('* Tags:')
      expect(result).toContain('  - Wichtig')
      expect(result).toContain('### Content')
      expect(result).toContain('Meine bearbeitete Notiz.')
    })

    it('should show only original content when version is "original"', () => {
      const result = processNoteForMarkdown(mockNote, {
        includeNotesMetadata: false,
        noteVersion: 'original',
      })
      expect(result).toContain('Originaler Inhalt von Udemy.')
      expect(result).not.toContain('Meine bearbeitete Notiz.')
    })

    it('should show both contents when version is "both"', () => {
      const result = processNoteForMarkdown(mockNote, {
        includeNotesMetadata: false,
        noteVersion: 'both',
      })
      expect(result).toContain('Meine bearbeitete Notiz.')
      expect(result).toContain('#### Original Content')
      expect(result).toContain('Originaler Inhalt von Udemy.')
    })

    it('should fallback to original content if editedContent is empty', () => {
      const emptyEditedNote = {
        ...mockNote,
        editedContent: '',
      } as unknown as SingleNote
      const result = processNoteForMarkdown(emptyEditedNote, {
        includeNotesMetadata: false,
        noteVersion: 'edited_with_fallback',
      })
      expect(result).toContain('Originaler Inhalt von Udemy.')
    })

    it('should display "no tags" if the tags array is empty', () => {
      const noteNoTags = { ...mockNote, tags: [] } as unknown as SingleNote
      const result = processNoteForMarkdown(noteNoTags, {
        includeNotesMetadata: true,
        noteVersion: 'edited_with_fallback',
      })
      expect(result).toContain('  - no tags')
    })
  })

  describe('parseMarkdownCourse', () => {
    it('should correctly parse a full markdown course export', () => {
      const md = `
<!-- udemy-course-meta: {"courseId":42,"courseTitle":"TypeScript Masterclass"} -->
# TypeScript Masterclass

Trainers:
- Max Mustermann

Tags:
- Programmierung
- Web-Entwicklung

<!-- udemy-note-meta: {"section":"S1","lecture":"L1","timestamp":"05:00","sig":"deadbeef"} -->
## Note

### Metadata

* Section: S1
* Lecture: L1
* Timestamp: 05:00
* Tags:
  - Decorators

### Content

Notiz-Text hier.

#### Original Content (from Udemy website)

Originaler Udemy Text.
`.trim()

      const result = parseMarkdownCourse(md)

      expect(result.courseId).toBe(42)
      expect(result.title).toBe('TypeScript Masterclass')
      expect(result.courseTrainers).toEqual(['Max Mustermann'])
      expect(result.courseTags).toEqual(['Programmierung', 'Web-Entwicklung'])
      expect(result.notes).toHaveLength(1)

      const note = result.notes[0]
      expect(note.section).toBe('S1')
      expect(note.lecture).toBe('L1')
      expect(note.timestamp).toBe('05:00')
      expect(note.parsedContent).toBe('Notiz-Text hier.')
      expect(note.parsedOriginalContent).toBe('Originaler Udemy Text.')
    })

    it('should extract title from H1 if metadata is missing', () => {
      const md = `# Mein Kurs Titel\n\n## Note`
      const result = parseMarkdownCourse(md)
      expect(result.title).toBe('Mein Kurs Titel')
    })

    it('should parse multiple notes in one file', () => {
      const md = `
# Kurs
## Note
Inhalt 1
## Note
Inhalt 2`
      const result = parseMarkdownCourse(md)
      expect(result.notes).toHaveLength(2)
    })
  })
})
