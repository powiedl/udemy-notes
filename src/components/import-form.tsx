// src/components/import-form.tsx

import { useState, useRef, useTransition, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useForm, useStore } from '@tanstack/react-form'
import { useServerFn } from '@tanstack/react-start'
import {
  CloudUpload,
  FileText,
  X,
  Loader2,
  User,
  Tag as TagIcon,
  Check,
  ChevronsUpDown,
  Plus,
} from 'lucide-react'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import { importHtmlFile } from '#/data/import-export'
import { getTrainerSuggestionsFn } from '#/data/course'
import { getTagsForSelectorFn } from '#/data/tag'
import { handleAction } from '#/lib/client-utils'
import { MAX_FILE_SIZE_UPLOAD } from '#/lib/constants'
import { PAGINATION_DEFAULTS } from '#/schemas/search-params'

const importHtmlFormSchema = z.object({
  file: z
    .instanceof(File, { message: 'Invalid file format' })
    .refine((file) => file.size <= MAX_FILE_SIZE_UPLOAD, 'File too large')
    .refine(
      (file) => file.type === 'text/html' || file.name.endsWith('.html'),
      'Only HTML allowed',
    )
    // 1. Erlaubt "null" als validen Typen für den Initialzustand (Linter ist glücklich!)
    .nullable()
    // 2. Fängt das "null" beim Abschicken ab, macht es also wieder zum Pflichtfeld
    .refine(
      (file) => file !== null,
      'Please choose a Udemy course notes HTML file',
    ),
  trainers: z.array(z.string()),
  tagIds: z.array(z.string()),
  newPrivateTags: z.array(z.string()),
})

