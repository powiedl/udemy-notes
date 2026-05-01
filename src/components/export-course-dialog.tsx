import { ReactElement, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import { Button } from './ui/button'

type ExportCourseDialogProps = {
  children: ReactElement
  onClick: (e: React.MouseEvent) => void
  type: 'button' | 'submit' | 'reset'
  className: string
  disabled: boolean
}
const ExportCourseDialog = ({
  children,
  onClick,
  type,
  className,
  disabled,
}: ExportCourseDialogProps) => {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger disabled={disabled} asChild>
        <Button type={type}>{children}</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Export Course</DialogTitle>
          <DialogDescription>
            Set the parameters for the export and then click the Export button
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type={type}
            className={className}
            disabled={disabled}
            onClick={(e) => {
              e.preventDefault()
              setOpen(false)
              onClick(e)
            }}
          >
            {children}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
export default ExportCourseDialog
