import { authGetFn } from '#/lib/rpc'

export const getSessionFn = authGetFn // Wir behalten GET bei
  .handler(async ({ context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    // Wir nutzen wrapServerAction für konsistentes Logging/IDs
    return await wrapServerAction(
      'getSessionFn',
      context, // Enthält requestId, correlationId und session
      { loggingMetadata: { component: 'UserAvatar' } },
      async () => {
        const { session } = context

        // Hinweis: authFnMiddleware hat bereits sichergestellt,
        // dass session existiert, sonst wären wir nicht hier.

        // Avatar-Logik (mit fixem Template-String $)
        if (!session.user.image) {
          session.user.image = `https://api.dicebear.com/9.x/avataaars/svg?seed=${session.user.name}`
        }

        return session
      },
    )
  })