export function ImportHtmlForm({ selector }: { selector: string }) {
  const navigate = useNavigate()
  const [isPending, startTransition] = useTransition()
  const uploadFile = useServerFn(importHtmlFile)
  const getTrainerSuggestions = useServerFn(getTrainerSuggestionsFn)
  const getTagsForSelector = useServerFn(getTagsForSelectorFn)

  const [suggestions, setSuggestions] = useState<{
    suggestions: string[]
    hasMore: boolean
  }>({ suggestions: [], hasMore: false })
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [availableTags, setAvailableTags] = useState<
    { id: string; name: string; userId: string | null }[]
  >([])
  const [tagQuery, setTagQuery] = useState('')
  const [currentTrainerInput, setCurrentTrainerInput] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm({
    defaultValues: {
      file: null as File | null,
      trainers: [] as string[], // Geändert zu Array!
      tagIds: [] as string[],
      newPrivateTags: [] as string[],
    },
    validators: {
      onChange: importHtmlFormSchema,
    },
    onSubmit: async ({ value }) => {
      const file = value.file // so Typescript also knows in the startTransition closure that file is not null
      if (!file) return

      startTransition(async () => {
        try {
          const rawHtml = await file.text()
          const parser = new DOMParser()
          const doc = parser.parseFromString(rawHtml, 'text/html')

          const title = doc.title || 'Udemy Course'
          const notesContainer = doc.querySelector(selector)

          if (!notesContainer) {
            throw new Error(
              'No notes found. Are you sure the file is a Udemy HTML file (from the browsers Dev Tools)?',
            )
          }

          const strippedHtml = `
            <!DOCTYPE html>
            <html>
              <head><title>${title}</title></head>
              <body>
                ${notesContainer.outerHTML}
              </body>
            </html>
          `.trim()

          const result = await handleAction(
            uploadFile({
              data: {
                htmlContent: strippedHtml,
                fileName: file.name,
                fileSize: new Blob([strippedHtml]).size,
                trainers: value.trainers, // Hier senden wir das Array!
                tagIds: value.tagIds,
                newPrivateTags: value.newPrivateTags,
                loggingMetadata: { component: 'ImportHtmlForm' },
              },
            }),
            { successToast: 'Course notes processed successfully' },
          )

          await navigate({
            to: '/courses/$courseId',
            params: { courseId: result.courseId },
            search: PAGINATION_DEFAULTS,
          })
        } catch (error) {
          console.error('Submit Error:', error)
          const errorMessage =
            error instanceof Error
              ? error.message
              : 'Ein unerwarteter Fehler ist aufgetreten.'

          toast.error(errorMessage)
        }
      })
    },
  })

  const tagIds = useStore(form.store, (s) => s.values.tagIds)
  const newPrivateTags = useStore(form.store, (s) => s.values.newPrivateTags)
  const canSubmit = useStore(form.store, (s) => s.canSubmit)

  const fetchSuggestions = async (val: string) => {
    const res = await getTrainerSuggestions({
      data: { query: val, loggingMetadata: { component: 'ImportHtmlForm' } },
    })
    if (res.success) {
      setSuggestions({
        suggestions: res.data.suggestions.map((d) => d.name),
        hasMore: res.data.hasMore,
      })
      setShowSuggestions(res.data.suggestions.length > 0 || res.data.hasMore)
    }
  }

  useEffect(() => {
    const loadTags = async () => {
      const res = await getTagsForSelector({
        data: { loggingMetadata: { component: 'ImportHtmlForm' } },
      })
      if (res.success) setAvailableTags(res.data)
    }
    loadTags()
  }, [])

  return (
    <Card className="max-w-md w-full mx-auto">
      <CardHeader>
        <CardTitle>Import your course</CardTitle>
        <CardDescription>
          Select trainers, tags and upload your Udemy HTML notes.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
          className="space-y-6"
        >
          {/* Trainer Feld */}
          <form.Field
            name="trainers"
            children={(field) => {
              const selectedTrainers = field.state.value

              const handleAddTrainer = (name: string) => {
                const trimmed = name.trim()
                if (trimmed && !selectedTrainers.includes(trimmed)) {
                  field.handleChange([...selectedTrainers, trimmed])
                }
                setCurrentTrainerInput('')
                setShowSuggestions(false)
              }

              const handleRemoveTrainer = (name: string) => {
                field.handleChange(selectedTrainers.filter((t) => t !== name))
              }

              return (
                <Field className="relative">
                  <FieldLabel htmlFor="trainer-input">
                    Trainer (Optional)
                  </FieldLabel>

                  {/* Ausgewählte Trainer als Badges anzeigen */}
                  {selectedTrainers.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2 mb-2 min-h-6">
                      {selectedTrainers.map((t) => (
                        <Badge
                          key={t}
                          variant="secondary"
                          className="pl-2 pr-1 py-0.5 gap-1 bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200"
                        >
                          <User className="h-3 w-3" />
                          {t}
                          <button
                            type="button"
                            onClick={() => handleRemoveTrainer(t)}
                            className="hover:bg-blue-200 rounded-full p-0.5 ml-1 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="relative mt-2">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="trainer-input"
                      className="pl-9"
                      value={currentTrainerInput}
                      onFocus={(e) => fetchSuggestions(e.target.value)}
                      onBlur={() =>
                        setTimeout(() => setShowSuggestions(false), 200)
                      }
                      onChange={(e) => {
                        setCurrentTrainerInput(e.target.value)
                        fetchSuggestions(e.target.value)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddTrainer(currentTrainerInput)
                        }
                      }}
                      placeholder="Name of the trainer ... (Press Enter)"
                      autoComplete="off"
                    />
                  </div>

                  {showSuggestions && (
                    <div
                      className="absolute left-0 right-0 z-100 bg-popover border border-border rounded-md shadow-xl"
                      style={{
                        top: 'calc(100% + 4px)',
                        minWidth: '200px',
                      }}
                    >
                      <div className="max-h-60 overflow-y-auto">
                        {suggestions.suggestions.map((name) => (
                          <button
                            key={name}
                            type="button"
                            className="w-full text-left px-4 py-2 text-sm hover:bg-accent transition-colors"
                            onClick={() => handleAddTrainer(name)}
                          >
                            {name}
                          </button>
                        ))}

                        {suggestions.hasMore && (
                          <div className="px-4 py-2 text-center text-muted-foreground bg-muted/30 border-t border-border/50 text-[10px] italic">
                            ... more results available
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Field>
              )
            }}
          />

          {/* Tags Sektion */}
          <div className="space-y-2">
            <FieldLabel>Kurs-Tags</FieldLabel>
            <div className="flex flex-wrap gap-2 min-h-6">
              {tagIds.map((id: string) => {
                const tag = availableTags.find((t) => t.id === id)
                return (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="pl-2 pr-1 py-0.5 gap-1"
                  >
                    {tag?.name}
                    <button
                      type="button"
                      onClick={() =>
                        form.setFieldValue('tagIds', (prev) =>
                          prev.filter((i) => i !== id),
                        )
                      }
                      className="hover:bg-muted rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )
              })}
              {newPrivateTags.map((name: string) => (
                <Badge
                  key={name}
                  variant="outline"
                  className="pl-2 pr-1 py-0.5 gap-1 border-primary/50 bg-primary/5"
                >
                  {name}{' '}
                  <span className="text-[10px] text-primary/70">(Neu)</span>
                  <button
                    type="button"
                    onClick={() =>
                      form.setFieldValue('newPrivateTags', (prev) =>
                        prev.filter((n) => n !== name),
                      )
                    }
                    className="hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between font-normal text-muted-foreground"
                >
                  <div className="flex items-center">
                    <TagIcon className="mr-2 h-4 w-4" /> Tags auswählen...
                  </div>
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-0 w-(--radix-popover-trigger-width)"
                align="start"
              >
                <Command>
                  <CommandInput
                    placeholder="Suchen..."
                    value={tagQuery}
                    onValueChange={setTagQuery}
                  />
                  <CommandList>
                    <CommandEmpty className="p-0">
                      <button
                        type="button"
                        className="flex items-center w-full px-4 py-3 text-sm hover:bg-accent transition-colors text-primary"
                        onClick={() => {
                          if (tagQuery && !newPrivateTags.includes(tagQuery)) {
                            form.setFieldValue('newPrivateTags', (prev) => [
                              ...prev,
                              tagQuery,
                            ])
                            setTagQuery('')
                          }
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" /> Privates Tag "
                        {tagQuery}" erstellen
                      </button>
                    </CommandEmpty>
                    <CommandGroup>
                      {availableTags.map((tag) => {
                        const isSelected = tagIds.includes(tag.id)
                        return (
                          <CommandItem
                            key={tag.id}
                            onSelect={() => {
                              if (!isSelected)
                                form.setFieldValue('tagIds', (prev) => [
                                  ...prev,
                                  tag.id,
                                ])
                              else
                                form.setFieldValue('tagIds', (prev) =>
                                  prev.filter((id) => id !== tag.id),
                                )
                            }}
                          >
                            <div
                              className={cn(
                                'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                                isSelected
                                  ? 'bg-primary text-primary-foreground'
                                  : 'opacity-50',
                              )}
                            >
                              {isSelected && <Check className="h-3 w-3" />}
                            </div>
                            {tag.name}
                            {tag.userId && (
                              <span className="ml-auto text-[10px] text-muted-foreground uppercase">
                                Privat
                              </span>
                            )}
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Dropzone */}
          <FieldGroup>
            <form.Field
              name="file"
              children={(field) => {
                const isInvalid =
                  field.state.meta.errors.length > 0 &&
                  field.state.meta.isTouched
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Course HTML</FieldLabel>
                    <div className="group relative mt-2">
                      <div
                        onDragOver={(e) => {
                          e.preventDefault()
                          setIsDragging(true)
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault()
                          setIsDragging(false)
                          const files = e.dataTransfer.files
                          if (files.length > 0) field.handleChange(files[0])
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer transition-all
                        ${isDragging ? 'border-primary bg-primary/10 scale-[1.01]' : 'border-slate-300 bg-slate-50'}
                        ${isInvalid ? 'border-red-500 bg-red-50' : 'hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900'}
                      `}
                      >
                        <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center pointer-events-none">
                          {field.state.value ? (
                            <>
                              <div className="p-3 bg-primary/10 rounded-full mb-3 text-primary">
                                <FileText className="w-8 h-8" />
                              </div>
                              <p className="text-sm font-semibold">
                                {field.state.value.name}
                              </p>
                              <p className="text-xs text-slate-500 mt-1">
                                Ready for import.
                              </p>
                            </>
                          ) : (
                            <>
                              <CloudUpload
                                className={`w-10 h-10 mb-3 ${isInvalid ? 'text-red-500' : 'text-slate-400'}`}
                              />
                              <p className="mb-2 text-sm font-medium">
                                Click to upload{' '}
                                <span className="text-slate-400 font-normal">
                                  or drag and drop
                                </span>
                              </p>
                              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                                HTML only
                              </p>
                            </>
                          )}
                        </div>
                        <Input
                          id={field.name}
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          accept=".html,text/html"
                          onChange={(e) => {
                            if (e.target.files?.[0])
                              field.handleChange(e.target.files[0])
                          }}
                        />
                      </div>
                      {field.state.value && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 h-8 w-8 rounded-full z-10"
                          onClick={(e) => {
                            e.stopPropagation()
                            field.handleChange(null)
                            if (fileInputRef.current)
                              fileInputRef.current.value = ''
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {isInvalid && (
                      <FieldError>
                        {field.state.meta.errors.join(', ')}
                      </FieldError>
                    )}
                  </Field>
                )
              }}
            />

            <div className="pt-4">
              <Button
                type="submit"
                className="w-full hover:cursor-pointer font-semibold"
                disabled={isPending || !canSubmit}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />{' '}
                    Importing...
                  </>
                ) : (
                  'Import course'
                )}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
