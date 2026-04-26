import { getTrainerSuggestionsFn } from '#/data/course'
import { trainerKeys } from '#/data/trainer.queries'
import { useQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'

interface UseTrainerQueryProps {
  query: string
  open: boolean
}

export function useTrainerQuery({ query, open }: UseTrainerQueryProps) {
  const getTrainerSuggestions = useServerFn(getTrainerSuggestionsFn)

  return useQuery({
    queryKey: trainerKeys.suggestions(query),
    queryFn: async () => {
      const res = await getTrainerSuggestions({
        data: { query, loggingMetadata: { component: 'TrainerManager' } },
      })

      // 1. Wenn die Server Function fehlschlägt, werfen wir einen Fehler für React Query
      if (!res.success) {
        throw new Error(res.error || 'Failed to fetch suggestions')
      }

      // 2. Wenn erfolgreich, geben wir NUR die eigentlichen Daten zurück
      return res.data
    },
    enabled: open,
    //staleTime: 1000 * 60 * 5, // ohne staleTime wird das Ergebnis trotzdem gecached und der Cache auch für die Anzeige verwendet, aber sofort werden die Daten neu abgerufen
  })
}
