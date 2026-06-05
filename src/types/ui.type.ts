export const UI_THEMES = ['light', 'dark', 'system'] as const

export type UITheme = (typeof UI_THEMES)[number]
