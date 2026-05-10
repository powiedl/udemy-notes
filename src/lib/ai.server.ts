// src/lib/ai.server.ts
import { ServerActionError } from '#/types/errors'
import type { ChatResult } from '@openrouter/sdk/models'
import { sanitizeAITags } from './ai-sanitize'
import { openrouter } from './openrouter-client.server'
import { aiBatchTagResponseSchema } from '#/schemas/ai'
import type { AIEntityTagResponse } from '#/schemas/ai'
import { getNodeEnv } from './utils'
import { prisma } from './db.server'
// import type { AITagSuggestion } from '#/schemas/ai'

// --- 1. Zod Schemas für garantierte Typsicherheit ---
const debugJSON =
  '{"results":[{"entityId":"decc8394-cd67-4e3e-8fe7-545effaac5dc","tags":[{"name":"html","isNew":false,"relevanceScore":100},{"name":"css","isNew":false,"relevanceScore":100},{"name":"javascript","isNew":false,"relevanceScore":100},{"name":"web-development","isNew":true,"relevanceScore":90},{"name":"project-based-learning","isNew":true,"relevanceScore":85}]},{"entityId":"0878d4d4-6dbc-4f5b-b65a-a97021b01048","tags":[{"name":"html","isNew":false,"relevanceScore":95}]},{"entityId":"a082da4a-0b34-4b21-a85a-0af3f657011a","tags":[{"name":"html","isNew":false,"relevanceScore":95}]},{"entityId":"327ddac2-dbe7-4541-bae5-c31e1c2b1fca","tags":[]},{"entityId":"ba3cb1bb-ede8-4289-bf32-5b369d0e28ec","tags":[{"name":"github-gist","isNew":true,"relevanceScore":90}]},{"entityId":"9a9b2f82-4ba9-4d47-a832-0db0be14064c","tags":[{"name":"css","isNew":false,"relevanceScore":100},{"name":"typography","isNew":true,"relevanceScore":85},{"name":"web-design","isNew":true,"relevanceScore":80}]},{"entityId":"47f9e1c5-385b-46dd-a973-ed92268812b3","tags":[{"name":"html","isNew":false,"relevanceScore":95}]},{"entityId":"36f637a1-2852-42c7-94c4-7f4b6262f364","tags":[{"name":"css","isNew":false,"relevanceScore":100},{"name":"scrollbar-styling","isNew":true,"relevanceScore":95}]}]}'
const debugCourseId = 'decc8394-cd67-4e3e-8fe7-545effaac5dc'

// --- 2. Interfaces für den Input ---

export type TaggingEntityInput = {
  entityId: string
  entityType: 'course' | 'note'
  contentPayload: Record<string, unknown>
  existingTags: string[]
  maxTotalTags: number
}

export type BuildBatchTaggingPromptInput = {
  entities: TaggingEntityInput[]
  globalTags: string[]
  privateUserTags: string[]
}

// --- 3. Die reine, testbare Helper-Funktion ---

