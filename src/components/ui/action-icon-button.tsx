import { forwardRef } from 'react'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'

export interface ActionIconButtonProps extends React.ComponentPropsWithoutRef<
  typeof Button
> {
  actionVariant?: 'purple' | 'outline' | 'ghost'
  actionSize?: 'sm' | 'md'
}

export const ActionIconButton = forwardRef<
  HTMLButtonElement,
  ActionIconButtonProps
>(
  (
    {
      className,
      actionVariant = 'outline',
      actionSize = 'sm',
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const isPurple = actionVariant === 'purple'

    return (
      <Button
        ref={ref}
        type="button"
        // Wir mappen unsere actionVariant auf die echten Shadcn-Varianten
        variant={isPurple ? 'default' : actionVariant}
        size="icon"
        disabled={disabled}
        className={cn(
          // Basis-Klassen für alle ActionIconButtons
          'transition-all duration-200 cursor-pointer shrink-0 flex items-center justify-center',

          // Größen-Klassen
          actionSize === 'sm' && 'h-4 w-6 rounded-md',
          actionSize === 'md' && 'h-6 w-8 rounded-lg', // Größer für den Header

          // Spezifisches Styling für die 'purple' Variante
          isPurple &&
            'bg-primary hover:bg-primary border-transparent shadow-sm hover:brightness-110 active:scale-95',

          // Spezifisches Styling für 'outline'
          actionVariant === 'outline' && 'border-dashed hover:border-primary',

          // Erlaubt das Überschreiben / Ergänzen von außen (z.B. ml-1 oder opacity-0)
          className,
        )}
        {...props}
      >
        {children}
      </Button>
    )
  },
)

ActionIconButton.displayName = 'ActionIconButton'
