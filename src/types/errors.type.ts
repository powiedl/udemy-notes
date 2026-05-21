/**
 * Eigene Fehlerklasse für Server Actions.
 * Wenn dieser Fehler geworfen wird, wird die Nachricht direkt an den Client weitergegeben.
 */
export class ServerActionError extends Error {
  public readonly isSafeForClient = true
  constructor(message: string) {
    super(message)
    this.name = 'ServerActionError'
    // WICHTIG: Repariert instanceof in kompiliertem JS
    Object.setPrototypeOf(this, ServerActionError.prototype)
  }
}