export function buildBatchTaggingPrompt(input: BuildBatchTaggingPromptInput) {
  // Wir berechnen das exakte Allowance (Erlaubnis) für jede Entität,
  // um es der KI mitzugeben und später abzuschneiden.
  const entitiesWithAllowance = input.entities.map((entity) => ({
    ...entity,
    allowedNewSuggestions: Math.max(
      0,
      entity.maxTotalTags - entity.existingTags.length,
    ),
  }))

  const systemInstruction = `
You are a highly precise AI assistant specialized in categorizing and tagging educational notes and courses.
Your task is to analyze the provided entities (courses or notes) and assign the most appropriate tags to them.

IMPORTANT RULES:
1. Analyze the content deeply. 
2. TAG PRIORITY (Crucial): You must select tags following this exact priority hierarchy:
   - Priority 1: Use existing tags from the provided "privateUserTags" list.
   - Priority 2: Use existing tags from the provided "globalTags" list.
   - Priority 3: Invent new tags (isNew: true) ONLY if no existing private or global tag captures the core essence of the content.
   If you select a tag from Priority 1 or 2, set "isNew" to false.
3. RELEVANCE EVALUATION (relevanceScore): 
   - You MUST assign a "relevanceScore" from 0 to 100 to every tag.
   - 90-100: Essential core topic (the content cannot be understood without this tag).
   - 70-89: Important secondary topic, covered extensively in the text.
   - < 70: Minor or passing mention (OMIT these tags entirely).
4. Return a maximum of \`allowedNewSuggestions\` tags per entity. Sort the tags array within each entity in descending order based on the \`relevanceScore\` (highest score first).
5. OPTIMIZE FOR SPEED: Return the JSON completely minified. Do NOT include any spaces, line breaks, or indentation outside of string values.

RESPOND EXCLUSIVELY IN COMPACT JSON FORMAT. Example:
{"results":[{"entityId":"uuid-of-the-entity","tags":[{"name":"javascript","isNew":false,"relevanceScore":95},{"name":"new-framework","isNew":true,"relevanceScore":82}]}]}
`

  // Wir bauen den Payload für die KI so auf, dass sie alle Limits und Inhalte kennt
  const userContent = JSON.stringify(
    {
      context: {
        globalTagsAvailable: input.globalTags,
        privateUserTagsAvailable: input.privateUserTags,
      },
      entitiesToAnalyze: entitiesWithAllowance.map((e) => ({
        entityId: e.entityId,
        type: e.entityType,
        content: e.contentPayload,
        alreadyExistingTags: e.existingTags,
        maxNewTagsAllowed: e.allowedNewSuggestions,
      })),
    },
    null,
    2,
  )

  return { systemInstruction, userContent, entitiesWithAllowance }
}

// --- 4. Der eigentliche API-Aufruf ---

