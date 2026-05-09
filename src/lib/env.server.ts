// src/lib/env.ts
import { z } from 'zod'

const envSchema = z.object({
  // Environment
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  // Datenbank
  DATABASE_URL: z.string().url('Muss eine gültige URL sein'),
  DATABASE_URL_UNPOOLED: z.string().url().optional(),

  // Authentifizierung
  BETTER_AUTH_SECRET: z.string().min(1, 'Better Auth Secret fehlt'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),

  // OpenRouter (KI)
  OPENROUTER_API_KEY: z.string().min(1, 'OpenRouter API Key fehlt'),

  // Security
  SIGNING_SECRET: z.string().default('udemy-notes-secure-metadata'),

  // Udemy HTML Selectors (mit Fallbacks, falls sie nicht in der .env stehen)
  NOTES_CONTAINER_SELECTOR: z
    .string()
    .default('[data-purpose="bookmarks-container"]'),
  NOTE_SELECTOR: z.string().default('.lecture-bookmark-v2--row--kw-1I'),
  DURATION_SELECTOR: z
    .string()
    .default('.lecture-bookmark-v2--duration--itqnB'),
  SECTION_SELECTOR: z.string().default('.lecture-bookmark-v2--section--j0ti8'),
  LECTURE_SELECTOR: z.string().default('.ud-text-sm'),
  NOTE_BODY_SELECTOR: z.string().default('[data-purpose="bookmark-body"]'),
  NOTE_CODE_BLOCK_SELECTOR: z
    .string()
    .default('ud-component--base-components--code-block'),

  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_BRANCH_URL: z.string().optional(),
})

// process.env wird geparst. Wenn etwas nicht stimmt, crasht die App hier sofort mit einer klaren Meldung.
export const env = envSchema.parse(process.env)
