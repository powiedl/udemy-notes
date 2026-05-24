import { describe, it, expect } from 'vitest'
import { prepareAndConvertHtmlToMarkdown } from '#/lib/convertHtmlToMarkdown.lib'
import { UDEMY_SELECTORS } from '#/lib/constants.lib.server'

describe('prepareAndConvertHtmlToMarkdown', () => {
  const toAttr = (selector: string): string => {
    if (selector.includes('data-purpose')) {
      const match = selector.match(/data-purpose="([^"]+)"/)
      return match ? `data-purpose="${match[1]}"` : ''
    }
    return `class="${selector.replace(/^\./, '')}"`
  }

  // Erweitert um Meta-Tags für umfassendes Metadaten-Testing
  const createMockHtml = (
    noteContentHtml: string,
    headContent: string = '',
  ) => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Course: React Mastery | Udemy</title>
          ${headContent}
        </head>
        <body>
          <div ${toAttr(UDEMY_SELECTORS.notesContainerSelector)}>
            <div ${toAttr(UDEMY_SELECTORS.noteSelector)}>
              <span ${toAttr(UDEMY_SELECTORS.durationSelector)}>1:23</span>
              <div ${toAttr(UDEMY_SELECTORS.sectionSelector)}>Sektion 1</div>
              <div ${toAttr(UDEMY_SELECTORS.lectureSelector)}>Lektion 5</div>
              <div ${toAttr(UDEMY_SELECTORS.noteBodySelector)}>
                ${noteContentHtml}
              </div>
            </div>
          </div>
        </body>
      </html>
    `
  }

  describe('Metadaten-Extraktion', () => {
    it('sollte Standard-Metadaten korrekt extrahieren und bereinigen', () => {
      const headContent = `
        <meta name="description" content="Ein umfassender React Kurs.">
        <meta property="og:image" content="https://example.com/react.jpg">
        <meta property="og:url" content="https://udemy.com/course/react">
      `
      // UDEMY_SELECTORS müssen hier matchen, z.B. meta[name="description"]
      const html = createMockHtml('<p>Notiz</p>', headContent)
      const result = prepareAndConvertHtmlToMarkdown(html, UDEMY_SELECTORS)

      if (result.status === 'ERROR') throw new Error(result.message)

      // Prüft die Bereinigung von "Course: " und " | Udemy"
      expect(result.course.title).toBe('React Mastery')

      // Prüft die Zuweisung der zusätzlichen Felder (je nach Typendefinition in ImportCourse)
      expect((result.course as any).description).toBe(
        'Ein umfassender React Kurs.',
      )
      expect((result.course as any).imageUrl).toBe(
        'https://example.com/react.jpg',
      )
      expect((result.course as any).courseUrl).toBe(
        'https://udemy.com/course/react',
      )
    })

    it('sollte auf OpenGraph (og:) Fallbacks zurückgreifen, wenn Standard-Tags fehlen', () => {
      const headContent = `
        <meta property="og:title" content="Course: Vue Mastery | Udemy">
        <meta property="og:description" content="OG Description Fallback">
      `
      // Wir entfernen den <title> Tag manuell, um den Fallback zu testen
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            ${headContent}
          </head>
          <body>
            <div ${toAttr(UDEMY_SELECTORS.notesContainerSelector)}>
              <div ${toAttr(UDEMY_SELECTORS.noteSelector)}>
                <div ${toAttr(UDEMY_SELECTORS.noteBodySelector)}><p>Test</p></div>
              </div>
            </div>
          </body>
        </html>
      `
      const result = prepareAndConvertHtmlToMarkdown(html, UDEMY_SELECTORS)

      if (result.status === 'ERROR') throw new Error(result.message)

      expect(result.course.title).toBe('Vue Mastery')
      expect((result.course as any).description).toBe('OG Description Fallback')
    })

    it('sollte einen sauberen Fehler werfen und trotzdem den Titel parsen, wenn keine Notizen existieren', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Course: Leerer Kurs | Udemy</title>
          </head>
          <body>
            <!-- Container fehlt absichtlich -->
          </body>
        </html>
      `
      const result = prepareAndConvertHtmlToMarkdown(html, UDEMY_SELECTORS)

      expect(result.status).toBe('ERROR')
      if (result.status === 'ERROR') {
        expect(result.message).toContain('# Leerer Kurs')
        expect(result.message).toContain('Es wurden keine Notizen gefunden')
      }
    })
  })

  describe('Markdown-Konvertierung (Parsing)', () => {
    it('sollte einfachen Text korrekt extrahieren', () => {
      const html = createMockHtml('<p>Das ist eine einfache Notiz.</p>')
      const result = prepareAndConvertHtmlToMarkdown(html, UDEMY_SELECTORS)

      if (result.status === 'ERROR') throw new Error(result.message)

      expect(result.course.notes[0].content).toBe(
        'Das ist eine einfache Notiz.',
      )
    })

    it('sollte Udemy Code-Blöcke korrekt erkennen', () => {
      const codeHtml = `
        <div class="${UDEMY_SELECTORS.noteCodeBlockSelector}">
          <li>conso-log("Hello World")</li>
        </div>
      `
      const html = createMockHtml(codeHtml)
      const result = prepareAndConvertHtmlToMarkdown(html, UDEMY_SELECTORS)

      if (result.status === 'ERROR') throw new Error(result.message)

      expect(result.course.notes[0].content).toContain('```')
      expect(result.course.notes[0].content).toContain(
        'conso-log("Hello World")',
      )
    })

    it('sollte fett und kursiv geschriebene HTML Tags richtig rendern', () => {
      const html = createMockHtml(
        '<p>Innerhalb <strong><em>dieses</em></strong> HTML Elements (<em>oft</em> ein <em><strong>&lt;div&gt;</strong></em>) kann <strong>man</strong> dann</p>',
      )
      const result = prepareAndConvertHtmlToMarkdown(html, UDEMY_SELECTORS)

      if (result.status === 'ERROR') throw new Error(result.message)

      expect(result.course.notes[0].content).toContain(
        'Innerhalb ***dieses*** HTML Elements (*oft* ein ***<div>***) kann **man** dann',
      )
    })

    it('sollte Zeilenumbrüche richtig rendern', () => {
      const html = createMockHtml('<p>Test<br>mit<br>Umbrüchen</p>')
      const result = prepareAndConvertHtmlToMarkdown(html, UDEMY_SELECTORS)

      if (result.status === 'ERROR') throw new Error(result.message)

      expect(result.course.notes[0].content).toContain(
        `Test  \nmit  \nUmbrüchen`,
      )
    })

    it('sollte HTML Entities im Code-Block korrekt nativ durch Cheerio als Text darstellen', () => {
      const codeWithEntities = `
        <div class="${UDEMY_SELECTORS.noteCodeBlockSelector}">
          <li>if (a &gt; b) { return "&lt;div&gt;"; }</li>
        </div>
      `
      const html = createMockHtml(codeWithEntities)
      const result = prepareAndConvertHtmlToMarkdown(html, UDEMY_SELECTORS)

      if (result.status === 'ERROR') throw new Error(result.message)

      // Cheerio's .text() handelt HTML-Entities automatisch ab, was Test-Ausfälle durch manuelles Escapen verhindert.
      expect(result.course.notes[0].content).toContain(
        'if (a > b) { return "<div>"; }',
      )
    })

    it('sollte Einrückungen in mehrzeiligen Codeblöcken exakt erhalten', () => {
      const html = createMockHtml(`
        <div ${toAttr(UDEMY_SELECTORS.noteCodeBlockSelector)}>
          <pre>
            <ol>
              <li>const start = true;</li>
              <li>  if (start) {</li>
              <li>    console.log("Indented");</li>
              <li>  }</li>
            </ol>
          </pre>
        </div>
      `)
      const result = prepareAndConvertHtmlToMarkdown(html, UDEMY_SELECTORS)

      if (result.status === 'ERROR') throw new Error(result.message)

      const content = result.course.notes[0].content
      expect(content).toContain('  if (start) {')
      expect(content).toContain('    console.log("Indented");')
    })
  })
})
