import { createServerFn } from '@tanstack/react-start'

export const getImportSelectorsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    // 1. Dynamischer Import der Logik (Schützt das Client Bundle absolut sicher)
    const { getImportSelectorsLogic } = await import('./config.logic.server')

    // 2. Aufruf der Logik
    return await getImportSelectorsLogic()
  },
)
