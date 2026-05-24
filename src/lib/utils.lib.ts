export { cn } from '#/lib/utils'

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isEmpty(val: unknown): boolean {
  // 1. Prüfung auf null oder undefined
  if (val === null || val === undefined) {
    return true
  }

  // 2. Prüfung auf leeres Array
  if (Array.isArray(val)) {
    return val.length === 0
  }

  return false
}

export function getNodeEnv(environment?: string): string | boolean {
  if (environment) return process.env.NODE_ENV === environment
  return process.env.NODE_ENV || 'unknown-environment'
}

/**
 * This function takes an object and returns a new object with the same values,
 * but with all keys sorted alphabetically. If a value is itself an object, it
 * will be recursively normalized.
 *
 * This function is useful for when you need to compare two objects for equality,
 * because objects with the same values but different key orders are not equal.
 *
 * @param obj The object to normalize.
 * @returns A new object with the same values, but with all keys sorted alphabetically.
 */
export function normalizeObject(obj: any): any {
  // 1. Arrays iterieren und Elemente rekursiv normalisieren
  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeObject(item))
  }

  // 2. Objekte alphabetisch sortieren
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = normalizeObject(obj[key])
          return acc
        },
        {} as Record<string, any>,
      )
  }

  // 3. Primitive Werte (Strings, Numbers, etc.) unverändert zurückgeben
  return obj
}

export function getVisualCourseTitle(headerContent: string): string {
  const titleMatch = headerContent.match(/^#\s+(.+)$/m)

  if (!titleMatch) {
    return 'Unknown Course'
  }

  // Entfernt die Markdown-Link-Syntax und gibt nur den Text zurück: [Titel](URL) -> Titel
  return titleMatch[1].replace(/\[([^\]]+)\]\([^)]+\)/, '$1').trim()
}
