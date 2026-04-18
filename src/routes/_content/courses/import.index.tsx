import { createFileRoute } from '@tanstack/react-router'
import { ImportHtmlForm } from '#/components/import-form'
import { NOTES_CONTAINER_SELECTOR } from '#/lib/constants'

export const Route = createFileRoute('/_content/courses/import/')({
  component: RouteComponent,
  loader: async () => {
    return {
      selector: NOTES_CONTAINER_SELECTOR,
    }
  },
})

function RouteComponent() {
  const { selector } = Route.useLoaderData()
  return <ImportHtmlForm selector={selector} />
}
