import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_content/courses/$courseId/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_content/courses/$courseId/"!</div>
}
