import { describe, it, expect, vi, beforeEach } from 'vitest'
import { suggestTagsWithAIBatch } from '#/lib/ai.server'
import type { BuildBatchTaggingPromptInput } from '#/lib/ai.server'
import { ServerActionError } from '#/types/errors'

// -----------------------------------------------------------------------------
// 1. MOCKS EINRICHTEN
// -----------------------------------------------------------------------------

const { mockOpenRouterSend } = vi.hoisted(() => {
  return { mockOpenRouterSend: vi.fn() }
})

// Wir mocken JETZT die ausgelagerte Datei!
// Dadurch verwendet suggestTagsWithAIBatch garantiert unseren Mock.
vi.mock('#/lib/openrouter-client.server', () => ({
  openrouter: {
    chat: { send: mockOpenRouterSend },
  },
}))

// -----------------------------------------------------------------------------
// 2. DIE TESTS
// -----------------------------------------------------------------------------

describe('Integration: suggestTagsWithAIBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1. Short-Circuit: Macht keinen API-Call, wenn die Allowance 0 ist (Geldspar-Test)', async () => {
    // Leeres Array -> Keine Allowance -> Kein API Call
    const input: any = {
      entities: [],
      globalTags: [],
      privateUserTags: [],
    }

    const result = await suggestTagsWithAIBatch(input)

    expect(result).toEqual([])
    expect(mockOpenRouterSend).not.toHaveBeenCalled()
  })

  it('2. Truncation & Auto-Wrap: Repariert nackte Arrays und kappt auf Allowance ab', async () => {
    const input: BuildBatchTaggingPromptInput = {
      entities: [
        {
          entityId: 'note-1',
          entityType: 'note',
          contentPayload: { content: 'Test Note' },
          existingTags: [],
          maxTotalTags: 5,
        },
      ],
      globalTags: [],
      privateUserTags: [],
    }

    // BÖSE KI: Schickt direkt ein Array [ ... ] OHNE das "results" Objekt!
    mockOpenRouterSend.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                entityId: 'note-1',
                tags: Array.from({ length: 10 }).map((_, i) => ({
                  name: `tag-${i}`,
                  isNew: true,
                  relevanceScore: 90 - i,
                })),
              },
            ]), // <-- Direktes Array!
          },
        },
      ],
    })

    const result = await suggestTagsWithAIBatch(input)

    expect(mockOpenRouterSend).toHaveBeenCalledOnce()
    // Wenn wir hier ankommen, hat unser Auto-Wrapper funktioniert und Zod ausgetrickst!
    expect(result).toHaveLength(1)
    expect(result[0].tags.length).toBe(5)
  })

  it('3. Full Pipeline: Verarbeitet Markdown-Quatsch, korrigiert isNew und sortiert', async () => {
    const input: BuildBatchTaggingPromptInput = {
      entities: [
        {
          entityId: 'note-1',
          entityType: 'note',
          contentPayload: { content: 'Test Note' },
          existingTags: [],
          maxTotalTags: 5,
        },
      ],
      globalTags: ['react'],
      privateUserTags: [],
    }

    // BRAVE KI: Nutzt Markdown, aber schickt das korrekte { "results": [...] } Format
    const dirtyAiResponse = `
      Hier sind deine Tags!
      \`\`\`json
      {
        "results": [
          {
            "entityId": "note-1",
            "tags": [
              { "name": "REACT", "isNew": true, "relevanceScore": 85 },
              { "name": "react", "isNew": true, "relevanceScore": 60 },
              { "name": "neu", "isNew": true, "relevanceScore": 99 }
            ]
          }
        ]
      }
      \`\`\`
    `

    mockOpenRouterSend.mockResolvedValue({
      choices: [{ message: { content: dirtyAiResponse } }],
    })

    const result = await suggestTagsWithAIBatch(input)

    expect(result).toHaveLength(1)
    const tags = result[0].tags

    expect(tags.length).toBeGreaterThan(0)
    expect(tags[0].name).toBe('neu')
    expect(tags[0].isNew).toBe(true)
  })

  it('4. Error Handling: Wirft einen sauberen ServerActionError bei 429', async () => {
    const input: BuildBatchTaggingPromptInput = {
      entities: [
        {
          entityId: 'note-1',
          entityType: 'note',
          contentPayload: { content: 'Test Note' },
          existingTags: [], // <-- Gefixt!
          maxTotalTags: 5, // <-- Gefixt!
        },
      ],
      globalTags: [],
      privateUserTags: [],
    }

    const rateLimitError: any = new Error('Rate Limited')
    rateLimitError.statusCode = 429
    mockOpenRouterSend.mockRejectedValue(rateLimitError)

    await expect(suggestTagsWithAIBatch(input)).rejects.toThrow(
      ServerActionError,
    )
    await expect(suggestTagsWithAIBatch(input)).rejects.toThrow(/Rate-Limit/)
  })
})
