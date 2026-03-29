import { createFileRoute } from '@tanstack/react-router'
import { ImportHtmlForm } from '#/components/import-form'

export const Route = createFileRoute('/_content/courses/import/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <ImportHtmlForm />
}
