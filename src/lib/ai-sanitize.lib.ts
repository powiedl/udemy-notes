import type { AITagSuggestion } from '#/schemas/ai.schema'

export function sanitizeAITags(
  aiTags: AITagSuggestion[],
  globalTags: string[],
  privateTags: string[],
  minRelevance = 70,
  maxTags = 5,
) {
  // 1. Alle existierenden Tags für schnellen Lookup normalisieren (Kleinschreibung)
  const allExisting = new Set(
    [...globalTags, ...privateTags].map((t) => t.toLowerCase()),
  )

  // 2. Filtern & Normalisieren
  const seenInResponse = new Set<string>()

  const sanitized = aiTags
    .filter((tag) => tag.relevanceScore >= minRelevance) // Schwache Tags kicken
    .map((tag) => {
      const rawName = tag.name ? String(tag.name) : ''
      const normalizedName = rawName.toLowerCase().trim()
      return {
        ...tag,
        name: normalizedName, // optional: originalnamen behalten, wenn CamelCase gewollt ist
        // HIER ist der Magic-Fix für die KI-Lüge:
        isNew: allExisting.has(normalizedName) ? false : tag.isNew,
      }
    })
    .filter((tag) => {
      // Duplikate innerhalb der selben KI-Antwort kicken
      if (seenInResponse.has(tag.name)) return false
      seenInResponse.add(tag.name)
      return true
    })

  // 3. Sortieren und Abschneiden
  return sanitized
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxTags)
}
