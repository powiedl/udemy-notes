import {
  Plus,
  Loader2,
  Check,
  CornerDownLeft,
  User,
  MessageSquareWarning,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { Button } from '../ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command'
import TagBadge from './tag-badge'
import { useEffect, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import {
  addTrainerToCourseFn,
  getTrainerSuggestionsFn,
  removeTrainerFromCourseFn,
  createAndLinkTrainerToCourseFn,
} from '#/data/course'
import { handleAction } from '#/lib/client-utils'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'

export interface TrainerDisplay {
  id: string
  name: string
  tooltip?: string
  isDeletable?: boolean
}

interface TrainerManagerProps {
  trainers: TrainerDisplay[]
  courseId: string
  // onAddTrainer: (id: string) => void
  // onRemoveTrainer: (id: string) => void
  //onCreateTrainer?: (name: string) => void // NEU: Optionale Create-Funktion
  isPending?: boolean
  isEditable?: boolean
  deletingTrainerId?: string | null
  size?: 'default' | 'sm'
  className?: string
}

const isQueryInTrainers = (
  query: string,
  trainers: TrainerDisplay[],
): boolean =>
  trainers
    .map((t) => t.name.toLocaleLowerCase())
    .includes(query.toLocaleLowerCase())

export function TrainerManager({
  trainers,
  courseId,
  isPending,
  isEditable = true,
  deletingTrainerId,
  size = 'default',
  className,
}: TrainerManagerProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const getTrainerSuggestions = useServerFn(getTrainerSuggestionsFn)
  const addTrainerToCourse = useServerFn(addTrainerToCourseFn)
  const removeTrainerFromCourse = useServerFn(removeTrainerFromCourseFn)
  const createAndLinkTrainerToCourse = useServerFn(
    createAndLinkTrainerToCourseFn,
  )

  const [suggestions, setSuggestions] = useState<{
    suggestions: { id: string; name: string }[]
    hasMore: boolean
  }>({ suggestions: [], hasMore: false })
  const [showSuggestions, setShowSuggestions] = useState(false)

  const handleRemoveTrainer = async (trainerId: string) => {
    try {
      await handleAction(
        removeTrainerFromCourse({
          data: {
            courseId,
            trainerId,
            loggingMetadata: {
              component: 'CourseCard',
              actionSource: 'RemoveTrainerButton',
            },
          },
        }),
        { successToast: 'Trainer removed from the course' },
      )
      await router.invalidate()
    } catch (error) {
      // Der Fehler wurde bereits von handleAction via Toast gemeldet.
      // Hier fangen wir ihn nur ab, damit der Hook nicht abstürzt.
      //console.error('Löschvorgang abgebrochen:', error)
    }
  }
  const handleAddTrainer = async (trainerId: string) => {
    try {
      await handleAction(
        addTrainerToCourse({
          data: {
            courseId,
            trainerId,
            loggingMetadata: {
              component: 'CourseCard',
              actionSource: 'AddTrainerButton',
            },
          },
        }),
        { successToast: 'Trainer added to the course' },
      )
      await router.invalidate()
    } catch (error) {
      // Der Fehler wurde bereits von handleAction via Toast gemeldet.
      // Hier fangen wir ihn nur ab, damit der Hook nicht abstürzt.
      //console.error('Löschvorgang abgebrochen:', error)
    }
  }
  const handleCreateTrainer = async (trainerName: string) => {
    if (isQueryInTrainers(trainerName, trainers)) {
      //console.log('Trainer already assigned to this course')
      toast.info(`Trainer '${trainerName}' already assigned to this course`)
      return
    }
    try {
      await handleAction(
        createAndLinkTrainerToCourse({
          data: {
            courseId,
            trainerName,
            loggingMetadata: {
              component: 'CourseCard',
              actionSource: 'CreateAndLinkTrainerButton',
            },
          },
        }),
        { successToast: 'Trainer created and added to the course' },
      )
      await router.invalidate()
    } catch (error) {
      // Der Fehler wurde bereits von handleAction via Toast gemeldet.
      // Hier fangen wir ihn nur ab, damit der Hook nicht abstürzt.
      //console.error('Löschvorgang abgebrochen:', error)
    }
  }

  const fetchTrainerSuggestions = async () => {
    const res = await getTrainerSuggestions({
      data: { query, loggingMetadata: { component: 'TrainerManager' } },
    })
    if (res.success && res.data) {
      setSuggestions(res.data)
      setShowSuggestions(res.data.suggestions.length > 0 || res.data.hasMore)
    }
  }
  useEffect(() => {
    fetchTrainerSuggestions()
  }, [query])

  return (
    <div className={cn('flex flex-wrap gap-1.5 mt-1 items-center', className)}>
      {trainers.length === 0 && (
        <span className="text-muted-foreground">add a trainer</span>
      )}
      {trainers.map((trainer) => (
        <TagBadge
          key={trainer.id}
          tag={trainer}
          size={size}
          onDelete={
            trainer.isDeletable
              ? () => handleRemoveTrainer(trainer.id)
              : undefined
          }
          className="bg-green-100 text-green-700 dark:bg-green-400 dark:text-green-900"
          isDeleting={deletingTrainerId === trainer.id}
          title={trainer.tooltip}
          // Das Link-Icon für vererbte Tags reichen wir hier rein
          icon=<User className="size-3.5 " />
          /* bg-green-100 text-green-700 dark:bg-green-700 dark:text-green-100 rounded-md */
        />
      ))}

      {isEditable && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon"
              disabled={isPending}
              title="add a trainer"
              className={cn(
                // Basis-Klassen (Form, Abstand, Transition)
                'h-4 w-6 rounded-md transition-all duration-200 cursor-pointer ml-1',
              )}
            >
              {isPending ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                // Hier ist der Trick für ein elegantes Hovern des Icons:
                // Wir nutzen 'group' auf dem Button nicht zwingend,
                // aber wir animieren die Opacity des Pluszeichens selbst.
                <Plus
                  className={cn(
                    'h-3 w-3 transition-opacity duration-200',
                    // Im Purple-Modus machen wir das Plus beim Hovern zu 100% sichtbar (leuchtend), sonst 70%
                  )}
                />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command
              onKeyDown={(e) => {
                // Enter-Logik für neues Tag
                if (
                  e.key === 'Enter' &&
                  query.length > 0 &&
                  handleAddTrainer &&
                  suggestions.suggestions
                    .filter((s) => !trainers.map((t) => t.id).includes(s.id))
                    .some((t) => t.name === query)
                ) {
                  handleAddTrainer(query)
                  setQuery('')
                  setOpen(false)
                }
              }}
            >
              <CommandInput
                placeholder="search tag ..."
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                <CommandEmpty className="p-1">
                  {/* Dein schöner Create-Button, wenn nichts gefunden wurde */}
                  {query.length > 0 && !isQueryInTrainers(query, trainers) ? (
                    <Button
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between px-3 py-2 rounded-md transition-all',
                        'bg-primary text-primary-foreground shadow-sm',
                        'hover:bg-primary/90 cursor-pointer active:scale-[0.98]',
                      )}
                      onClick={() => {
                        handleCreateTrainer(query)
                        setQuery('')
                        setOpen(false)
                      }}
                    >
                      <Plus className="mr-2 h-3.5 w-3.5 opacity-80" />
                      <span className="text-xs truncate mr-2">
                        <span className="opacity-70 font-light">
                          Create trainer{' '}
                        </span>
                        <span className="font-semibold italic">"{query}"</span>
                      </span>
                      <div className="flex items-center gap-1 opacity-80 shrink-0">
                        <CornerDownLeft className="h-3 w-3" />
                      </div>
                    </Button>
                  ) : (
                    <div className="p-2 text-xs text-muted-foreground text-center">
                      {query.length > 0 ? (
                        <div className="flex items-center gap-x-1">
                          <MessageSquareWarning className="size-3.5 text-orange-400" />
                          <span>Trainer already assigned</span>
                        </div>
                      ) : (
                        'No trainer found'
                      )}
                    </div>
                  )}
                </CommandEmpty>
                <CommandGroup>
                  {suggestions?.suggestions
                    .filter((s) => !trainers.map((t) => t.id).includes(s.id)) // filter out trainers, which are already assigned to the course
                    .map((trainer) => (
                      <CommandItem
                        key={trainer.id}
                        onSelect={() => {
                          handleAddTrainer(trainer.id)
                          setQuery('')
                          setOpen(false)
                        }}
                        className="text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground"
                      >
                        <Check className="mr-2 h-3 w-3 opacity-0" />
                        {trainer.name}
                      </CommandItem>
                    ))}
                  {suggestions.hasMore && (
                    <div className="px-4 py-2 text-center text-muted-foreground bg-muted/30 border-t border-border/50 text-[10px] italic">
                      ... more results available
                    </div>
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
