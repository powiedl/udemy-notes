import { describe, it, expect } from 'vitest'
import { getVisualCourseTitle, normalizeObject } from '../utils.lib'

// Import-Pfade entsprechend deiner Projektstruktur anpassen
// import { getVisualCourseTitle, normalizeObject } from './utils.lib';

describe('D) Hilfsfunktionen: getVisualCourseTitle', () => {
  it('12. Sollte einen einfachen Markdown-Titel (H1) korrekt extrahieren', () => {
    const md = '# Ein ganz normaler Kurstitel\n\n## Note'
    const title = getVisualCourseTitle(md)

    expect(title).toBe('Ein ganz normaler Kurstitel')
  })

  it('13. Sollte den reinen Text aus einem verlinkten Markdown-Titel extrahieren', () => {
    // Überprüft, ob die Regex bei Markdown-Links nur den Anzeigetext greift
    const md =
      '# [The Ultimate TypeScript Course](https://udemy.com/course/123)\n\n## Note'
    const title = getVisualCourseTitle(md)

    expect(title).toBe('The Ultimate TypeScript Course')
  })

  it('14. Sollte auf den Fallback "Unknown Course" zurückgreifen, wenn kein H1-Titel vorhanden ist', () => {
    const md = '## Nur ein Subtitel\n\nEinfacher Text.'
    const title = getVisualCourseTitle(md)

    // Die Implementierung liefert korrekterweise einen Fallback-String statt null/undefined
    expect(title).toBe('Unknown Course')
  })
})

describe('E) Hilfsfunktionen: normalizeObject', () => {
  it('15. Sollte die Schlüssel eines einfachen Objekts alphabetisch sortieren', () => {
    const obj = { z: 1, a: 2, m: 3 }
    const normalized = normalizeObject(obj)

    // JavaScript garantiert die Reihenfolge von String-Keys.
    // JSON.stringify ist der sicherste Weg, die deterministische Struktur zu prüfen.
    expect(JSON.stringify(normalized)).toBe('{"a":2,"m":3,"z":1}')
  })

  it('16. Sollte verschachtelte Objekte rekursiv sortieren', () => {
    const obj = {
      b: 2,
      a: {
        d: 4,
        c: 3,
      },
    }
    const normalized = normalizeObject(obj)

    expect(JSON.stringify(normalized)).toBe('{"a":{"c":3,"d":4},"b":2}')
  })

  it('17. Sollte Arrays unverändert in ihrer Reihenfolge lassen, aber Objekte innerhalb von Arrays sortieren', () => {
    const obj = {
      list: [{ z: 1, a: 2 }, 'ein normaler string', { y: 2, x: 1 }],
    }
    const normalized = normalizeObject(obj)

    expect(JSON.stringify(normalized)).toBe(
      '{"list":[{"a":2,"z":1},"ein normaler string",{"x":1,"y":2}]}',
    )
  })
})
