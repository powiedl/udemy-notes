import type { ClientLoggingMetadata } from '#/types/api.type'
import type { UITheme } from '#/types/ui.type'

export const MAX_FILE_SIZE_UPLOAD = 5 * 1024 * 1024 // 5 MB

export const ELEMENTS_PER_PAGE = [5, 10, 25, 50, 100, 250, 500]

export const MISSING_COMPONENT_NAME = '<no component provided>'
export const EMPTY_CLIENT_LOGGING_METADATA: ClientLoggingMetadata = {
  component: MISSING_COMPONENT_NAME,
}

export const HTML_COMMENT_START = '<!--'
export const HTML_COMMENT_END = '-->'

export const DEFAULT_EXPORT_SETTINGS = {
  includeCourseTags: true,
  includeTrainers: true,
  includeNoteTags: true,
  includeNotesMetadata: true,
  includeCourseDescription: true,
  includeCourseLinks: true,
  noteVersion: 'edited_with_fallback' as const,
}

export const DEFAULT_UI_SETTINGS = {
  theme: 'system' as UITheme,
  sidebar: {
    collapsed: false,
  },
}