// models: [
//   'inclusionai/ring-2.6-1t:free', // Context: 262K
//   'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', // Context: 256K (sehr schnell)
//   'minimax/minimax-m2.5:free', // Context: 197K
//   'openai/gpt-oss-20b', // context: 131K
//   'baidu/cobuddy:free', // context: 131K
//   'poolside/laguna-m.1:free', // context: 131K
//   'baidu/qianfan-ocr-fast:free', // Context: 66K
//   'qwen/qwen-2.5-72b-instruct:free',
//   'meta-llama/llama-3.3-70b-instruct:free', // Context: 66K
//   'mistralai/mistral-nemo:free',
// ],
export async function suggestTagsWithAIBatch(
  input: BuildBatchTaggingPromptInput,
  userId?: string, // <-- NEU: Optionaler Parameter, um den User im Log zu speichern
): Promise<AIEntityTagResponse[]> {
  const { systemInstruction, userContent, entitiesWithAllowance } =
    buildBatchTaggingPrompt(input)
  const systemInstructionLength = systemInstruction.length
  const userContentLength = userContent.length

  const course = input.entities.find((e) => e.entityType === 'course')
  const courseId = course?.entityId || undefined
  const entityCount = entitiesWithAllowance.length

  // Falls es gar keine Entitäten gibt, die noch Tags vertragen, direkt abbrechen
  if (entitiesWithAllowance.every((e) => e.allowedNewSuggestions <= 0)) {
    return []
  }

  let response: ChatResult

  // --- TELEMETRIE STATE ---
  const startTime = performance.now()
  const requestedModel = 'openrouter/free'
  let actualModel = requestedModel
  let promptTokens: number | null = null
  let completionTokens: number | null = null
  let metadata = JSON.stringify({
    systemInstructionLength,
    userContentLength,
  })

  try {
    // wenn das Promise von openrouter.chat.send rejected, wird ein Fehler geworfen und wir landen sofort im catch von dem try Block
    response = await openrouter.chat.send({
      chatRequest: {
        model: requestedModel,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userContent },
        ],
      },
    })

    const durationMs = Math.round(performance.now() - startTime)

    // Telemetrie-Daten auslesen (OpenRouter packt diese oft in response.usage)
    // Wenn das 'free' Modell umleitet, steht das echte Modell in response.model
    actualModel = response.model || requestedModel
    promptTokens = response.usage?.promptTokens || null
    completionTokens = response.usage?.completionTokens || null
    metadata = JSON.stringify({
      completionTokenDetails: response.usage?.completionTokensDetails || {},
      systemInstructionLength,
      userContentLength,
    })

    const rawContent = response.choices[0]?.message?.content
    if (!rawContent) throw new Error('KI hat keine Antwort geliefert')

    let sanitizedContent = rawContent.trim()

    // Versuch 1: Extrahiere alles, was innerhalb von ```json und ``` steht
    const jsonBlockMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)

    if (jsonBlockMatch && jsonBlockMatch[1]) {
      sanitizedContent = jsonBlockMatch[1].trim()
    } else {
      // Versuch 2 (Fallback)
      const firstIndex = rawContent.search(/[{[]/)
      const lastIndex = Math.max(
        rawContent.lastIndexOf('}'),
        rawContent.lastIndexOf(']'),
      )

      if (firstIndex !== -1 && lastIndex !== -1 && lastIndex >= firstIndex) {
        sanitizedContent = rawContent
          .substring(firstIndex, lastIndex + 1)
          .trim()
      }
    }

    let parsedJson = { results: {} }
    if (courseId === debugCourseId) {
      parsedJson = JSON.parse(debugJSON)
    }

    // Wenn hier ein Fehler passiert, wirft JSON.parse einen SyntaxError,
    // der vom catch-Block unten gefangen und als Fehler geloggt wird!
    parsedJson = JSON.parse(sanitizedContent)

    if (Array.isArray(parsedJson)) {
      parsedJson = { results: parsedJson }
    }

    const validated = aiBatchTagResponseSchema.parse(parsedJson)

    getNodeEnv('development') &&
      console.log(
        `zodSchema passed successful (${parsedJson === JSON.parse(debugJSON) ? 'debug content used' : `AI content used (model:${response.model})`})`,
      )

    const existingGlobals = input.globalTags
    const existingPrivates = input.privateUserTags

    const finalResults = validated.results.map((aiResult) => {
      const originalEntity = entitiesWithAllowance.find(
        (e) => e.entityId === aiResult.entityId,
      )
      const allowance = originalEntity
        ? originalEntity.allowedNewSuggestions
        : 0

      return {
        entityId: aiResult.entityId,
        tags: sanitizeAITags(
          aiResult.tags,
          existingGlobals,
          existingPrivates,
          70,
          allowance,
        ),
      }
    })

    const existingCourseTagNames = new Set(course?.existingTags || [])

    const deduplicatedResults = finalResults.map((result) => {
      if (result.entityId === courseId) return result
      return {
        ...result,
        tags: result.tags.filter(
          (tag) => !existingCourseTagNames.has(tag.name.toLowerCase()),
        ),
      }
    })

    // --- ERFOLGS-LOGGING ---
    // Wir nutzen await, damit Vercel den Prozess nicht beendet, bevor die DB schreibt
    await prisma.aiUsageLog
      .create({
        data: {
          modelName: actualModel,
          feature: 'BATCH_AUTO_TAG',
          entityId: courseId,
          entityCount,
          userId,
          durationMs,
          promptTokens,
          completionTokens,
          metadata,
          isSuccess: true,
        },
      })
      .catch(
        (e) =>
          getNodeEnv('development') && console.error('[Telemetry Error]', e),
      )

    return deduplicatedResults
  } catch (error: any) {
    const durationMs = Math.round(performance.now() - startTime)

    // Status Code ermitteln (Rate Limit 429 oder Payment Required 402 etc.)
    const statusCode =
      error?.statusCode ||
      error?.response?.status ||
      (error?.message?.includes('429') ? 429 : null)

    // --- FEHLER-LOGGING ---
    await prisma.aiUsageLog
      .create({
        data: {
          modelName: actualModel,
          feature: 'BATCH_AUTO_TAG',
          entityId: courseId,
          entityCount,
          userId,
          durationMs,
          promptTokens, // Könnten vorhanden sein, wenn das HTTP Request klappte, aber Zod failte
          completionTokens,
          metadata,
          isSuccess: false,
          errorCode: statusCode,
          errorMessage: error.message || 'Unknown error',
        },
      })
      .catch(
        (e) =>
          getNodeEnv('development') && console.error('[Telemetry Error]', e),
      )

    if (getNodeEnv('development')) {
      console.error('[AI Service] Batch tag generation failed:', error)
    }

    if (statusCode === 429) {
      throw new ServerActionError(
        'Rate-Limit of the AI model reached, please try again in a few minutes...',
      )
    }

    if (error instanceof SyntaxError || error.name === 'ZodError') {
      throw new ServerActionError(
        'AI answered in an invalid format, please try again (only once more)',
      )
    }

    throw new ServerActionError(
      error.message || 'AI request failed for unknown reason.',
    )
  }
}
