import { OpenRouter } from '@openrouter/sdk'
import { env } from './env.server'

export const openrouter = new OpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
})
