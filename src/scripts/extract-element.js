import fs from 'node:fs/promises'
import * as cheerio from 'cheerio'

// Konfiguration
const TEMPLATE =
  '<!DOCTYPE html><html><head><title>__TITLE__</title>__META__</head><body><p>__TIMESTAMP__</p>__NOTES__<p>Skript</p>__SCRIPT__</body></html>'
const INPUT_FILE = '../html-testfiles/html-css-course-min-new-format.html' // Name der eingelesenen Datei
const BLOCK_SELECTOR = '#content-drawer-notes' // Der CSS-Selektor (z.B. .klasse, #id, tag)
const SECTION_SELECTOR =
  '.section-group-module-scss-module__CmJ1TG__section-group__title'
const LECTURE_SELECTOR =
  '.curriculum-item-group-module-scss-module__fu8uYW__curriculum-item-group__header'
const NOTE_SELECTOR = '.note-card-module-scss-module__PRvuDG__note-card'
const TIMESTAMP_SELECTOR =
  '.timestamp-badge-module-scss-module__2naWnq__timestamp-badge'
const OUTPUT_FILE =
  '../html-testfiles/parsed-html-css-course-min-new-format.html' // Name der Ausgabedatei

async function extractElement() {
  try {
    // 1. Datei einlesen
    const htmlContent = await fs.readFile(INPUT_FILE, 'utf-8')

    // 2. HTML parsen
    const $ = cheerio.load(htmlContent)

    // 3. Element selektieren
    const element = $(BLOCK_SELECTOR)

    if (element.length === 0) {
      console.error(
        `Fehler: Kein Element mit dem Selektor "${BLOCK_SELECTOR}" gefunden.`,
      )
      return
    }

    // --- Konsolenausgabe der Struktur ---
    const $block = $(BLOCK_SELECTOR)
    const $sections = $block.find(SECTION_SELECTOR)

    $sections.each((_, sectionEl) => {
      const sectionText = $(sectionEl).text().trim().replace(/\s+/g, ' ')
      const $sectionContainer = $(sectionEl).closest('section')

      // Filter für Sektionen (Nur Abschnitt 7 und 20 behalten)
      const isSection7 =
        sectionText.includes('Abschnitt 7') || sectionText.includes('Section 7')
      const isSection20 =
        sectionText.includes('Abschnitt 20') ||
        sectionText.includes('Section 20')

      if (!isSection7 && !isSection20) {
        $sectionContainer.remove()
        return
      }

      console.log(`SECTION (${sectionText})`)
      const $lectures = $sectionContainer.find(LECTURE_SELECTOR)

      $lectures.each((_, lectureEl) => {
        const lectureText = $(lectureEl).text().trim().replace(/\s+/g, ' ')
        // Wir suchen den spezifischen Container der Lecture (die Klasse ohne das Suffix __header)
        const $lectureContainer = $(lectureEl).closest(
          '.curriculum-item-group-module-scss-module__fu8uYW__curriculum-item-group',
        )

        // Filter für Lektionen in Abschnitt 20
        if (isSection20) {
          const is171 = lectureText.includes('171')
          const is173 = lectureText.includes('173')
          if (!is171 && !is173) {
            $lectureContainer.remove()
            return
          }
        }

        console.log(`  LECTURE (${lectureText})`)
        const $notes = $lectureContainer.find(NOTE_SELECTOR)

        $notes.each((_, noteEl) => {
          const noteId = $(noteEl).attr('data-note-id')
          const noteTimestamp = $(noteEl).find(TIMESTAMP_SELECTOR).text().trim()
          console.log(`    NOTE (${noteId}) [${noteTimestamp}]`)

          // Füge den Zeitstempel in das HTML der Notiz ein
          if (noteTimestamp) {
            $(noteEl).append(
              `<div class="udemy-notes-timestamp">${noteTimestamp}</div>`,
            )
          }
        })
      })
    })

    // 4. Daten für das Template extrahieren
    const title = $('head title').text() || ''
    const metas = $('head meta')
      .map((_, el) => $.html(el))
      .get()
      .join('\n')

    // 4.5 Unerwünschte Elemente (Footer der Notizen) entfernen
    element.find('div[class*="__note-card__footer"]').remove()
    element.find('div[class$="__notes-filter-controls"]').remove()
    element.find('button').remove()
    element.find('div[class$="__notes-drawer__create-overlay"]').remove()

    const result = element.html()

    // Suche nach dem spezifischen Next.js State Script-Tag
    let foundScript = ''
    $('script').each((_, el) => {
      const $el = $(el)
      const scriptContent = $el.text()

      // Wir suchen nach dem Skript, das alle spezifischen Udemy/Next.js Zustandsdaten enthält
      if (
        scriptContent.includes('initialState') &&
        scriptContent.includes('contentPlayerPageStore') &&
        scriptContent.includes('courseStore') &&
        scriptContent.includes('self.__next_f.push') &&
        !$el.attr('src') // Nur Inline-Skripte prüfen
      ) {
        foundScript = $.html(el)
        return false // Suche beenden
      }
    })

    // 5. HTML-Dokument zusammenbauen
    const timestamp = new Date().toLocaleString('de-DE')
    const finalHtml = TEMPLATE.replace('__TITLE__', title)
      .replace('__META__', metas)
      .replace('__NOTES__', result)
      .replace('__TIMESTAMP__', timestamp)
      .replace('__SCRIPT__', foundScript)

    // 6. In Datei schreiben
    await fs.writeFile(OUTPUT_FILE, finalHtml, 'utf-8')
  } catch (error) {
    console.error(`Ein Fehler ist aufgetreten: ${error.message}`)
  }
}

// Programm starten
extractElement()
