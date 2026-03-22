import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_content/courses/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div className="max-w-6xl w-full px-8">Hello "/courses/"!</div>
}
