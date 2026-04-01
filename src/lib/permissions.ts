// Hier definierst du alle Rollen, die es in deiner App gibt
export const VALID_ROLES = ['admin', 'user'] as const
export type Role = (typeof VALID_ROLES)[number]

/**
 * Prüft, ob ein User-Objekt (aus der Session) eine bestimmte Rolle hat.
 * Funktioniert für den String-Trick "admin,editor".
 */
export function hasRole(
  user: ({ role?: string | null } & Record<string, any>) | undefined | null,
  requiredRole: Role,
): boolean {
  // Zugriff über any-Cast oder Index, um TS-Probleme bei unvollständigen Client-Typen zu umgehen
  const role = (user as any)?.role
  if (!role || typeof role !== 'string') return false

  const roles = role.split(',').map((r) => r.trim())
  return roles.includes(requiredRole)
}

/**
 * Prüft, ob ein User MINDESTENS eine der angegebenen Rollen hat.
 */
export function hasAnyRole(
  user: ({ role?: string | null } & Record<string, any>) | undefined | null,
  requiredRoles: Role[],
): boolean {
  return requiredRoles.some((role) => hasRole(user, role))
}
