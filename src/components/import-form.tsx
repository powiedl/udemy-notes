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
  Link as LinkIcon,
  Image as ImageIcon,
  User,
  Tag as TagIcon,
  Check,
  ChevronsUpDown,
  Plus,
  //  ArrowLeft,
  CheckCircle2,
  Info,
} from 'lucide-react'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
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
import { cn } from '@/lib/utils.lib'

import {
  importHtmlFileFn,
  importMdFileFn,
  checkImportFileFn,
  analyzeHtmlPayloadFn, // NEU importiert
} from '#/data/import-export.data'
import { getTrainerSuggestionsFn } from '#/data/course.data'
import { getTagsForSelectorFn } from '#/data/tag.data'
import { handleAction } from '#/lib/client-utils.lib'
import { MAX_FILE_SIZE_UPLOAD } from '#/lib/constants.lib'
import { PAGINATION_DEFAULTS } from '#/schemas/search-params.schema'
import { prepareMdPayload, prepareHtmlPayload } from '#/lib/import-helpers.lib'
import type { UdemySelectors } from '#/types/api.type'
// import type { AnalysisResult } from '#/types/import-export.type'
import type { AnalyzeHtmlResponseSchema } from '#/schemas/import-file.schema'

// --- TYPEN ---

const importFormSchema = z.object({
  file: z
    .instanceof(File, { message: 'Invalid file format' })
    .refine((file) => file.size <= MAX_FILE_SIZE_UPLOAD, 'File too large')
    .refine(
      (file) =>
        file.type === 'text/html' ||
        file.name.toLowerCase().endsWith('.html') ||
        file.type === 'text/markdown' ||
        file.name.toLowerCase().endsWith('.md'),
      'Only HTML or Markdown (.md) allowed',
    )
    .nullable()
    .refine(
      (file) => file !== null,
      'Please choose a Udemy course notes file (HTML or MD)',
    ),
  trainers: z.array(z.string()),
  tagIds: z.array(z.string()),
  newPrivateTags: z.array(z.string()),
})

