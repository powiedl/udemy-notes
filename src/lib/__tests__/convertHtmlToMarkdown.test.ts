import { describe, it, expect } from 'vitest'
import { prepareAndConvertHtmlToMarkdown } from '#/lib/convertHtmlToMarkdown'
import * as CONSTANTS from '#/lib/constants'

describe('prepareAndConvertHtmlToMarkdown', () => {
  // Hilfsfunktion: Wandelt CSS-Selektoren in HTML-Attribute um
  const toAttr = (selector: string): string => {
    if (selector.includes('data-purpose')) {
      // Extrahiert "bookmarks-container" aus '[data-purpose="bookmarks-container"]'
      const match = selector.match(/data-purpose="([^"]+)"/)
      return match ? `data-purpose="${match[1]}"` : ''
    }
    // Entfernt den Punkt am Anfang für Klassen
    return `class="${selector.replace(/^\./, '')}"`
  }

  const createMockHtml = (noteContentHtml: string) => {
    return `
      <!DOCTYPE html>
      <html>
        <head><title>Course: React Mastery | Udemy</title></head>
        <body>
          <div ${toAttr(CONSTANTS.NOTES_CONTAINER_SELECTOR)}>
            <div ${toAttr(CONSTANTS.NOTE_SELECTOR)}>
              <span ${toAttr(CONSTANTS.DURATION_SELECTOR)}>1:23</span>
              <div ${toAttr(CONSTANTS.SECTION_SELECTOR)}>Sektion 1</div>
              <div ${toAttr(CONSTANTS.LECTURE_SELECTOR)}>Lektion 5</div>
              <div ${toAttr(CONSTANTS.NOTE_BODY_SELECTOR)}>
                ${noteContentHtml}
              </div>
            </div>
          </div>
        </body>
      </html>
    `
  }

  it('sollte einfachen Text und Titel korrekt extrahieren', () => {
    const html = createMockHtml('<p>Das ist eine einfache Notiz.</p>')
    const result = prepareAndConvertHtmlToMarkdown(html)

    if (result.status === 'ERROR') {
      throw new Error(result.message)
    }

    expect(result.course.title).toBe('React Mastery')
    expect(result.course.notes[0].content).toBe('Das ist eine einfache Notiz.')
  })

  it('sollte Udemy Code-Blöcke korrekt erkennen', () => {
    // Laut deiner Konstante: 'ud-component--base-components--code-block'
    // Da kein Punkt davor steht, wird es als Tag oder Klasse behandelt.
    // Udemy nutzt hier oft verschachtelte <li>.
    const codeHtml = `
      <div class="${CONSTANTS.NOTE_CODE_BLOCK_SELECTOR}">
        <li>conso-log("Hello World")</li>
      </div>
    `
    const html = createMockHtml(codeHtml)
    const result = prepareAndConvertHtmlToMarkdown(html)

    if (result.status === 'ERROR') throw new Error(result.message)

    expect(result.course.notes[0].content).toContain('```')
    expect(result.course.notes[0].content).toContain('conso-log("Hello World")')
  })

  it('sollte fett und kursiv geschriebene HTML Tags richtig rendern', () => {
    const html = createMockHtml(
      '<p>Innerhalb <strong><em>dieses</em></strong> HTML Elements (<em>oft</em> ein <em><strong>&lt;div&gt;</strong></em>) kann <strong>man</strong> dann</p>',
    )
    const result = prepareAndConvertHtmlToMarkdown(html)

    if (result.status === 'ERROR') throw new Error(result.message)

    expect(result.course.notes[0].content).toContain(
      'Innerhalb ***dieses*** HTML Elements (*oft* ein ***<div>***) kann **man** dann',
    )
  })

  it('sollte Zeilenumbrüche richtig rendern', () => {
    const html = createMockHtml(
      '<p>Wenn man mehrere Testgruppen und Tests<br>in einem File hat, <br>kann man einen einzelnen davon<br> ausführen, indem man dort <br> describe.only oder test.only schreibt&nbsp;(dann wird nur der .only Teil ausgeführt). Das kann manchmal hilfreich sein, weil es zu "Interferenzen"&nbsp;zwischen einzelnen Tests kommen kann. Auf diese Weise kann man recht schnell feststellen, ob der Test, der nicht wie erwartet funktioniert, falsch ist oder ob es vielleicht zu so einer Interferenz kommt.</p>',
    )
    const result = prepareAndConvertHtmlToMarkdown(html)

    if (result.status === 'ERROR') throw new Error(result.message)

    expect(result.course.notes[0].content).toContain(
      `Wenn man mehrere Testgruppen und Tests  
in einem File hat,  
kann man einen einzelnen davon  
ausführen, indem man dort  
describe.only oder test.only schreibt (dann wird nur der .only Teil ausgeführt). Das kann manchmal hilfreich sein, weil es zu "Interferenzen" zwischen einzelnen Tests kommen kann. Auf diese Weise kann man recht schnell feststellen, ob der Test, der nicht wie erwartet funktioniert, falsch ist oder ob es vielleicht zu so einer Interferenz kommt.`,
    )
  })

  it('sollte mehrzeilige Codeblöcke und nachfolgenden Text korrekt trennen', () => {
    // WICHTIG: Der Code-Block und das P-Tag müssen Geschwister sein.
    // Innerhalb des Code-Blocks nutzen wir die PRE/LI Struktur von Udemy.
    const complexHtml = `
      <div class="${CONSTANTS.NOTE_CODE_BLOCK_SELECTOR}">
        <pre>
          <ol>
            <li>describe('test', () => {</li>
            <li>  console.log('hello');</li>
            <li>});</li>
          </ol>
        </pre>
      </div>
      <p>Ein <strong>wichtiger</strong> Hinweis danach.</p>
    `

    const html = createMockHtml(complexHtml)
    const result = prepareAndConvertHtmlToMarkdown(html)

    if (result.status === 'ERROR') throw new Error(result.message)

    const content = result.course.notes[0].content

    // Wir testen die Bestandteile einzeln, um Whitespace-Probleme im Template-String zu umgehen
    expect(content).toContain('```')
    expect(content).toContain("describe('test', () => {")
    expect(content).toContain("console.log('hello');")
    expect(content).toContain('```')

    // Testet, ob die Formatierung ausserhalb des Code-Blocks greift
    expect(content).toContain('Ein **wichtiger** Hinweis danach.')

    // Sicherstellen, dass der Text NICHT im Codeblock gelandet ist (keine HTML Tags im Code)
    expect(content).not.toContain('```\n<p>')
  })

  it('sollte HTML Entities im Code-Block korrekt als Text darstellen', () => {
    const codeWithEntities = `
      <div class="${CONSTANTS.NOTE_CODE_BLOCK_SELECTOR}">
        <li>if (a &gt; b) { return "&lt;div&gt;"; }</li>
      </div>
    `
    const html = createMockHtml(codeWithEntities)
    const result = prepareAndConvertHtmlToMarkdown(html)

    if (result.status === 'ERROR') throw new Error(result.message)

    // .text() wandelt &gt; automatisch in > um
    expect(result.course.notes[0].content).toContain(
      'if (a > b) { return "<div>"; }',
    )
  })

  it('sollte nummerierte Aufzählungen richtig rendern', () => {
    const html = createMockHtml(
      '<h4>Prozess von MSW&nbsp;Tests (Moken der Fetch Requests)</h4><ol><li><p>Erzeugen eines Testfiles</p></li><li><p>Verstehen der genauen URL, des HTTP&nbsp;Verbs, und der Rückgabe (inkl. welche Teile der Rückgabe man verwendet)</p></li><li><p>Erzeugen eines MSW&nbsp;Handlers, der die Requests abfängt und die "vorgefertigten"&nbsp;Daten zurückliefert</p></li><li><p>Anlegen der beforeAll, afterEach und afterAll hooks im Testfile</p></li><li><p>Im Test wird die Komponente gerendert und dann warten man darauf, dass das richtige Element sichtbar wird</p></li></ol><p>',
    )
    const result = prepareAndConvertHtmlToMarkdown(html)

    if (result.status === 'ERROR') throw new Error(result.message)

    expect(result.course.notes[0].content).toContain(
      `#### Prozess von MSW Tests (Moken der Fetch Requests)

1. Erzeugen eines Testfiles
2. Verstehen der genauen URL, des HTTP Verbs, und der Rückgabe (inkl. welche Teile der Rückgabe man verwendet)
3. Erzeugen eines MSW Handlers, der die Requests abfängt und die "vorgefertigten" Daten zurückliefert
4. Anlegen der beforeAll, afterEach und afterAll hooks im Testfile
5. Im Test wird die Komponente gerendert und dann warten man darauf, dass das richtige Element sichtbar wird`,
    )
  })
  // ... weitere Tests wie oben
})
