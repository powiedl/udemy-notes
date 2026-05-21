import { describe, it, expect, vi, beforeEach } from 'vitest'
import { suggestTagsWithAIBatch } from '#/lib/ai.lib.server'
import type { BuildBatchTaggingPromptInput } from '#/lib/ai.lib.server'
import { ServerActionError } from '#/types/errors.type'
import { prisma } from '#/lib/db.lib.server'

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

// Wir mocken Prisma für das Telemetrie-Logging
vi.mock('#/lib/db.server', () => ({
  prisma: {
    aiUsageLog: {
      create: vi.fn().mockResolvedValue({ id: 'log-1' }),
    },
  },
}))

// -----------------------------------------------------------------------------
// 2. DIE TESTS
// -----------------------------------------------------------------------------

describe('Integration: suggestTagsWithAIBatch', () => {
  const userId = 'user-123'

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

    const result = await suggestTagsWithAIBatch(input, userId)

    expect(result).toEqual([])
    expect(mockOpenRouterSend).not.toHaveBeenCalled()
    expect(prisma.aiUsageLog.create).not.toHaveBeenCalled() // Kein Log bei Short-Circuit
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
    // Angereichert mit den exakten Telemetrie-Metadaten deines angepassten Codes
    mockOpenRouterSend.mockResolvedValue({
      model: 'poolside/laguna-m.1',
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        completionTokensDetails: { reasoning: 10 },
      },
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

    const result = await suggestTagsWithAIBatch(input, userId)

    expect(mockOpenRouterSend).toHaveBeenCalledOnce()
    // Wenn wir hier ankommen, hat unser Auto-Wrapper funktioniert und Zod ausgetrickst!
    expect(result).toHaveLength(1)
    expect(result[0].tags.length).toBe(5)

    // Prüfen, ob das ERFOLGS-Log mit korrekten Telemetrie-Daten geschrieben wurde
    expect(prisma.aiUsageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isSuccess: true,
          modelName: 'poolside/laguna-m.1',
          promptTokens: 100,
          completionTokens: 50,
          userId: 'user-123',
        }),
      }),
    )

    const createCallArgs = vi.mocked(prisma.aiUsageLog.create).mock
      .calls[0]?.[0]
    expect(createCallArgs).toBeDefined()
    expect(createCallArgs.data.metadata).toBeTypeOf('string')
    const parsedMetadata = JSON.parse(createCallArgs.data.metadata as string)

    // Jetzt prüfen wir das Objekt unabhängig von der Reihenfolge
    expect(parsedMetadata).toMatchObject({
      completionTokenDetails: { reasoning: 10 },
      systemInstructionLength: expect.any(Number),
      userContentLength: expect.any(Number),
    })
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
      model: 'openrouter/free',
      usage: {
        promptTokens: 50,
        completionTokens: 10,
      },
      choices: [{ message: { content: dirtyAiResponse } }],
    })

    const result = await suggestTagsWithAIBatch(input, userId)

    expect(result).toHaveLength(1)
    const tags = result[0].tags

    expect(tags.length).toBeGreaterThan(0)
    expect(tags[0].name).toBe('neu')
    expect(tags[0].isNew).toBe(true)

    // Check, dass das Log geschrieben wurde
    expect(prisma.aiUsageLog.create).toHaveBeenCalled()
  })

  it('4. Error Handling: Wirft einen sauberen ServerActionError bei 429', async () => {
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

    const rateLimitError: any = new Error('Rate Limited')
    rateLimitError.statusCode = 429
    mockOpenRouterSend.mockRejectedValue(rateLimitError)

    // Wir erwarten den Rate-Limit Fehler
    await expect(suggestTagsWithAIBatch(input, userId)).rejects.toThrow(
      ServerActionError,
    )

    // Prüfen, ob das FEHLER-Log geschrieben wurde
    expect(prisma.aiUsageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isSuccess: false,
          errorCode: 429,
          errorMessage: expect.stringContaining('Rate Limited'),
          userId: 'user-123',
        }),
      }),
    )
  })
})
