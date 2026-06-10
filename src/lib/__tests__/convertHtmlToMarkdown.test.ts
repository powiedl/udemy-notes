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

  // Erweitert um Meta-Tags für umfassendes Metadaten-Testing (Legacy Format)
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

  // Spezieller HTML-Generator für das neue Beta-Format mit seinen harten CSS-Klassen
  const createMockBetaHtml = (noteContentHtml: string) => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Course: Beta Format Course | Udemy</title>
        </head>
        <body>
          <div id="content-drawer-notes">
            <section>
              <div class="section-group-module-scss-module__CmJ1TG__section-group__title">
                Section 2: Component State
              </div>
              <div class="curriculum-item-group-module-scss-module__fu8uYW__curriculum-item-group">
                <div class="curriculum-item-group-module-scss-module__fu8uYW__curriculum-item-group__header">
                  Lecture 10: Hooks
                </div>
                <div class="note-card-module-scss-module__PRvuDG__note-card">
                  <span class="udemy-notes-timestamp">4:42</span>
                  <div class="_rich-text-viewer-wrapper_znlt2_30">
                    ${noteContentHtml}
                  </div>
                </div>
              </div>
            </section>
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
      const html = createMockHtml('<p>Notiz</p>', headContent)
      const result = prepareAndConvertHtmlToMarkdown(html, UDEMY_SELECTORS)

      if (result.status === 'ERROR') throw new Error(result.message)

      // Prüft die Bereinigung von "Course: " und " | Udemy"
      expect(result.course.title).toBe('React Mastery')
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

  describe('Beta Format Parsing', () => {
    it('sollte das Beta-Format inkl. verschachtelter Sektionen und Lektionen korrekt verarbeiten', () => {
      const html = createMockBetaHtml('<p>Dies ist eine Beta-Notiz</p>')

      // WICHTIG: Das dritte Argument 'beta' muss übergeben werden!
      const result = prepareAndConvertHtmlToMarkdown(
        html,
        UDEMY_SELECTORS,
        'beta',
      )

      if (result.status === 'ERROR') throw new Error(result.message)

      expect(result.course.title).toBe('Beta Format Course')
      expect(result.course.notes.length).toBe(1)

      const note = result.course.notes[0]
      expect(note.timestamp).toBe('4:42')
      expect(note.content).toBe('Dies ist eine Beta-Notiz')

      // Der RegEx `^(?:Abschnitt|Section)\s+(\d+):\s+(.*)$` aus dem Beta-Parser
      // sollte 'Section 2: Component State' zu '2. Component State' formatiert haben
      expect(note.section).toBe('2. Component State')
      expect(note.lecture).toBe('Lecture 10: Hooks')
    })

    it('sollte im Beta-Modus einen Error werfen, wenn der Beta-Container nicht existiert', () => {
      // Wenn wir eine leere Seite übergeben, greift der initiale Check von prepareAndConvertHtmlToMarkdown
      const html = `<html><head><title>Test</title></head><body></body></html>`
      const result = prepareAndConvertHtmlToMarkdown(
        html,
        UDEMY_SELECTORS,
        'beta',
      )

      expect(result.status).toBe('ERROR')
    })
  })

  describe('Markdown-Konvertierung (Parsing & Tags)', () => {
    it('sollte einfachen Text korrekt extrahieren', () => {
      const html = createMockHtml('<p>Das ist eine einfache Notiz.</p>')
      const result = prepareAndConvertHtmlToMarkdown(html, UDEMY_SELECTORS)

      if (result.status === 'ERROR') throw new Error(result.message)
      expect(result.course.notes[0].content).toBe(
        'Das ist eine einfache Notiz.',
      )
    })

    it('sollte fett und kursiv geschriebene HTML Tags sowie Inline-Code richtig rendern', () => {
      const html = createMockHtml(
        '<p>Innerhalb <strong><em>dieses</em></strong> Elements <code>var x = 1;</code> kann <strong>man</strong> dann</p>',
      )
      const result = prepareAndConvertHtmlToMarkdown(html, UDEMY_SELECTORS)

      if (result.status === 'ERROR') throw new Error(result.message)
      expect(result.course.notes[0].content).toContain(
        'Innerhalb ***dieses*** Elements `var x = 1;` kann **man** dann',
      )
    })

    it('sollte Überschriften (H1-H6) korrekt in Markdown übersetzen', () => {
      const html = createMockHtml(
        '<h1>Titel</h1><p>Test</p><h3>Untertitel</h3>',
      )
      const result = prepareAndConvertHtmlToMarkdown(html, UDEMY_SELECTORS)

      if (result.status === 'ERROR') throw new Error(result.message)
      const content = result.course.notes[0].content

      expect(content).toContain('# Titel')
      expect(content).toContain('### Untertitel')
    })

    it('sollte Blockquotes richtig einrücken', () => {
      const html = createMockHtml(
        '<blockquote><p>Erste Zeile</p><p>Zweite Zeile</p></blockquote>',
      )
      const result = prepareAndConvertHtmlToMarkdown(html, UDEMY_SELECTORS)

      if (result.status === 'ERROR') throw new Error(result.message)
      const content = result.course.notes[0].content

      expect(content).toContain('> Erste Zeile\n>\n> Zweite Zeile')
    })

    it('sollte Unordered (UL) und Ordered (OL) Listen verarbeiten können', () => {
      const html = createMockHtml(`
        <ul>
          <li>Punkt A</li>
          <li>Punkt B mit <strong>Bold</strong></li>
        </ul>
        <ol>
          <li>Nummer 1</li>
          <li>Nummer 2</li>
        </ol>
      `)
      const result = prepareAndConvertHtmlToMarkdown(html, UDEMY_SELECTORS)

      if (result.status === 'ERROR') throw new Error(result.message)
      const content = result.course.notes[0].content

      expect(content).toContain('* Punkt A\n* Punkt B mit **Bold**')
      expect(content).toContain('1. Nummer 1\n2. Nummer 2')
    })

    it('sollte Zeilenumbrüche richtig rendern', () => {
      const html = createMockHtml('<p>Test<br>mit<br>Umbrüchen</p>')
      const result = prepareAndConvertHtmlToMarkdown(html, UDEMY_SELECTORS)

      if (result.status === 'ERROR') throw new Error(result.message)
      expect(result.course.notes[0].content).toContain(
        `Test  \nmit  \nUmbrüchen`,
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
      expect(result.course.notes[0].content).toContain(
        '```\nconso-log("Hello World")\n```',
      )
    })

    it('sollte native HTML Code-Blöcke (PRE) parsen', () => {
      const html = createMockHtml(
        '<pre><code>function test() {\n  return true;\n}</code></pre>',
      )
      const result = prepareAndConvertHtmlToMarkdown(html, UDEMY_SELECTORS)

      if (result.status === 'ERROR') throw new Error(result.message)
      expect(result.course.notes[0].content).toContain(
        '```\nfunction test() {\n  return true;\n}\n```',
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
      expect(result.course.notes[0].content).toContain(
        'if (a > b) { return "<div>"; }',
      )
    })

    it('sollte Einrückungen in mehrzeiligen Udemy-Codeblöcken exakt erhalten', () => {
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
