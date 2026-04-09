import { ClientLoggingMetadata } from '#/types/api'

export const MAX_FILE_SIZE_UPLOAD = 5 * 1024 * 1024 // 5 MB

// Udemy HTML structure constants
export const NOTES_CONTAINER_SELECTOR =
  process.env.NOTES_CONTAINER_SELECTOR || '[data-purpose="bookmarks-container"]'
export const NOTE_SELECTOR =
  process.env.NOTE_SELECTOR || '.lecture-bookmark-v2--row--kw-1I'
export const DURATION_SELECTOR =
  process.env.DURATION_SELECTOR || '.lecture-bookmark-v2--duration--itqnB'
export const SECTION_SELECTOR =
  process.env.SECTION_SELECTOR || '.lecture-bookmark-v2--section--j0ti8'
export const LECTURE_SELECTOR = process.env.LECTURE_SELECTOR || '.ud-text-sm'
export const NOTE_BODY_SELECTOR =
  process.env.NOTE_BODY_SELECTOR || '[data-purpose="bookmark-body"]'
export const NOTE_CODE_BLOCK_SELECTOR =
  process.env.NOTE_CODE_BLOCK_SELECTOR ||
  'ud-component--base-components--code-block'

export const ELEMENTS_PER_PAGE = [5, 10, 25, 50, 100, 250, 500]

export const MISSING_COMPONENT_NAME = '<no component provided>'
export const EMPTY_CLIENT_LOGGING_METADATA: ClientLoggingMetadata = {
  component: MISSING_COMPONENT_NAME,
}

export const SERVER_ERROR_SANITIZED_MESSAGE =
  'POWIDL - An unexpected Server error occured ...'
