import { importHtmlFile } from '#/data/import-export'
import { useServerFn } from '@tanstack/react-start'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { useForm } from '@tanstack/react-form'
import { useNavigate } from '@tanstack/react-router'
import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { importHtmlFileSchema } from '#/schemas/import-file'
import type { ImportHtmlFileSchema } from '#/schemas/import-file'
import { logClientError } from '#/data/logger'
import { CloudUpload, FileText, X } from 'lucide-react'

export function ImportHtmlForm() {
  const navigate = useNavigate()
  const [isPending, startTransition] = useTransition()
  const uploadFile = useServerFn(importHtmlFile)
  const logToDb = useServerFn(logClientError)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm({
    validators: {
      onSubmit: importHtmlFileSchema,
    },
    onSubmit: ({ value }: { value: ImportHtmlFileSchema }) => {
      const formData = new FormData()
      formData.append('file', value.file)
      startTransition(async () => {
        try {
          const result = await uploadFile({ data: formData })
          if (result.markdownContent) {
            toast.success('Course notes processed successfully')
            navigate({
              to: `/courses/$courseId`,
              params: { courseId: result.courseId },
            })
          }
        } catch (error) {
          await logToDb({
            data: {
              component: 'UploadForm-Client',
              severity: 'error',
              message: 'Upload on client failed',
            },
          })
          toast.error('Upload failed')
        }
      })
    },
  })

  return (
    <Card className="max-w-md w-full">
      <CardHeader>
        <CardTitle>Import your course</CardTitle>

        <CardDescription>
          Upload the html file containing your course notes
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()

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
                      // Hier funktioniert es jetzt!
                      field.handleChange(droppedFile)
                    } else {
                      toast.error('Please upload an HTML file')
                    }
                  }
                }
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Course HTML</FieldLabel>
                    <div
                      className="w-full"
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      <div className="group relative">
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
                                  {(field.state.value as File).name}
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

                          {/* Versteckter Input für den Standard-Dialog */}
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
                            className="absolute top-2 right-2 h-8 w-8 rounded-full cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation() // Verhindert, dass der File-Dialog wieder aufgeht
                              field.handleChange(null as any)
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {/* <Input
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          field.handleChange(e.target.files[0])
                        }
                      }}
                      aria-invalid={isInvalid}
                      accept=".html,text/html"
                      placeholder="Enter the HTML Course file"
                      type="file"
                    /> */}
                    <FieldDescription>
                      After import you can export all your notes of the course
                      in the course details (as a markdown file)
                    </FieldDescription>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />

            <Field>
              <Button disabled={isPending}>
                {isPending ? 'Importing ...' : 'Import file'}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
