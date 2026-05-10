import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

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
export function normalizeObject<T extends Record<string, any>>(obj: T): T {
  // 1. Sicherheitscheck: Wenn kein Objekt da ist, gib es einfach zurück.
  if (typeof obj !== 'object' || Array.isArray(obj)) return obj

  // 2. Alle Schlüssel extrahieren und alphabetisch sortieren.
  // Das ist der entscheidende Schritt für die Deterministik!
  const sortedKeys = Object.keys(obj).sort()

  // 3. Ein neues, leeres Objekt erstellen.
  const normalizedObj = {} as T

  // 4. Die sortierten Schlüssel durchlaufen und die Werte übertragen.
  for (const key of sortedKeys) {
    const value = obj[key]

    // 5. Rekursion (optional, aber empfohlen):
    // Falls ein Wert selbst ein Objekt ist, wird auch dieses sortiert.
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      normalizedObj[key as keyof T] = normalizeObject(value)
    } else {
      normalizedObj[key as keyof T] = value
    }
  }

  return normalizedObj
}
