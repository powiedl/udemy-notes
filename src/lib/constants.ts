import type { ClientLoggingMetadata } from '#/types/api'
import { env } from './env.server'

export const MAX_FILE_SIZE_UPLOAD = 5 * 1024 * 1024 // 5 MB

// Udemy HTML structure constants
export const NOTES_CONTAINER_SELECTOR =
  env.NOTES_CONTAINER_SELECTOR || '[data-purpose="bookmarks-container"]'
export const NOTE_SELECTOR =
  env.NOTE_SELECTOR || '.lecture-bookmark-v2--row--kw-1I'
export const DURATION_SELECTOR =
  env.DURATION_SELECTOR || '.lecture-bookmark-v2--duration--itqnB'
export const SECTION_SELECTOR =
  env.SECTION_SELECTOR || '.lecture-bookmark-v2--section--j0ti8'
export const LECTURE_SELECTOR = env.LECTURE_SELECTOR || '.ud-text-sm'
export const NOTE_BODY_SELECTOR =
  env.NOTE_BODY_SELECTOR || '[data-purpose="bookmark-body"]'
export const NOTE_CODE_BLOCK_SELECTOR =
  env.NOTE_CODE_BLOCK_SELECTOR || 'ud-component--base-components--code-block'

export const ELEMENTS_PER_PAGE = [5, 10, 25, 50, 100, 250, 500]

export const MISSING_COMPONENT_NAME = '<no component provided>'
export const EMPTY_CLIENT_LOGGING_METADATA: ClientLoggingMetadata = {
  component: MISSING_COMPONENT_NAME,
}

export const SERVER_ERROR_SANITIZED_MESSAGE =
  'POWIDL - An unexpected Server error occured ...'

export const HTML_COMMENT_START = '<!--'
export const HTML_COMMENT_END = '-->'

export const EXAMPLE_SIGNING_SECRET = 'udemy-notes-secure-metadata'
export const SIGNING_SECRET = env.SIGNING_SECRET || EXAMPLE_SIGNING_SECRET
