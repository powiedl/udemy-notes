import { describe, it, expect } from 'vitest'
import { parseMarkdownCourse } from '../import-export.logic.server' // Pfad ggf. anpassen

describe('parseMarkdownCourse', () => {
  it('1. sollte Titel, Kurs-Trainer und Kurs-Tags aus dem Header korrekt extrahieren', () => {
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

    // Da ein Original-Block existiert, muss parsedContent der bearbeitete Text sein
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
