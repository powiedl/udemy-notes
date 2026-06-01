import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import { Button } from './ui/button'
import { useForm } from '@tanstack/react-form'
import { exportMdFileSchema } from '#/schemas/export-file.schema'
import type { ExportMdFileSchema } from '#/schemas/export-file.schema'
import { DEFAULT_EXPORT_SETTINGS } from '#/lib/constants.lib'
import { useSettings } from '#/hooks/use-user-settings.hook' // <-- NEU: Unser Custom Hook
import { Field, FieldError, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { Checkbox } from './ui/checkbox'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'
import { FormDebugger } from './web/form-debugger'

type ExportCourseDialogProps = {
  isAdmin?: boolean
  courseId: string
  children: ReactElement
  className: string
  disabled: boolean
  onExportSubmit: (data: ExportMdFileSchema) => void
}

const ExportCourseDialog = ({
  courseId,
  isAdmin = false,
  children,
  className,
  disabled,
  onExportSubmit,
}: ExportCourseDialogProps) => {
  const [open, setOpen] = useState(false)

  // 1. Settings und Mutations-Funktion aus unserem Hook holen
  const { settings, updateSettings, isUpdating } = useSettings()

  const form = useForm({
    // 2. defaultValues dynamisch zusammensetzen (Konstante -> DB Settings -> prop)
    defaultValues: {
      ...DEFAULT_EXPORT_SETTINGS,
      ...(settings?.export || {}),
      courseId,
    },
    validators: {
      onChange: exportMdFileSchema,
      onMount: exportMdFileSchema,
    },
    onSubmit: async ({ value }) => {
      // 3. courseId abspalten, da wir nur die reinen Settings in der DB speichern wollen
      const { courseId: _, ...exportSettingsToSave } = value

      // 4. Einstellungen asynchron im Hintergrund speichern (Cache updatet sich automatisch!)
      await updateSettings({ export: exportSettingsToSave })

      setOpen(false)
      // 5. Den eigentlichen Export-Vorgang anstoßen
      onExportSubmit(value)
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger disabled={disabled} asChild>
        <Button type="button" className={className}>
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Export Course</DialogTitle>
          <DialogDescription>
            Set the parameters for the export and then click the Export button
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
          className="space-y-6"
        >
          {/* courseId (Hidden aber Teil des Forms) */}
          <form.Field
            name="courseId"
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={isInvalid} className="hidden">
                  <FieldLabel htmlFor={field.name}>Course Id</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                    autoComplete="off"
                    type="text"
                    readOnly
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          />
          <div className="flex flex-row gap-x-6">
            {/* includeCourseTags */}
            <form.Field
              name="includeCourseTags"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <div className="flex flex-row items-center gap-x-2">
                      <Checkbox
                        id={field.name}
                        name={field.name}
                        checked={field.state.value}
                        onBlur={field.handleBlur}
                        onCheckedChange={(checked) =>
                          field.handleChange(checked === true)
                        }
                        aria-invalid={isInvalid}
                      />
                      <FieldLabel
                        htmlFor={field.name}
                        className="font-normal cursor-pointer leading-none m-0"
                      >
                        Include course tags
                      </FieldLabel>
                    </div>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />

            {/* includeTrainers */}
            <form.Field
              name="includeTrainers"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <div className="flex flex-row items-center gap-x-2">
                      <Checkbox
                        id={field.name}
                        name={field.name}
                        checked={field.state.value}
                        onBlur={field.handleBlur}
                        onCheckedChange={(checked) =>
                          field.handleChange(checked === true)
                        }
                        aria-invalid={isInvalid}
                      />
                      <FieldLabel
                        htmlFor={field.name}
                        className="font-normal cursor-pointer leading-none m-0"
                      >
                        Include trainers
                      </FieldLabel>
                    </div>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />
          </div>
          <div className="flex flex-row gap-x-6">
            {/* includeCourseDescription */}
            <form.Field
              name="includeCourseDescription"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <div className="flex flex-row items-center gap-x-2">
                      <Checkbox
                        id={field.name}
                        name={field.name}
                        checked={field.state.value}
                        onBlur={field.handleBlur}
                        onCheckedChange={(checked) =>
                          field.handleChange(checked === true)
                        }
                        aria-invalid={isInvalid}
                      />
                      <FieldLabel
                        htmlFor={field.name}
                        className="font-normal cursor-pointer leading-none m-0"
                      >
                        Include course description
                      </FieldLabel>
                    </div>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />

            {/* includeCourseLinks */}
            <form.Field
              name="includeCourseLinks"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <div className="flex flex-row items-center gap-x-2">
                      <Checkbox
                        id={field.name}
                        name={field.name}
                        checked={field.state.value}
                        onBlur={field.handleBlur}
                        onCheckedChange={(checked) =>
                          field.handleChange(checked === true)
                        }
                        aria-invalid={isInvalid}
                      />
                      <FieldLabel
                        htmlFor={field.name}
                        className="font-normal cursor-pointer leading-none m-0"
                      >
                        Include links (course, image and trainer)
                      </FieldLabel>
                    </div>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />
          </div>
          <div className="flex flex-row gap-x-6">
            {/* includeNoteTags */}
            <form.Field
              name="includeNoteTags"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <div className="flex flex-row items-center gap-x-2">
                      <Checkbox
                        id={field.name}
                        name={field.name}
                        checked={field.state.value}
                        onBlur={field.handleBlur}
                        onCheckedChange={(checked) =>
                          field.handleChange(checked === true)
                        }
                        aria-invalid={isInvalid}
                      />
                      <FieldLabel
                        htmlFor={field.name}
                        className="font-normal cursor-pointer leading-none m-0"
                      >
                        Include note tags
                      </FieldLabel>
                    </div>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />

            {/* includeNotesMetadata */}
            <form.Field
              name="includeNotesMetadata"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <div className="flex flex-row items-center gap-x-2">
                      <Checkbox
                        id={field.name}
                        name={field.name}
                        checked={field.state.value}
                        onBlur={field.handleBlur}
                        onCheckedChange={(checked) =>
                          field.handleChange(checked === true)
                        }
                        aria-invalid={isInvalid}
                      />
                      <FieldLabel
                        htmlFor={field.name}
                        className="font-normal cursor-pointer leading-none m-0"
                      >
                        Include note metadata
                      </FieldLabel>
                    </div>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />
          </div>
          {/* noteVersion (Radio Group) */}
          <form.Field
            name="noteVersion"
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel>Note Version to Export</FieldLabel>
                  <RadioGroup
                    onValueChange={(value) => field.handleChange(value as any)}
                    defaultValue={field.state.value}
                    onBlur={field.handleBlur}
                    className="flex flex-col space-y-2 mt-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="original"
                        id={`${field.name}-original`}
                      />
                      <label
                        htmlFor={`${field.name}-original`}
                        className="text-sm font-normal cursor-pointer leading-none"
                      >
                        Original Note
                      </label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="edited_with_fallback"
                        id={`${field.name}-edited`}
                      />
                      <label
                        htmlFor={`${field.name}-edited`}
                        className="text-sm font-normal cursor-pointer leading-none"
                      >
                        Edited Note (Fallback to Original)
                      </label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="both" id={`${field.name}-both`} />
                      <label
                        htmlFor={`${field.name}-both`}
                        className="text-sm font-normal cursor-pointer leading-none"
                      >
                        Both Versions
                      </label>
                    </div>
                  </RadioGroup>

                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              className={className}
              // Button wird deaktiviert, wenn das Formular speichert ODER die Server Function gerade schreibt
              disabled={disabled || form.state.isSubmitting || isUpdating}
            >
              {isUpdating ? 'Saving...' : children}
            </Button>
          </div>
          {isAdmin && <FormDebugger form={form} schema={exportMdFileSchema} />}
        </form>
      </DialogContent>
    </Dialog>
  )
}
export default ExportCourseDialog
