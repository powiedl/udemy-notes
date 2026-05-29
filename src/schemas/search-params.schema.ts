import { z } from 'zod'

// #region Pagination
export const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: '',
} as const

// Basis für alle Listen-Routen
export const paginationSchema = z.object({
  page: z.coerce
    .number()
    .catch(PAGINATION_DEFAULTS.page) // greift, wenn der Wert aus der URL für page ungültig ist (z. b. ein string)
    .default(PAGINATION_DEFAULTS.page), // greift, wenn die URL keinen Search Param für page enthält - im Normalfall will man in TanStack Start immer beide Methoden mit gleichem Wert verwenden
  pageSize: z.coerce
    .number()
    .catch(PAGINATION_DEFAULTS.pageSize)
    .default(PAGINATION_DEFAULTS.pageSize),
  search: z
    .string()
    .catch(PAGINATION_DEFAULTS.search)
    .default(PAGINATION_DEFAULTS.search),
})

// Für Tags eigene Defaults (pageSize)
export const TAG_PAGINATION_DEFAULTS = {
  ...PAGINATION_DEFAULTS,
  pageSize: 50,
} as const

export const tagPaginationSchema = paginationSchema.extend({
  pageSize: z.coerce
    .number()
    .catch(TAG_PAGINATION_DEFAULTS.pageSize)
    .default(TAG_PAGINATION_DEFAULTS.pageSize),
})

// Spezifisch für Notizen (erweitert Basis)
export const notesSearchSchema = paginationSchema.extend({
  tagIds: z.array(z.string()).optional(),
  courseId: z.string().optional(),
})

// Spezifisch für Notizen in der Shared Course View
export const notesByTokenIdSearchSchema = paginationSchema.extend({
  tagIds: z.array(z.string()).optional(),
  tokenId: z.string().optional(),
})

export type PaginationParams = z.infer<typeof paginationSchema>
// #endregion

// #region Search and filter params
// #region Course
export const courseSearchSchema = z.object({
  // --- Standard Pagination & Suche ---
  page: z.coerce.number().min(1).catch(1),
  pageSize: z.coerce.number().min(1).max(100).catch(10),
  search: z.string().catch(''),

  // --- Spezifische Kurs-Filter ---
  tagIds: z.array(z.string()).catch([]),

  // Neu: Trainer als dediziertes Suchkriterium
  trainer: z.string().catch(''),
})

// Typ-Extraktion
export type CourseSearchInput = z.infer<typeof courseSearchSchema>

// Aktualisierte Defaults
export const COURSE_SEARCH_DEFAULTS: CourseSearchInput = {
  page: 1,
  pageSize: 6,
  search: '',
  tagIds: [],
  trainer: '',
}

export const courseNotesSearchSchema = paginationSchema.extend({
  // Falls du mehrere Tags gleichzeitig filtern willst:
  tagIds: z.array(z.string()).optional(),

  // Optional: Falls du später nach Datum oder Alphabet sortieren willst
  // sortBy: z.string().optional(),
  // sortOrder: z.enum(['asc', 'desc']).optional(),
})

export type CourseNotesSearchInput = z.infer<typeof courseNotesSearchSchema>
// #endregion

// #region Notes
export const NOTE_SORT_BY_OPTIONS = [
  'course',
  'createdAt',
  'updatedAt',
] as const
export const SORT_ORDER_OPTIONS = ['asc', 'desc'] as const

// Das Schema für die /notes URL-Parameter
export const noteSearchSchema = z.object({
  // --- Standard Pagination & Suche ---
  // (Falls du ein Basis-Schema hast, könntest du hier auch z.intersection oder .merge nutzen)
  page: z.coerce.number().min(1).catch(1),
  pageSize: z.coerce.number().min(1).max(100).catch(10),
  search: z.string().catch(''),

  // --- Spezifische Notes-Filter ---
  // catch([]) sorgt dafür, dass bei einer kaputten URL einfach keine Tags gefiltert werden
  tagIds: z.array(z.string()).catch([]),

  // --- Sortierung ---
  sortBy: z.enum(NOTE_SORT_BY_OPTIONS).catch('course'),
  sortOrder: z.enum(SORT_ORDER_OPTIONS).catch('asc'),
})

// Typ-Extraktion für den Server
export type NoteSearchInput = z.infer<typeof noteSearchSchema>

// Fallback-Defaults (Praktisch für die Initialisierung im Frontend)
export const NOTE_SEARCH_DEFAULTS: NoteSearchInput = {
  page: 1,
  pageSize: 10,
  search: '',
  tagIds: [],
  sortBy: 'course',
  sortOrder: 'asc',
}
// #endregion

// #endregion
