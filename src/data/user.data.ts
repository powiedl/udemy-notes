import { updateUserSettingsSchema } from '#/schemas/settings.schema'
import { authFn, authGetFn } from '#/lib/rpc.lib'
import { withLogging } from '#/schemas/api-utils.schema'
import z from 'zod'
import { queryOptions } from '@tanstack/react-query'

export const getUserSettingsFn = authGetFn({ method: 'GET' })
  .inputValidator(withLogging(z.object()))
  .handler(async ({ context, data }) => {
    // 1. Auth-Check: Hole userId aus der Session/Middleware (context)
    const userId = context.session.user.id

    // 2. Dynamischer Import der Logik
    const { getUserSettingsLogic } = await import('./user.logic.server')
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')

    // 3. Ausführung
    return await wrapServerAction('getUserSettingsFn', context, data, () =>
      getUserSettingsLogic(userId),
    )
  })

export const updateUserSettingsFn = authFn({ method: 'POST' })
  .inputValidator(withLogging(updateUserSettingsSchema))
  .handler(async ({ context, data }) => {
    const userId = context.session.user.id

    const { updateUserSettingsLogic } = await import('./user.logic.server')
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')

    return await wrapServerAction(
      'updateUserSettingsFn',
      context,
      data,
      () => updateUserSettingsLogic(data, userId),
      'Settings saved successfully',
    )
  })

export const userSettingsQueryOptions = () =>
  queryOptions({
    queryKey: ['userSettings'],
    queryFn: async () => {
      try {
        const response = await getUserSettingsFn({ data: {} })
        return response.success ? response.data : null
      } catch (error) {
        // Fängt harte 401 Unauthorized oder Netzwerk-Fehler ab
        return null
      }
    },
    // Da Settings sich selten ändern, cachen wir sie für 10 Minuten
    staleTime: 1000 * 60 * 10,
  })
