import React, { useState, useRef, useTransition } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { useServerFn } from '@tanstack/react-start'
import { toast } from 'sonner'
import { CloudUpload, FileText, X, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
// Ersetze diese durch deine tatsächlichen UI-Komponenten (z.B. aus deiner Jolly-UI / Shadcn Sammlung)
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'

import { importHtmlFile } from '#/data/import-export'
import { importHtmlFileSchema } from '#/schemas/import-file'
import { handleAction } from '#/lib/client-utils'

export function ImportHtmlForm() {
  const navigate = useNavigate()
  const [isPending, startTransition] = useTransition()
  const uploadFile = useServerFn(importHtmlFile)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm({
    defaultValues: {
      file: null as unknown as File,
    },
    validators: {
      onChange: importHtmlFileSchema, // Validierung bei jeder Änderung
    },
    onSubmit: async ({ value }: { value: { file: File } }) => {
      if (!value.file) {
        toast.error('Please select a file first')
        return
      }

      const formData = new FormData()
      formData.append('file', value.file)

      // Korrektur: 'loggingMetadata' statt 'loggingMetdata'
      formData.append(
        'loggingMetadata',
        JSON.stringify({ component: 'ImportHtmlForm' }),
      )

      startTransition(async () => {
        try {
          const result = await handleAction(uploadFile({ data: formData }), {
            successToast: 'Course notes processed successfully',
          })

          // Navigation zur Detailseite des neuen Kurses
          await navigate({
            to: '/courses/$courseId', // Pfad an deine Route anpassen
            params: { courseId: result.courseId },
          })
        } catch (error) {
          console.error('Submit Error:', error)
          toast.error('An unexpected error occurred during upload')
        }
      })
    },
  })

  return (
    <Card className="max-w-md w-full mx-auto">
      <CardHeader>
        <CardTitle>Import your course</CardTitle>
        <CardDescription>
          Upload the HTML file containing your Udemy course notes.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          <FieldGroup>
            <form.Field
              name="file"
              children={(field) => {
                const handleDragOver = (e: React.DragEvent) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsDragging(true)
                }

                const handleDragLeave = (e: React.DragEvent) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsDragging(false)
                }

                const handleDrop = (e: React.DragEvent) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsDragging(false)

                  const droppedFile = e.dataTransfer.files?.[0]
                  if (droppedFile) {
                    if (
                      droppedFile.type === 'text/html' ||
                      droppedFile.name.endsWith('.html')
                    ) {
                      field.handleChange(droppedFile)
                    } else {
                      toast.error('Please upload an HTML file')
                    }
                  }
                }

                const isInvalid =
                  field.state.meta.errors.length > 0 &&
                  field.state.meta.isTouched

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Course HTML</FieldLabel>

                    <div className="group relative mt-2">
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer transition-all
                          ${isDragging ? 'border-primary bg-primary/10 scale-[1.01]' : 'border-slate-300 bg-slate-50'}
                          ${isInvalid ? 'border-red-500 bg-red-50' : 'hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900'}
                        `}
                      >
                        <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center pointer-events-none">
                          {field.state.value ? (
                            <>
                              <div className="p-3 bg-primary/10 rounded-full mb-3">
                                <FileText className="w-8 h-8 text-primary" />
                              </div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {field.state.value.name}
                              </p>
                              <p className="text-xs text-slate-500 mt-1">
                                Successfully attached. Click to change.
                              </p>
                            </>
                          ) : (
                            <>
                              <CloudUpload
                                className={`w-10 h-10 mb-3 ${isInvalid ? 'text-red-500' : 'text-slate-400'}`}
                              />
                              <p className="mb-2 text-sm text-slate-700 dark:text-slate-300 font-medium">
                                Click to upload{' '}
                                <span className="text-slate-400 font-normal">
                                  or drag and drop
                                </span>
                              </p>
                              <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">
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
                            if (e.target.files?.[0]) {
                              field.handleChange(e.target.files[0])
                            }
                          }}
                        />
                      </div>

                      {field.state.value && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 h-8 w-8 rounded-full z-10 hover:cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation()
                            field.handleChange(null as any)
                            if (fileInputRef.current)
                              fileInputRef.current.value = ''
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <FieldDescription>
                      After import, you can find the course in your list.
                    </FieldDescription>

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
                className="w-full hover:cursor-pointer"
                disabled={isPending || !form.state.canSubmit}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  'Import file'
                )}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
