import { describe, it, expect } from 'vitest'
// Passe diese Imports an deine tatsächlichen Funktionen an
import { sanitizeAITags } from '#/lib/ai-sanitize.lib' // Die Funktion, die wir testen

describe('AI Tag Sanitization & Validation', () => {
  // Mock-Datenbank-Status, den wir der Funktion übergeben
  const existingGlobalTags = ['javascript', 'react', 'nodejs']
  const existingPrivateTags = ['my-project', 'wip']
  const MAX_TAGS_PER_ENTITY = 5
  const MIN_RELEVANCE_SCORE = 70

  it('1. Happy Path: Akzeptiert gültige Tags und filtert irrelevante heraus', () => {
    const mockAiResponse = [
      { name: 'javascript', isNew: false, relevanceScore: 95 },
      { name: 'frontend', isNew: true, relevanceScore: 85 },
      { name: 'random-stuff', isNew: true, relevanceScore: 40 }, // Sollte fliegen (< 70)
    ]

    const result = sanitizeAITags(
      mockAiResponse,
      existingGlobalTags,
      existingPrivateTags,
      MIN_RELEVANCE_SCORE,
    )

    expect(result).toHaveLength(2)
    expect(result.map((t) => t.name)).not.toContain('random-stuff')
  })

  it('2. Übermütige KI: Kappt das Array auf das erlaubte Maximum ab', () => {
    // KI liefert 8 extrem relevante Tags, wir wollen aber max 5
    const mockAiResponse = Array.from({ length: 8 }).map((_, i) => ({
      name: `tag-${i}`,
      isNew: true,
      relevanceScore: 90,
    }))

    const result = sanitizeAITags(
      mockAiResponse,
      existingGlobalTags,
      existingPrivateTags,
    )

    expect(result).toHaveLength(MAX_TAGS_PER_ENTITY)
  })

  it('3. Halluzinierte Neuheit: Korrigiert "isNew: true" bei bereits existierenden Tags', () => {
    const mockAiResponse = [
      // KI behauptet, 'react' sei neu, obwohl es in unseren globalen Tags existiert
      { name: 'react', isNew: true, relevanceScore: 99 },
      // KI behauptet, 'wip' sei neu, obwohl es privat existiert
      { name: 'WIP', isNew: true, relevanceScore: 80 }, // Groß-/Kleinschreibung ignorieren!
    ]

    const result = sanitizeAITags(
      mockAiResponse,
      existingGlobalTags,
      existingPrivateTags,
    )

    expect(result[0].name).toBe('react')
    expect(result[0].isNew).toBe(false) // Muss vom Backend zwingend korrigiert werden

    expect(result[1].name.toLowerCase()).toBe('wip')
    expect(result[1].isNew).toBe(false)
  })

  it('4. Duplikat-Schleuder: Entfernt doppelte Tags innerhalb der KI-Antwort', () => {
    const mockAiResponse = [
      { name: 'testing', isNew: true, relevanceScore: 90 },
      { name: 'Testing', isNew: true, relevanceScore: 85 }, // KI liefert es zweimal
    ]

    const result = sanitizeAITags(
      mockAiResponse,
      existingGlobalTags,
      existingPrivateTags,
    )

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('testing')
  })

  it('5. Sortierungs-Garantie: Gibt die Tags strikt nach Relevanz sortiert zurück', () => {
    const mockAiResponse = [
      { name: 'low', isNew: true, relevanceScore: 75 },
      { name: 'high', isNew: true, relevanceScore: 99 },
      { name: 'mid', isNew: true, relevanceScore: 85 },
    ]

    const result = sanitizeAITags(
      mockAiResponse,
      existingGlobalTags,
      existingPrivateTags,
    )

    expect(result[0].name).toBe('high')
    expect(result[1].name).toBe('mid')
    expect(result[2].name).toBe('low')
  })
})
