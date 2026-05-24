import { describe, it, expect, vi } from 'vitest'
import {
  parseMarkdownCourse,
  checkImportFileLogic,
} from '../import-export.logic.server'
import { HTML_COMMENT_START, HTML_COMMENT_END } from '#/lib/constants.lib'
import type * as ExportHelper from '#/lib/export-helper.lib'

// Sicherer Mock mit importOriginal, damit die restlichen Export-Helper intakt bleiben
vi.mock('#/lib/export-helper.lib', async (importOriginal) => {
  // Hier nutzen wir nun den sauber importierten Typen
  const actual = await importOriginal<typeof ExportHelper>()
  return {
    ...actual,
    generateSignature: vi.fn().mockReturnValue('mock-signature-123'),
  }
})

describe('A) Voranalyse: checkImportFileLogic (Das Alarmsystem)', () => {
  it('1. Erlaubte Änderungen: Sollte INTEGRITY_OK zurückgeben, wenn nur Inhalte, Tags oder Trainer verändert wurden', () => {
    const md = [
      HTML_COMMENT_START +
        ' udemy-course-meta: {"courseId":"123","courseTitle":"Original Kurs","sig":"mock-signature-123"} ' +
        HTML_COMMENT_END,
      '# Original Kurs',
      '',
      'Trainers:',
      '* Ein völlig neuer Trainer',
      '',
      'Tags:',
      '* neues-tag',
      '',
      HTML_COMMENT_START +
        ' udemy-note-meta: {"section":"1. Intro","lecture":"1. Welcome","timestamp":"00:00","sig":"mock-signature-123"} ' +
        HTML_COMMENT_END,
      '## Note',
      '* Section: 1. Intro',
      '* Lecture: 1. Welcome',
      '* Timestamp: 00:00',
      '* Tags:',
      '  - note-tag-neu',
      '',
      '### Content',
      'Ich habe den gesamten Text hier umgeschrieben. Die DNA ist aber unangetastet geblieben!',
    ].join('\n')

    const result = checkImportFileLogic(md)
    expect(result.status).toBe('INTEGRITY_OK')
    expect(result.courseTitle).toBe('Original Kurs')
  })

  it('2. Verbotene Änderung (Kurs): Sollte INTEGRITY_MISMATCH zurückgeben, wenn die H1 visuell manipuliert wurde', () => {
    const md = [
      HTML_COMMENT_START +
        ' udemy-course-meta: {"courseId":"123","courseTitle":"Original Kurs","sig":"mock-signature-123"} ' +
        HTML_COMMENT_END,
      '# Ein heimlich geänderter Kurstitel',
      '',
      '## Note',
    ].join('\n')

    const result = checkImportFileLogic(md)
    expect(result.status).toBe('INTEGRITY_MISMATCH')
  })

  it('3. Verbotene Änderung (Notiz): Sollte INTEGRITY_MISMATCH zurückgeben, wenn Section, Lecture oder Timestamp manipuliert wurden', () => {
    const md = [
      HTML_COMMENT_START +
        ' udemy-course-meta: {"courseId":"123","courseTitle":"Original Kurs","sig":"mock-signature-123"} ' +
        HTML_COMMENT_END,
      '# Original Kurs',
      '',
      HTML_COMMENT_START +
        ' udemy-note-meta: {"section":"1. Intro","lecture":"1. Welcome","timestamp":"00:00","sig":"mock-signature-123"} ' +
        HTML_COMMENT_END,
      '## Note',
      '* Section: 1. Intro',
      '* Lecture: 1. Welcome',
      '* Timestamp: 10:05',
      '',
      '### Content',
      'Ich habe heimlich die Zeit auf 10:05 geändert!',
    ].join('\n')

    const result = checkImportFileLogic(md)
    expect(result.status).toBe('INTEGRITY_MISMATCH')
  })

  it('4. Krypto-Sicherheit: Sollte INTEGRITY_MISMATCH zurückgeben, wenn die Signatur im JSON gebrochen/falsch ist', () => {
    const md = [
      HTML_COMMENT_START +
        ' udemy-course-meta: {"courseId":"123","courseTitle":"Original Kurs","sig":"falsche-signatur-vom-hacker"} ' +
        HTML_COMMENT_END,
      '# Original Kurs',
      '',
      '## Note',
    ].join('\n')

    const result = checkImportFileLogic(md)
    expect(result.status).toBe('INTEGRITY_MISMATCH')
  })
})

