import { clsx, type ClassValue } from 'clsx'
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
