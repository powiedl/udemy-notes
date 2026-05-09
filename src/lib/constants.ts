import type { ClientLoggingMetadata } from '#/types/api'

export const MAX_FILE_SIZE_UPLOAD = 5 * 1024 * 1024 // 5 MB

export const ELEMENTS_PER_PAGE = [5, 10, 25, 50, 100, 250, 500]

export const MISSING_COMPONENT_NAME = '<no component provided>'
export const EMPTY_CLIENT_LOGGING_METADATA: ClientLoggingMetadata = {
  component: MISSING_COMPONENT_NAME,
}

export const SERVER_ERROR_SANITIZED_MESSAGE =
  'POWIDL - An unexpected Server error occured ...'

export const HTML_COMMENT_START = '<!--'
export const HTML_COMMENT_END = '-->'