describe('B) Parser: parseMarkdownCourse (Die Eiserne Wahrheit)', () => {
  it('6. DNA sticht Markdown (Kurs): Sollte den Kurstitel aus den Metadaten verwenden und die H1 ignorieren', () => {
    const md = [
      HTML_COMMENT_START +
        ' udemy-course-meta: {"courseId":"999","courseTitle":"Der echte DNA Titel","sig":"mock-signature-123"} ' +
        HTML_COMMENT_END,
      '# Ein vom User manipulierter Fake-Titel',
      '',
      '## Note',
    ].join('\n')

    const result = parseMarkdownCourse(md)
    expect(result.title).toBe('Der echte DNA Titel')
    expect(result.courseId).toBe('999')
  })

  it('7. DNA sticht Markdown (Notiz): Sollte Section, Lecture und Timestamp strikt aus dem JSON holen', () => {
    const md = [
      HTML_COMMENT_START +
        ' udemy-note-meta: {"section":"1. Wahre Section","lecture":"2. Wahre Lecture","timestamp":"05:00","sig":"mock-signature-123"} ' +
        HTML_COMMENT_END,
      '## Note',
      '* Section: Fake Section',
      '* Lecture: Fake Lecture',
      '* Timestamp: 99:99',
      '',
      '### Content',
      'Inhalt',
    ].join('\n')

    const result = parseMarkdownCourse(md)
    const note = result.notes[0]

    expect(note.section).toBe('1. Wahre Section')
    expect(note.lecture).toBe('2. Wahre Lecture')
    expect(note.timestamp).toBe('05:00')
  })

  it('8. Fallback: Wenn die Signatur ungültig ist, muss der Parser auf den visuellen Text zurückfallen (und die DNA ignorieren)', () => {
    const md = [
      HTML_COMMENT_START +
        ' udemy-course-meta: {"courseId":"999","courseTitle":"Hacker Titel","sig":"ungueltig"} ' +
        HTML_COMMENT_END,
      '# Visueller Fallback Titel',
      '',
      HTML_COMMENT_START +
        ' udemy-note-meta: {"section":"Hacker Section","lecture":"Hacker Lecture","timestamp":"99:99","sig":"ungueltig"} ' +
        HTML_COMMENT_END,
      '## Note',
      '* Section: Visuelle Section',
      '* Lecture: Visuelle Lecture',
      '* Timestamp: 01:23',
      '',
      '### Content',
      'Inhalt',
    ].join('\n')

    const result = parseMarkdownCourse(md)
    const note = result.notes[0]

    // Da die Signatur falsch ist, wird courseId verworfen und der visuelle Titel genommen
    expect(result.courseId).toBeUndefined()
    expect(result.title).toBe('Visueller Fallback Titel')

    // Bei der Notiz greift ebenfalls der visuelle Fallback
    expect(note.section).toBe('Visuelle Section')
    expect(note.timestamp).toBe('01:23')
  })

  // --- Legacy-Tests für den sauberen Markdown-Fallback (ohne HTML Kommentare) ---

  it('1. sollte Titel, Kurs-Trainer und Kurs-Tags aus dem Header korrekt extrahieren (Legacy ohne Meta)', () => {
    const md = `
# Mein toller React Kurs

Trainers:
* Max Mustermann
- Erika Musterfrau

Tags:
* frontend
- react

## Note
* Section: 1. Intro
* Lecture: 1. Welcome
* Timestamp: 00:00

### Content
Test
    `.trim()

    const result = parseMarkdownCourse(md)

    expect(result.title).toBe('Mein toller React Kurs')
    expect(result.courseTrainers).toEqual([
      'Max Mustermann',
      'Erika Musterfrau',
    ])
    expect(result.courseTags).toEqual(['frontend', 'react'])
    expect(result.notes).toHaveLength(1)
  })

  it('2. sollte leere Arrays zurückgeben, wenn keine Kurs-Trainer oder Tags existieren', () => {
    const md = `
# Kurs ohne Metadaten

## Note
* Section: 1
* Lecture: 1
* Timestamp: 00:00

### Content
Test
    `.trim()

    const result = parseMarkdownCourse(md)

    expect(result.courseTrainers).toEqual([])
    expect(result.courseTags).toEqual([])
  })

  it('3. sollte Notizen-Metadaten und Notizen-Tags korrekt auslesen', () => {
    const md = `
# Kurs

## Note
* Section: 2. React Hooks
* Lecture: 5. useState
* Timestamp: 12:34
* Tags:
  - state
  - hooks

### Content
Test
    `.trim()

    const result = parseMarkdownCourse(md)
    const note = result.notes[0]

    expect(note.section).toBe('2. React Hooks')
    expect(note.lecture).toBe('5. useState')
    expect(note.timestamp).toBe('12:34')
    expect(note.noteTags).toEqual(['state', 'hooks'])
  })

  it('4. sollte zwischen "Content" und "Original Content" unterscheiden (bearbeitete Notiz)', () => {
    const md = `
# Kurs

## Note
* Section: 1
* Lecture: 1
* Timestamp: 01:00

### Content
Mein eigener, bearbeiteter Text.
Hier ist noch eine Zeile.

#### Original Content (from Udemy website)
Das ist der Text von Udemy.
    `.trim()

    const result = parseMarkdownCourse(md)
    const note = result.notes[0]

    expect(note.parsedContent).toContain('Mein eigener, bearbeiteter Text.')
    expect(note.parsedOriginalContent).toContain('Das ist der Text von Udemy.')
  })

  it('5. sollte parsedOriginalContent auf null setzen, wenn die Notiz nie bearbeitet wurde', () => {
    const md = `
# Kurs

## Note
* Section: 1
* Lecture: 1
* Timestamp: 02:00

### Content
Das ist der einzige Text (unbearbeitet).
    `.trim()

    const result = parseMarkdownCourse(md)
    const note = result.notes[0]

    expect(note.parsedContent).toBe('Das ist der einzige Text (unbearbeitet).')
    expect(note.parsedOriginalContent).toBeNull()
  })
})

