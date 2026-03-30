import { createFileRoute } from '@tanstack/react-router'
import { Construction } from 'lucide-react'

export const Route = createFileRoute('/_content/notes/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="max-w-6xl w-full px-8 flex items-center justify-center">
      <Construction className="size-8 mr-1" />
      Here you will be able to work with all of your notes, no matter to which
      course they belong ...
      <Construction className="size-8 ml-1" />
    </div>
  )
}
