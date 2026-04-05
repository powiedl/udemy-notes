import Tag from '#/components/web/tag'
import { getAvailableTagsFn } from '#/data/tag'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { Suspense, use } from 'react'

export const Route = createFileRoute('/_content/tags/')({
  component: RouteComponent,
  loader: () => ({
    tagsPromise: getAvailableTagsFn({
      /*data: { query: 'm' } */
    }),
  }),
})

function Tags({ data }: { data: ReturnType<typeof getAvailableTagsFn> }) {
  const result = use(data)
  if (!result.success)
    return (
      <div className="p-4 border border-red-500 bg-red-50 text-red-700 rounded">
        <p>Error while loading the tags</p>
        <pre>{result.error}</pre>
      </div>
    )
  const tags = result.data

  //console.log('Tags,result', result)
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {tags.map((t) => (
        <Tag key={t.id} tag={t} />
      ))}
    </div>
  )
}
function RouteComponent() {
  const { tagsPromise } = Route.useLoaderData()

  return (
    <>
      <div className="px-4">
        <Suspense
          fallback={<Loader2 className="size-40 animate-spin mx-auto" />}
        >
          <Tags data={tagsPromise} />
        </Suspense>
      </div>
    </>
  )
  // return (
  // )
}
