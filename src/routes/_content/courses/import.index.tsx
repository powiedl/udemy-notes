import { createFileRoute } from '@tanstack/react-router'
import { UploadForm } from '#/components/upload-form'

export const Route = createFileRoute('/_content/courses/import/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <UploadForm />
}
