import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import {
  userSettingsQueryOptions,
  updateUserSettingsFn,
} from '#/data/user.data'
import { UserSettings } from '#/schemas/settings.schema'
import { handleAction } from '#/lib/client-utils.lib'

export function useSettings() {
  const queryClient = useQueryClient()

  // 1. Server Function an React-Kontext binden
  const boundUpdateFn = useServerFn(updateUserSettingsFn)

  // 2. Daten laden (Read)
  const query = useQuery(userSettingsQueryOptions())

  // 3. Mutation definieren (Write)
  const mutation = useMutation({
    mutationFn: async (newSettings: UserSettings) => {
      return await handleAction(boundUpdateFn({ data: newSettings }), {
        showSuccessToast: false, // UI kümmert sich ggf. selbst um den Toast
      })
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.setQueryData(['userSettings'], data)
        queryClient.invalidateQueries({ queryKey: ['userSettings'] })
      }
    },
  })

  // 4. Ein sauberes, sprechendes Objekt zurückgeben
  return {
    settings: query.data,
    isLoading: query.isPending,
    isError: query.isError,
    // mutateAsync ist für Formulare oft besser, da wir auf das Ergebnis mit await warten können
    updateSettings: mutation.mutateAsync,
    isUpdating: mutation.isPending,
  }
}
