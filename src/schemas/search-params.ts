import { z } from 'zod'

export const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 6,
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
  pageSize: 10,
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

export type PaginationParams = z.infer<typeof paginationSchema>
