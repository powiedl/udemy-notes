import { uploadHtmlFile } from '#/data/upload'
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { useForm } from '@tanstack/react-form'
import { useNavigate } from '@tanstack/react-router'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { uploadFileSchema } from '#/schemas/upload-file'
import type { UploadFileSchema } from '#/schemas/upload-file'
import { logClientError } from '#/data/logger'

function downloadBlob(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function UploadForm() {
  const navigate = useNavigate()
  const [isPending, startTransition] = useTransition()
  const uploadFile = useServerFn(uploadHtmlFile)
  const logToDb = useServerFn(logClientError)
  const form = useForm({
    validators: {
      onSubmit: uploadFileSchema,
    },
    onSubmit: ({ value }: { value: UploadFileSchema }) => {
      logToDb({
        data: {
          component: 'UploadForm-Client',
          severity: 'info',
          message: 'Upload on client started',
        },
      })
      const formData = new FormData()
      formData.append('file', value.file)
      startTransition(async () => {
        try {
          const result = await uploadFile({ data: formData })
          if (result.markdownContent) {
            const fileName =
              result.originalFileName.replace(/\.[^/.]+$/, '') + '.md'

            // Download auslösen
            downloadBlob(result.markdownContent, fileName)
            await logToDb({
              data: {
                component: 'UploadForm-Client',
                severity: 'info',
                message: 'Upload on client finished successful',
              },
            })
            toast.success(
              'Course notes processed successfully (and .MD file downloaded)',
            )
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
        <CardTitle>Upload your course</CardTitle>

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
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Course HTML</FieldLabel>

                    <Input
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
                    />

                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />

            <Field>
              <Button disabled={isPending}>
                {isPending ? 'Uploading ...' : 'Upload file'}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
