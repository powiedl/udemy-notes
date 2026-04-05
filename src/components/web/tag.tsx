import { deleteTagFn, getAvailableTagsFn } from '#/data/tag'
import { ServerFnData } from '#/types/api'
import { X } from 'lucide-react'
import { Badge } from '../ui/badge'
import { useServerFn } from '@tanstack/react-start'
import { useTransition } from 'react'
import { Button } from '../ui/button'
import { cn } from '#/lib/utils'

const Tag = ({
  tag,
}: {
  tag: ServerFnData<typeof getAvailableTagsFn>[number]
}) => {
  const deleteTag = useServerFn(deleteTagFn)
  const [isDeleting, startDeleteTransition] = useTransition()
  const handleDeleteTag = async (id: string) => {
    startDeleteTransition(async () => {
      await deleteTag({ data: { id } })
    })
  }
  return (
    <div className="relative w-fit">
      <Badge
        className="px-4 py-3 uppercase mr-2"
        variant={tag.userId ? 'default' : 'secondary'}
      >
        {tag.name}
      </Badge>
      {tag.userId && (
        <Button
          onClick={() => handleDeleteTag(tag.id)}
          disabled={isDeleting}
          variant="outline"
          className="absolute -right-1 -top-1 h-5 w-5 p-0 rounded-full bg-background shadow-sm group overflow-visible hover:cursor-pointer border-2 dark:bg-muted dark:border-muted-foreground/50"
        >
          <X
            className={cn(
              'size-3 text-muted-foreground transition-all duration-300',
              !isDeleting &&
                'group-hover:text-destructive group-hover:scale-[1.2] group-hover:font-bold ',
              isDeleting && 'opacity-50',
            )}
          />
        </Button>
      )}
    </div>
  )
}
export default Tag
