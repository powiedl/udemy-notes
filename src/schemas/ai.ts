import z from 'zod'

// Die Antwort der KI für eine Tagzuweisung (ein bestimmtes Tag auf eine bestimmte Entity)
export const aiTagSuggestionSchema = z.object({
  name: z.string(),
  isNew: z.boolean(),
  relevanceScore: z.number().min(0).max(100),
})

// Das Ergebnis der AI pro übergebener Entität (enthält also mehrere aiTagSuggestion)
export const aiEntityTagResponseSchema = z.object({
  entityId: z.string(),
  tags: z.array(aiTagSuggestionSchema),
})

// Die finale Antwort der KI ist ein Array dieser Ergebnisse - enthält mehrere aiTagEntityTagResponse
export const aiBatchTagResponseSchema = z.object({
  results: z.array(aiEntityTagResponseSchema),
})

export type AITagSuggestion = z.infer<typeof aiTagSuggestionSchema>
export type AIEntityTagResponse = z.infer<typeof aiEntityTagResponseSchema>
export type AIBatchTagResponse = z.infer<typeof aiBatchTagResponseSchema>
