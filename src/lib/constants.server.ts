// src/lib/constants.server.ts
import { env } from './env.server'
import type { UdemySelectors } from '#/types/api'

export const UDEMY_SELECTORS: UdemySelectors = {
  notesContainerSelector:
    env.NOTES_CONTAINER_SELECTOR || '[data-purpose="bookmarks-container"]',
  noteSelector: env.NOTE_SELECTOR || '.lecture-bookmark-v2--row--kw-1I',
  durationSelector:
    env.DURATION_SELECTOR || '.lecture-bookmark-v2--duration--itqnB',
  sectionSelector:
    env.SECTION_SELECTOR || '.lecture-bookmark-v2--section--j0ti8',
  lectureSelector: env.LECTURE_SELECTOR || '.ud-text-sm',
  noteBodySelector: env.NOTE_BODY_SELECTOR || '[data-purpose="bookmark-body"]',
  noteCodeBlockSelector:
    env.NOTE_CODE_BLOCK_SELECTOR || 'ud-component--base-components--code-block',
}

export const EXAMPLE_SIGNING_SECRET = 'udemy-notes-secure-metadata'
export const SIGNING_SECRET = env.SIGNING_SECRET || EXAMPLE_SIGNING_SECRET
