import { OpenRouter } from '@openrouter/sdk'
import { env } from '#/lib/env.lib.server'

export const openrouter = new OpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
})
