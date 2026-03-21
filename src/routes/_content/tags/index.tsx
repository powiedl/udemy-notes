import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_content/tags/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_content/tags/"!</div>
}
