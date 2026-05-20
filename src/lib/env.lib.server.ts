// src/lib/env.ts
import { z } from 'zod'
import {
  DEFAULT_NOTES_CONTAINER_SELECTOR,
  DEFAULT_NOTE_SELECTOR,
  DEFAULT_DURATION_SELECTOR,
  DEFAULT_SECTION_SELECTOR,
  DEFAULT_LECTURE_SELECTOR,
  DEFAULT_NOTE_BODY_SELECTOR,
  DEFAULT_NOTE_CODE_BLOCK_SELECTOR,
  DEFAULT_COURSE_HEAD_TITLE_SELECTOR,
  DEFAULT_COURSE_OG_TITLE_SELECTOR,
  DEFAULT_COURSE_META_TITLE_SELECTOR,
  DEFAULT_COURSE_META_DESCRIPTION_SELECTOR,
  DEFAULT_COURSE_OG_DESCRIPTION_SELECTOR,
  DEFAULT_COURSE_IMAGE_URL_SELECTOR,
  DEFAULT_COURSE_URL_SELECTOR,
  DEFAULT_TRAINER_URL_SELECTOR,
  DEFAULT_SERVER_ERROR_SANITIZED_MESSAGE,
} from '#/lib/defaults.lib'

export const SCRIPT_DEFAULT_AGE_SHARE_LINK_IN_DAYS = 7
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
    .default(DEFAULT_NOTES_CONTAINER_SELECTOR),
  NOTE_SELECTOR: z.string().default(DEFAULT_NOTE_SELECTOR),
  DURATION_SELECTOR: z.string().default(DEFAULT_DURATION_SELECTOR),
  SECTION_SELECTOR: z.string().default(DEFAULT_SECTION_SELECTOR),
  LECTURE_SELECTOR: z.string().default(DEFAULT_LECTURE_SELECTOR),
  NOTE_BODY_SELECTOR: z.string().default(DEFAULT_NOTE_BODY_SELECTOR),
  NOTE_CODE_BLOCK_SELECTOR: z
    .string()
    .default(DEFAULT_NOTE_CODE_BLOCK_SELECTOR),
  COURSE_HEAD_TITLE_SELECTOR: z
    .string()
    .default(DEFAULT_COURSE_HEAD_TITLE_SELECTOR),
  COURSE_OG_TITLE_SELECTOR: z
    .string()
    .default(DEFAULT_COURSE_OG_TITLE_SELECTOR),
  COURSE_META_TITLE_SELECTOR: z
    .string()
    .default(DEFAULT_COURSE_META_TITLE_SELECTOR),
  COURSE_META_DESCRIPTION_SELECTOR: z
    .string()
    .default(DEFAULT_COURSE_META_DESCRIPTION_SELECTOR),
  COURSE_OG_DESCRIPTION_SELECTOR: z
    .string()
    .default(DEFAULT_COURSE_OG_DESCRIPTION_SELECTOR),
  COURSE_IMAGE_URL_SELECTOR: z
    .string()
    .default(DEFAULT_COURSE_IMAGE_URL_SELECTOR),
  COURSE_URL_SELECTOR: z.string().default(DEFAULT_COURSE_URL_SELECTOR),
  TRAINER_URL_SELECTOR: z.string().default(DEFAULT_TRAINER_URL_SELECTOR),
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_BRANCH_URL: z.string().optional(),

  // App Settings
  DEFAULT_AGE_SHARE_LINK_IN_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .catch(SCRIPT_DEFAULT_AGE_SHARE_LINK_IN_DAYS)
    .default(SCRIPT_DEFAULT_AGE_SHARE_LINK_IN_DAYS),
  SERVER_ERROR_SANITIZED_MESSAGE: z
    .string()
    .default(DEFAULT_SERVER_ERROR_SANITIZED_MESSAGE),
})

// process.env wird geparst. Wenn etwas nicht stimmt, crasht die App hier sofort mit einer klaren Meldung.
export const env = envSchema.parse(process.env)
