import { useEffect, useState } from 'react'
import {
  User,
  Plus,
  Loader2,
  CornerDownLeft,
  MessageSquareWarning,
  Check,
  LinkIcon,
} from 'lucide-react'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '#/components/ui/command'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '#/components/ui/popover'
import { Button } from '#/components/ui/button'
import { ActionIconButton } from '../ui/action-icon-button'
import TagBadge from './tag-badge'
import { cn } from '#/lib/utils.lib'
import { useRouter } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTrainerQuery } from '#/hooks/use-trainer-query.hook'
import { useServerFn } from '@tanstack/react-start'
import {
  addTrainerToCourseFn,
  createAndLinkTrainerToCourseFn,
  removeTrainerFromCourseFn,
} from '#/data/course.data'
import { handleAction } from '#/lib/client-utils.lib'
import { toast } from 'sonner'

export interface TrainerDisplay {
  id: string
  name: string
  profileUrl?: string | null
  isDeletable?: boolean
  tooltip?: string
}

interface TrainerManagerProps {
  trainers: TrainerDisplay[]
  courseId: string
  // onAddTrainer: (id: string) => void
  // onRemoveTrainer: (id: string) => void
  // onCreateTrainer?: (name: string) => void // NEU: Optionale Create-Funktion
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

export const TrainerManager = ({
  trainers,
  courseId,
  isPending,
  isEditable = true,
  deletingTrainerId,
  size = 'default',
  className,
}: TrainerManagerProps) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: suggestionsData, isFetching } = useTrainerQuery({ query, open })
  const availableSuggestions = suggestionsData?.suggestions || []
  const [_, setDebouncedQuery] = useState('')

  const addTrainerToCourse = useServerFn(addTrainerToCourseFn)
  const removeTrainerFromCourse = useServerFn(removeTrainerFromCourseFn)
  const createAndLinkTrainerToCourse = useServerFn(
    createAndLinkTrainerToCourseFn,
  )

  // =====================================================================
  // WICHTIG: HIER DEINE URSPRÜNGLICHEN HOOKS WIEDER EINFÜGEN!
  // (z.B. const { handleRemoveTrainer, availableSuggestions, ... } = useTrainerAPI(courseId))
  // Die folgenden Variablen müssen aus deinen Hooks kommen:
  // - handleRemoveTrainer
  // - handleAddTrainer
  // - handleCreateTrainer
  // - availableSuggestions
  // - suggestionsData
  // - isFetching
  // - isPending
  // - deletingTrainerId
  // =====================================================================
  const handleRemoveTrainer = async (trainerId: string) => {
    if (!isEditable) return
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
      // console.error('Löschvorgang abgebrochen:', error)
    }
  }
  const handleAddTrainer = async (trainerId: string) => {
    if (!isEditable) return
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
      // console.error('Löschvorgang abgebrochen:', error)
    }
  }
  const handleCreateTrainer = async (trainerName: string) => {
    if (!isEditable) return
    if (isQueryInTrainers(trainerName, trainers)) {
      // console.log('Trainer already assigned to this course')
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
      await queryClient.invalidateQueries({ queryKey: ['trainers'] })
      await router.invalidate()
    } catch (error) {
      // Der Fehler wurde bereits von handleAction via Toast gemeldet.
      // Hier fangen wir ihn nur ab, damit der Hook nicht abstürzt.
      // console.error('Löschvorgang abgebrochen:', error)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className={cn('flex flex-wrap gap-1.5 mt-1 items-center', className)}>
      {trainers.length === 0 && (
        <span className="text-muted-foreground text-sm">add a trainer</span>
      )}

      {trainers.map((trainer) => (
        <TagBadge
          key={trainer.id}
          tag={{
            id: trainer.id,
            name: trainer.name,
          }}
          size={size}
          onDelete={
            isEditable && trainer.isDeletable
              ? () => handleRemoveTrainer(trainer.id)
              : undefined
          }
          onClick={
            trainer.profileUrl
              ? () => {
                  const appWidth = window.innerWidth
                  const appHeight = window.innerHeight
                  const appLeft = window.screenX
                  const appTop = window.screenY

                  const popupWidth = Math.round(appWidth * 0.8)
                  const popupHeight = Math.round(appHeight * 0.8)

                  const popupLeft = Math.round(
                    appLeft + (appWidth - popupWidth) / 2,
                  )
                  const popupTop = Math.round(
                    appTop + (appHeight - popupHeight) / 2,
                  )

                  window.open(
                    trainer.profileUrl!,
                    'TrainerProfile',
                    `width=${popupWidth},height=${popupHeight},top=${popupTop},left=${popupLeft},noopener,noreferrer`,
                  )
                }
              : undefined
          }
          className={cn(
            'bg-green-100 text-green-700 dark:bg-green-400 dark:text-green-900',
            trainer.profileUrl &&
              'hover:bg-green-200 dark:hover:bg-green-500 transition-colors',
            size === 'sm' ? 'h-5' : 'h-7',
            'group/trainer',
          )}
          isDeleting={deletingTrainerId === trainer.id}
          title={
            trainer.tooltip ||
            (trainer.profileUrl ? `Visit profile: ${trainer.name}` : undefined)
          }
          icon={
            trainer.profileUrl ? (
              <LinkIcon
                className="size-3.5 text-primary transition-transform group-hover/trainer:scale-110"
                strokeWidth={2.5}
              />
            ) : (
              <User className="size-3.5" />
            )
          }
        />
      ))}

      {isEditable && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <ActionIconButton
              actionVariant="purple"
              actionSize="sm"
              className={cn('ml-1', open && 'opacity-0 pointer-events-none')}
              disabled={isPending}
              title="add a trainer"
            >
              {isPending ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <Plus
                  className="h-3 w-3 opacity-80 hover:opacity-100 transition-opacity duration-200"
                  strokeWidth={2.5}
                />
              )}
            </ActionIconButton>
          </PopoverTrigger>
          <PopoverContent
            className="w-64 p-0"
            align="start"
            sideOffset={size === 'default' ? -28 : -20}
          >
            <Command
              shouldFilter={false}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.length > 0) {
                  const matchedTrainer = availableSuggestions.find(
                    (t) => t.name.toLowerCase() === query.toLowerCase(),
                  )

                  if (matchedTrainer) {
                    const isAlreadyAssigned = trainers.some(
                      (t) => t.id === matchedTrainer.id,
                    )

                    if (!isAlreadyAssigned) {
                      handleAddTrainer(matchedTrainer.id)
                      setQuery('')
                      setOpen(false)
                    }
                  }
                }
              }}
            >
              <CommandInput
                placeholder="search trainer ..."
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                {isFetching && (
                  <div className="p-4 flex items-center justify-center text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin opacity-50" />
                    <span>searching...</span>
                  </div>
                )}
                {!isFetching && (
                  <CommandEmpty className="p-1">
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
                          <span className="font-semibold italic">
                            "{query}"
                          </span>
                        </span>
                        <div className="flex items-center gap-1 opacity-80 shrink-0">
                          <CornerDownLeft className="h-3 w-3" />
                        </div>
                      </Button>
                    ) : (
                      <div className="p-2 text-xs text-muted-foreground text-center">
                        {query.length > 0 ? (
                          <div className="flex items-center gap-x-1 justify-center">
                            <MessageSquareWarning className="size-3.5 text-orange-400" />
                            <span>Trainer already assigned</span>
                          </div>
                        ) : (
                          'No trainer found'
                        )}
                      </div>
                    )}
                  </CommandEmpty>
                )}
                <CommandGroup>
                  {availableSuggestions
                    .filter(
                      (s) =>
                        !trainers.some(
                          (existingTrainer) => existingTrainer.id === s.id,
                        ),
                    )
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
                  {suggestionsData?.hasMore && (
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
