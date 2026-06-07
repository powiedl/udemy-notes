import { describe, it, expect } from 'vitest'
import {
  extractJsonFromNextJsScript,
  prepareLegacyHtmlPayload,
  prepareBetaHtmlPayload,
} from '#/lib/import-helpers.lib'
import type { ImportValues } from '#/lib/import-helpers.lib'
import type { UdemySelectors } from '#/types/api.type'

describe('import-helpers.lib.ts', () => {
  // --- Mocks & Dummies ---
  const dummyFile = new File([''], 'test-import.html', { type: 'text/html' })
  const dummyValues: ImportValues = {
    trainers: ['Test Trainer'],
    tagIds: ['tag-1'],
    newPrivateTags: ['priv-1'],
  }
  const dummySelectors: UdemySelectors = {
    notesContainerSelector: '#legacy-notes-container',
    trainerUrlSelector: 'meta[name="trainer-url"]',
    // ... andere Selektoren werden für diesen isolierten Test nicht zwingend benötigt
  } as UdemySelectors

  describe('extractJsonFromNextJsScript', () => {
    it('sollte korrektes JSON aus einem Next.js String extrahieren', () => {
      const scriptContent = `self.__next_f.push([1, '{"initialState":{"test":"data", "nested":{"id": 1}}}'])`
      const result = extractJsonFromNextJsScript(scriptContent, 'initialState')

      expect(result).not.toBeNull()
      expect(result.initialState.test).toBe('data')
      expect(result.initialState.nested.id).toBe(1)
    })

    it('sollte mit maskierten Anführungszeichen (escaped quotes) umgehen können', () => {
      const scriptContent = `some_prefix_text {"initialState":{"text":"He said \\"Hello\\" today"}} suffix_text`
      const result = extractJsonFromNextJsScript(scriptContent, 'initialState')

      expect(result).not.toBeNull()
      expect(result.initialState.text).toBe('He said "Hello" today')
    })

    it('sollte null zurückgeben, wenn der Suchschlüssel nicht existiert', () => {
      const scriptContent = `{"wrongKey":{"test":"data"}}`
      const result = extractJsonFromNextJsScript(scriptContent, 'initialState')
      expect(result).toBeNull()
    })

    it('sollte null zurückgeben, wenn das JSON fehlerhaft/unvollständig ist', () => {
      // Eine schließende Klammer fehlt
      const scriptContent = `{"initialState":{"test":"data"`
      const result = extractJsonFromNextJsScript(scriptContent, 'initialState')
      expect(result).toBeNull()
    })
    it('sollte auch maskiertes JSON (escaped strings) aus Next.js korrekt verarbeiten', () => {
      // Dies ist exakt der Fall aus dem "Modern Javascript Bootcamp" mit Colt Steele & Stephen Grider
      // eslint-disable-next-line no-useless-escape
      const scriptContent = `self.__next_f.push([1,"15:[\\\"$\\\",\\\"$L2f\\\",null,{\\\"initialState\\\":{\\\"contentPlayerPageStore\\\":{\\\"courseStore\\\":{\\\"course\\\":{\\\"id\\\":\\\"2634490\\\",\\\"title\\\":\\\"The Modern Javascript Bootcamp Course\\\",\\\"instructors\\\":[{\\\"name\\\":\\\"Colt Steele\\\"},{\\\"name\\\":\\\"Stephen Grider\\\"}]}}}}}]\\n"])`

      const result = extractJsonFromNextJsScript(scriptContent, 'initialState')

      expect(result).not.toBeNull()

      const course =
        result.initialState.contentPlayerPageStore.courseStore.course
      expect(course.id).toBe('2634490')
      expect(course.title).toBe('The Modern Javascript Bootcamp Course')
      expect(course.instructors).toHaveLength(2)
      expect(course.instructors[0].name).toBe('Colt Steele')
      expect(course.instructors[1].name).toBe('Stephen Grider')
    })
  })

  describe('prepareLegacyHtmlPayload', () => {
    it('sollte das alte HTML-Format korrekt verarbeiten und Metadaten erhalten', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Legacy Course</title>
            <meta name="trainer-url" content="https://udemy.com/user/legacy" />
            <meta name="description" content="Test description" />
          </head>
          <body>
            <div id="legacy-notes-container">
              <div class="note">Meine alte Notiz</div>
            </div>
          </body>
        </html>
      `
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const notesContainer = doc.querySelector('#legacy-notes-container')!

      const payload = prepareLegacyHtmlPayload(
        doc,
        dummyFile,
        dummyValues,
        dummySelectors,
        notesContainer,
      )

      expect(payload.fileName).toBe('test-import.html')
      expect(payload.parsedTrainerUrl).toBe('https://udemy.com/user/legacy')
      expect(payload.loggingMetadata?.feature).toBe('legacy')
      expect(payload.courseMetadata).toBeUndefined() // Bei Legacy gibt es das nicht

      // Prüfen ob Container extrahiert wurde
      expect(payload.content).toContain('<div id="legacy-notes-container">')
      expect(payload.content).toContain(
        '<div class="note">Meine alte Notiz</div>',
      )
      // Prüfen ob Meta-Tags im extrahierten HTML überlebt haben
      expect(payload.content).toContain(
        '<meta name="description" content="Test description">',
      )
    })
  })

  describe('prepareBetaHtmlPayload', () => {
    const createBetaHtml = (scriptContent: string = '') => `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Beta Course</title>
          <meta name="description" content="Beta description" />
        </head>
        <body>
          <div class="notes-drawer-module-scss-module__M_NRBW__notes-drawer">
            <div class="valid-note">Das ist eine wichtige Notiz</div>
            <div class="test__note-card__footer">Löschen 1</div>
            <div class="test__notes-filter-controls">Löschen 2</div>
            <button>Neu</button>
          </div>
          <script>${scriptContent}</script>
        </body>
      </html>
    `

    it('sollte Müll-Elemente entfernen und die Metadaten korrekt extrahieren', () => {
      const scriptData = `self.__next_f.push('{"initialState":{"contentPlayerPageStore":{"courseStore":{"course":{"id":"12345","title":"The HTML Bootcamp","instructors":[{"name":"Colt Steele","url":"/user/colt"}]}}}}}')`
      const doc = new DOMParser().parseFromString(
        createBetaHtml(scriptData),
        'text/html',
      )
      const notesContainer = doc.querySelector(
        '.notes-drawer-module-scss-module__M_NRBW__notes-drawer',
      )!

      const payload = prepareBetaHtmlPayload(
        doc,
        dummyFile,
        dummyValues,
        notesContainer,
      )

      // 1. Müll-Entfernung prüfen
      expect(payload.content).toContain('Das ist eine wichtige Notiz')
      expect(payload.content).not.toContain('Löschen 1')
      expect(payload.content).not.toContain('Löschen 2')
      expect(payload.content).not.toContain('<button>')

      // 2. Extrahierte Metadaten prüfen
      expect(payload.courseMetadata).toBeDefined()
      expect(payload.courseMetadata?.udemyCourseId).toBe('12345')
      expect(payload.courseMetadata?.courseTitle).toBe('The HTML Bootcamp')
      expect(payload.courseMetadata?.instructors?.[0].name).toBe('Colt Steele')
      expect(payload.courseMetadata?.instructors?.[0].url).toBe('/user/colt')

      // Fallback-URL für Legacy-Kompatibilität sollte auf den ersten Trainer zeigen
      expect(payload.parsedTrainerUrl).toBe('/user/colt')

      // 3. Format prüfen
      expect(payload.loggingMetadata?.feature).toBe('beta')
    })

    it('sollte ohne Absturz funktionieren, wenn keine verwertbaren Metadaten im Skript sind', () => {
      const scriptData = `console.log("No useful data here");`
      const doc = new DOMParser().parseFromString(
        createBetaHtml(scriptData),
        'text/html',
      )
      const notesContainer = doc.querySelector(
        '.notes-drawer-module-scss-module__M_NRBW__notes-drawer',
      )!

      const payload = prepareBetaHtmlPayload(
        doc,
        dummyFile,
        dummyValues,
        notesContainer,
      )

      // courseMetadata sollte ein leeres Objekt sein oder nicht die gesuchten Felder haben
      expect(payload.courseMetadata).toBeDefined()
      expect(payload.courseMetadata?.udemyCourseId).toBeUndefined()
      expect(payload.parsedTrainerUrl).toBeUndefined()

      // Trotzdem muss das HTML bereinigt und zurückgegeben werden
      expect(payload.content).toContain('Das ist eine wichtige Notiz')
      expect(payload.content).not.toContain('<button>')
    })
  })
})
