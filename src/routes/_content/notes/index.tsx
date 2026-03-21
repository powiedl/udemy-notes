import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_content/notes/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/notes/"!</div>
}
