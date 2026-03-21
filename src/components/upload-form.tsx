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
  const form = useForm({
    validators: {
      onSubmit: uploadFileSchema,
    },
    onSubmit: ({ value }: { value: UploadFileSchema }) => {
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
            toast.success(
              'Course notes processed successfully (and .MD file downloaded)',
            )
          }
        } catch (error) {
          toast.error('Upload failed')
        }
      })
    },
  })

  /*
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formElement = e.currentTarget
    const formData = new FormData(formElement)

    try {
      const result = await uploadFile({ data: formData })
      console.log('Upload successful:', result)
      alert(
        `File uploaded successfully! Markdown saved to: ${result.markdownFile}`,
      )
    } catch (error: unknown) {
      console.error('Upload failed:', error)
      alert(
        error instanceof Error
          ? 'Upload failed: ' + error.message
          : 'Upload failed',
      )
    }
  }
*/

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