describe('C) Parser: udemy-course-urls (Neue URL-Metadaten)', () => {
  it('9. Sollte courseUrl, imageUrl und die trainerUrl (erstes Element) korrekt aus den Metadaten auslesen', () => {
    // Hier nutzen wir echte URLs mit standard Zeichen, um den nativen Parsing-Flow zu testen
    const md = [
      HTML_COMMENT_START +
        ' udemy-course-urls: {"courseUrl":"https://udemy.com/course/react-the-complete-guide","imageUrl":"https://img.udemy.com/course/123.jpg","trainers":[{"title":"Max Mustermann","url":"https://udemy.com/user/max-mustermann/"},{"title":"Erika Musterfrau","url":"https://udemy.com/user/erika/"}],"sig":"mock-signature-123"} ' +
        HTML_COMMENT_END,
      '# React - The Complete Guide',
      '',
      '## Note',
    ].join('\n')

    const result = parseMarkdownCourse(md)

    expect(result.courseUrl).toBe(
      'https://udemy.com/course/react-the-complete-guide',
    )
    expect(result.imageUrl).toBe('https://img.udemy.com/course/123.jpg')
    // Es darf nur die URL des ersten Trainers extrahiert werden
    expect(result.trainerUrl).toBe('https://udemy.com/user/max-mustermann/')
  })

  it('10. Sollte graceful fehlschlagen und undefined zurückgeben, wenn die Signatur ungültig ist', () => {
    const md = [
      HTML_COMMENT_START +
        ' udemy-course-urls: {"courseUrl":"https://hacker.com/course","sig":"ungueltige-signatur"} ' +
        HTML_COMMENT_END,
      '# Hacker Kurs',
      '',
      '## Note',
    ].join('\n')

    const result = parseMarkdownCourse(md)

    // Da die Signatur falsch ist, muss der gesamte Block ignoriert werden
    expect(result.courseUrl).toBeUndefined()
    expect(result.imageUrl).toBeUndefined()
    expect(result.trainerUrl).toBeUndefined()
  })

  it('11. Sollte keine Fehler werfen, wenn das Trainers-Array leer ist oder fehlt', () => {
    const md = [
      HTML_COMMENT_START +
        ' udemy-course-urls: {"courseUrl":"https://udemy.com/course/123","sig":"mock-signature-123"} ' +
        HTML_COMMENT_END,
      '# Kurs ohne Trainer URL',
      '',
      '## Note',
    ].join('\n')

    const result = parseMarkdownCourse(md)

    expect(result.courseUrl).toBe('https://udemy.com/course/123')
    // trainerUrl muss undefined bleiben, da kein Array übergeben wurde
    expect(result.trainerUrl).toBeUndefined()
  })
})
