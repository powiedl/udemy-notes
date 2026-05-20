import { createFileRoute } from '@tanstack/react-router'
import { ImportForm } from '#/components/import-form'
import { getImportSelectorsFn } from '#/data/config.data'

export const Route = createFileRoute('/_content/courses/import/')({
  component: RouteComponent,
  loader: async () => {
    const selectors = await getImportSelectorsFn()
    return { selectors } // Gib das GANZE Objekt zurück, nicht nur container
  },
})

function RouteComponent() {
  const { selectors } = Route.useLoaderData()
  return <ImportForm selectors={selectors} />
}