export function ImportForm({ selectors }: { selectors: UdemySelectors }) {
  const navigate = useNavigate()
  const [isPending, startTransition] = useTransition()

  // Server Functions
  const uploadHtmlFile = useServerFn(importHtmlFileFn)
  const uploadMdFile = useServerFn(importMdFileFn)
  const checkFile = useServerFn(checkImportFileFn)
  const analyzeHtmlPayload = useServerFn(analyzeHtmlPayloadFn) // NEU
  const getTrainerSuggestions = useServerFn(getTrainerSuggestionsFn)
  const getTagsForSelector = useServerFn(getTagsForSelectorFn)

  // --- STATES ---
  // Workflow States
  const [step, setStep] = useState<'input' | 'preview'>('input')
  const [analysisResult, setAnalysisResult] =
    useState<AnalyzeHtmlResponseSchema | null>(null)
  const [htmlImportCache, setHtmlImportCache] = useState<{
    content: string
    value: any
  } | null>(null)

  // Form & UI States
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

  // Security Workflow States (Markdown)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [pendingImportData, setPendingImportData] = useState<{
    content: string
    value: any
    isMarkdown: boolean
  } | null>(null)

  // --- FUNKTIONEN ---
  const executeFinalImport = async (
    content: string,
    value: any,
    isMarkdown: boolean,
    forceReplace: boolean = false,
  ) => {
    startTransition(async () => {
      try {
        let actionPromise

        if (isMarkdown) {
          // Markdown Flow bleibt gleich
          const basePayload = prepareMdPayload(value.file, content, value)
          actionPromise = uploadMdFile({
            data: { ...basePayload, forceReplace },
          })
        } else {
          if (!analysisResult) return

          // Wir bauen den Payload EXTREM explizit zusammen
          const htmlPayload = {
            parsedCourse: analysisResult.parsedCourse,
            fileName: value.file?.name || 'imported-course.html',
            // HIER: Wir stellen sicher, dass die Namen aus dem Formular-Value
            // mitgeschickt werden!
            trainers: value.trainers || [],
            tagIds: value.tagIds || [],
            newPrivateTags: value.newPrivateTags || [],
            forceReplace,
            loggingMetadata: { component: 'ImportForm' },
          }

          actionPromise = uploadHtmlFile({ data: htmlPayload })
        }

        const result = await handleAction<{ courseId: string }>(actionPromise, {
          successToast: 'Course notes imported successfully',
        })
        if (result.courseId) {
          await navigate({
            to: '/courses/$courseId',
            params: { courseId: result.courseId },
            search: PAGINATION_DEFAULTS,
          })
        }
      } catch (error) {
        console.error('Submit Error:', error)
        toast.error(
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred.',
        )
      } finally {
        setShowWarningModal(false)
        setPendingImportData(null)
      }
    })
  }

  const form = useForm({
    defaultValues: {
      file: null as File | null,
      trainers: [] as string[],
      tagIds: [] as string[],
      newPrivateTags: [] as string[],
    },
    validators: {
      onChange: importFormSchema,
    },
    onSubmit: async ({ value }) => {
      // 🚨 FIX: Wir greifen direkt auf den Store zu, um sicherzugehen
      const currentValues = form.state.values
      const file = currentValues.file
      if (!file) return

      startTransition(async () => {
        try {
          const fileContent = await file.text()
          const isMarkdown = file.name.toLowerCase().endsWith('.md')

          if (!isMarkdown) {
            // Wir nutzen hier explizit currentValues statt value
            const payload = prepareHtmlPayload(
              file,
              fileContent,
              currentValues,
              selectors,
            )

            const analysis = await handleAction<AnalyzeHtmlResponseSchema>(
              analyzeHtmlPayload({ data: payload }),
              { showSuccessToast: false, showErrorToast: true },
            )

            setAnalysisResult(analysis)
            // console.log('ImportForm,analysis:', analysis)
            // Wir cachen die absolut frischen Daten
            setHtmlImportCache({ content: fileContent, value: currentValues })
            setStep('preview')

            return
          }
          // --- BESTEHENDER MARKDOWN FLOW ---
          const checkResult = await handleAction(
            checkFile({ data: { fileContent } }),
            { showSuccessToast: false, showErrorToast: true },
          )

          if (checkResult.status === 'INTEGRITY_MISMATCH') {
            setPendingImportData({ content: fileContent, value, isMarkdown })
            setShowWarningModal(true)
          } else {
            await executeFinalImport(fileContent, value, isMarkdown, false)
          }
        } catch (error) {
          console.error('Check/Analyze Error:', error)
          toast.error(
            error instanceof Error ? error.message : 'Error processing file.',
          )
        }
      })
    },
  })

  const tagIds = useStore(form.store, (s) => s.values.tagIds)
  const newPrivateTags = useStore(form.store, (s) => s.values.newPrivateTags)
  const file = useStore(form.store, (s) => s.values.file)
  const canSubmit = useStore(form.store, (s) => s.canSubmit)

  const fetchSuggestions = async (val: string) => {
    const res = await getTrainerSuggestions({
      data: { query: val, loggingMetadata: { component: 'ImportForm' } },
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
        data: { loggingMetadata: { component: 'ImportForm' } },
      })
      if (res.success) setAvailableTags(res.data)
    }
    loadTags()
  }, [])
  // analysisResult && console.log('analysisResult:', analysisResult)

  // --- RENDER PREVIEW STEP ---
  if (step === 'preview' && analysisResult && htmlImportCache) {
    const { parsedCourse, trainerMatch } = analysisResult
    // Alle Trainernamen aus dem Cache holen (für Legacy)
    const trainersToShow = htmlImportCache.value.trainers

    // Prüfen, ob wir im neuen Beta-Format sind und exakte Trainer-Daten haben
    const hasExtractedInstructors =
      parsedCourse.extractedInstructors &&
      parsedCourse.extractedInstructors.length > 0

    return (
      <Card className="max-w-md w-full mx-auto shadow-lg">
        <CardHeader>
          <CardTitle>{parsedCourse.courseTitle}</CardTitle>
          {parsedCourse.courseDescription && (
            <CardDescription className="line-clamp-2 italic">
              {parsedCourse.courseDescription}
            </CardDescription>
          )}

          {/* URL Status Badges */}
          <div className="flex gap-2 mt-3">
            {parsedCourse.courseUrl ? (
              <Badge
                title={parsedCourse.courseUrl}
                className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100"
              >
                <LinkIcon className="h-3 w-3 mr-1" /> Course URL detected
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-muted-foreground opacity-50"
              >
                No Course URL
              </Badge>
            )}
            {parsedCourse.imageUrl ? (
              <Badge
                title={parsedCourse.imageUrl}
                className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100"
              >
                <ImageIcon className="h-3 w-3 mr-1" /> Thumbnail detected
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-muted-foreground opacity-50"
              >
                No Image
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              {hasExtractedInstructors
                ? 'Instructors (Auto-Detected)'
                : 'Trainer Mapping'}
            </h4>

            {hasExtractedInstructors ? (
              /* --- NEU: Ansicht für das BETA-Format --- */
              <div className="p-3 rounded-md border text-sm bg-blue-50 border-blue-200">
                <div className="flex items-center gap-2 text-blue-800 font-bold mb-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Exact Instructors Found</span>
                </div>
                <p className="text-xs text-blue-700 leading-relaxed mb-2">
                  The following instructors were automatically extracted from
                  the course data. No manual mapping is required.
                </p>
                <ul className="list-disc list-inside text-xs text-blue-800 font-medium">
                  {parsedCourse.extractedInstructors?.map(
                    (inst: any, idx: number) => (
                      <li key={idx}>{inst.name}</li>
                    ),
                  )}
                </ul>
              </div>
            ) : /* --- ALT: Fallback für das LEGACY-Format --- */
            htmlImportCache.value.trainers.length === 1 ? (
              <div
                className={cn(
                  'p-3 rounded-md border text-sm',
                  trainerMatch.isKnown
                    ? 'bg-green-50 border-green-200'
                    : 'bg-blue-50 border-blue-200',
                )}
              >
                {trainerMatch.isKnown ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-green-700 font-bold">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Profile Match Found!</span>
                    </div>
                    <p className="text-xs text-green-600">
                      The profile belongs to{' '}
                      <strong>
                        {trainerMatch.nameInDb || 'Existing Trainer'}
                      </strong>
                      . Your input "{htmlImportCache.value.trainers[0]}" will be
                      updated to match the database record.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-blue-700 font-bold">
                      <Info className="h-4 w-4" />
                      <span>New Profile detected</span>
                    </div>
                    <p className="text-xs text-blue-600">
                      Trainer{' '}
                      <strong>{htmlImportCache.value.trainers[0]}</strong> will
                      be created and linked to the detected profile URL.
                    </p>
                  </div>
                )}
                {trainerMatch.url && (
                  <p className="text-[10px] mt-2 text-muted-foreground truncate border-t pt-1 border-current/10">
                    Source URL: {trainerMatch.url}
                  </p>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-md border text-sm bg-yellow-50 border-yellow-200">
                <div className="flex items-center gap-2 text-yellow-800 font-bold mb-2">
                  <Info className="h-4 w-4" />
                  <span>Multiple Trainers Detected</span>
                </div>
                <p className="text-xs text-yellow-700 leading-relaxed">
                  You entered <strong>{trainersToShow.length}</strong> trainers.
                  To prevent accidental profile mismatches, the trainer's URL
                  from the course HTML will <strong>not</strong> be linked to
                  any of these profiles automatically.
                </p>
                <ul className="list-disc list-inside text-xs text-yellow-700 mt-2 font-medium opacity-80">
                  {trainersToShow.map((t: string) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 cursor-pointer"
            onClick={() => setStep('input')}
          >
            Back
          </Button>
          <Button
            className="flex-1 cursor-pointer"
            onClick={() =>
              executeFinalImport(
                htmlImportCache.content,
                htmlImportCache.value,
                false,
              )
            }
          >
            Final Import
          </Button>
        </CardFooter>
      </Card>
    )
  }

  // --- RENDER INPUT STEP (Default) ---
  return (
    <>
      <Card className="max-w-md w-full mx-auto">
        <CardHeader>
          <CardTitle>Import your course</CardTitle>
          <CardDescription>
            Select trainers, tags and upload your Udemy HTML notes or an
            exported markdown file from this app.
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
              <FieldLabel>Course Tags</FieldLabel>
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
                    <span className="text-[10px] text-primary/70">(New)</span>
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
                      <TagIcon className="mr-2 h-4 w-4" /> Choose Tag ...
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
                      placeholder="Search..."
                      value={tagQuery}
                      onValueChange={setTagQuery}
                    />
                    <CommandList>
                      <CommandEmpty className="p-0">
                        <button
                          type="button"
                          className="flex items-center w-full px-4 py-3 text-sm hover:bg-accent transition-colors text-primary"
                          onClick={() => {
                            if (
                              tagQuery &&
                              !newPrivateTags.includes(tagQuery)
                            ) {
                              form.setFieldValue('newPrivateTags', (prev) => [
                                ...prev,
                                tagQuery,
                              ])
                              setTagQuery('')
                            }
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" /> Create private Tag "
                          {tagQuery}"
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
                                  Private
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
                      <FieldLabel htmlFor={field.name}>
                        Course HTML or Markdown (by exporting a Course)
                      </FieldLabel>
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
                          className={cn(
                            'flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer transition-all',
                            isDragging
                              ? 'border-primary bg-primary/10 scale-[1.01]'
                              : 'border-slate-300 bg-slate-50 dark:bg-slate-900/50 dark:border-slate-700',
                            isInvalid
                              ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800',
                          )}
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
                                  Ready for processing.
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
                                  HTML or Markdown
                                </p>
                              </>
                            )}
                          </div>
                          <Input
                            id={field.name}
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept=".html,text/html,.md,text/markdown"
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
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  )
                }}
              />

              <div className="pt-4">
                <Button
                  type="submit"
                  className="w-full hover:cursor-pointer font-semibold"
                  disabled={isPending || !canSubmit || !file}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />{' '}
                      Processing...
                    </>
                  ) : (
                    'Analyze & Import'
                  )}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {/* Warn-Modal bei erkannten Manipulationen (Markdown) */}
      <AlertDialog open={showWarningModal} onOpenChange={setShowWarningModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Attention: Metadata in the file has been changed!
            </AlertDialogTitle>
            <AlertDialogDescription>
              Metadata in the file does not fit the signature.
              <br />
              <br />
              If you try to import this file, it will replace the information of
              this course in the database with the information in the file.
              <br />
              <br />
              Do you really want to import this file?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (pendingImportData) {
                  executeFinalImport(
                    pendingImportData.content,
                    pendingImportData.value,
                    pendingImportData.isMarkdown,
                    true, // forceReplace = true
                  )
                }
              }}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {isPending ? 'Overwriting ...' : 'Yes, overwrite course'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
