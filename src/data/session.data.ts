import { authGetFn } from '#/lib/rpc.lib'

/**
 * Ruft die aktuelle Benutzersitzung (Session) ab.
 *
 * Diese Funktion wird verwendet, um die Benutzerdaten im Frontend initial bereitzustellen.
 * Sie stellt sicher, dass jeder Benutzer ein gültiges Profilbild (ggf. als Fallback) besitzt,
 * um Darstellungsfehler in Komponenten wie dem UserAvatar zu vermeiden.
 */
export const getSessionFn = authGetFn // Wir behalten GET bei
  .handler(async ({ context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')

    // wrapServerAction stellt sicher, dass der Aufruf mit einer requestId getraced wird
    // und Fehler konsistent an das Logging-System übertragen werden.
    return await wrapServerAction(
      'getSessionFn',
      context,
      { loggingMetadata: { component: 'UserAvatar' } },
      async () => {
        const { session } = context

        // --- Avatar-Generierung ---
        // Falls der Provider (z.B. Google oder GitHub) kein Bild liefert, generieren wir
        // einen deterministischen Avatar über die Dicebear-API basierend auf dem Benutzernamen.
        if (!session.user.image) {
          session.user.image = `https://api.dicebear.com/9.x/avataaars/svg?seed=${session.user.name}`
        }

        return session
      },
    )
  })
