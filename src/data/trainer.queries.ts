export const trainerKeys = {
  all: ['trainers'] as const,
  suggestions: (query: string) =>
    [...trainerKeys.all, 'suggestions', query] as const,
}
