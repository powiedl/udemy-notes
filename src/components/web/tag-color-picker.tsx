import React, { useState, useRef, useEffect } from 'react'
import { cn } from '#/lib/utils.lib'
import { tagColorEnum } from '#/schemas/tag.schema'
import type { TagColor } from '#/schemas/tag.schema'
import { Check } from 'lucide-react'

const colorMap: Record<TagColor, string> = {
  blue: 'bg-blue-500',
  cyan: 'bg-cyan-500',
  green: 'bg-green-500',
  red: 'bg-red-500',
  yellow: 'bg-yellow-400',
}

interface TagColorPickerProps {
  currentColor: TagColor
  onColorChange: (newColor: TagColor) => void
  disabled?: boolean
  isLoading?: boolean
}

export default function TagColorPicker({
  currentColor,
  onColorChange,
  disabled,
  isLoading,
}: TagColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [tempColor, setTempColor] = useState<TagColor>(currentColor)
  const containerRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null) // NEU: Timer Referenz
  const wasLoading = useRef(isLoading)

  // Schließt den Picker automatisch, wenn der Ladevorgang abgeschlossen ist
  useEffect(() => {
    if (wasLoading.current && !isLoading && isOpen) {
      setIsOpen(false)
    }
    wasLoading.current = isLoading
  }, [isLoading, isOpen])

  // Hilfsfunktion zum Aufräumen des Timers
  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  // Schließt den Picker bei Klick außerhalb
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Während des Speicherns lassen wir den Picker offen für visuelles Feedback
      if (isLoading) return

      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        clearTimer() // Timer killen, wenn wir schließen
        setIsOpen(false)
        setTempColor(currentColor)
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, currentColor, isLoading])

  const handleCircleClick = (e: React.MouseEvent, color: TagColor) => {
    e.preventDefault()
    e.stopPropagation()

    if (disabled || isLoading) return

    // 1. Klick: Öffnen
    if (!isOpen) {
      setIsOpen(true)
      setTempColor(currentColor)
      return
    }

    // 2. Klick (oder Folgeklick): Farbe setzen und Timer starten
    setTempColor(color)
    clearTimer() // Alten Timer löschen, falls Benutzer schnell klickt

    if (color === tempColor) {
      // Wenn der User die aktuelle Farbe erneut klickt, sofort speichern
      onColorChange(color)
    } else {
      // NEU: Timer starten (2 Sekunden)
      timerRef.current = setTimeout(() => {
        onColorChange(color)
      }, 2000)
    }
  }

  return (
    <div
      ref={containerRef}
      onClick={(e) => {
        e.stopPropagation() // Verhindert Durchklicken auf das TagBadge
      }}
      className={cn(
        'absolute -bottom-1 -left-1 z-50 flex items-center rounded-full transition-all duration-300 ease-out origin-left cursor-auto',
        isOpen
          ? 'bg-background shadow-md border p-1 gap-1.5 w-29 h-6 opacity-100'
          : 'bg-transparent border-transparent p-0 w-3.5 h-3.5 opacity-100', // w-3.5 passend zum Kreis
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      {isOpen ? (
        isLoading ? (
          <div className="flex items-center justify-center gap-1 w-full h-full">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="size-1.5 bg-muted-foreground rounded-full animate-pulse"
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
        ) : (
          tagColorEnum.options.map((color, index) => (
            <button
              key={color}
              type="button"
              onClick={(e) => handleCircleClick(e, color)}
              className={cn(
                'relative rounded-full transition-all shrink-0 cursor-pointer',
                // ANIMATION: Die Kreise fliegen von links ein, vergrößern sich aus dem Nichts und faden ein
                'animate-in zoom-in-0 fade-in slide-in-from-left-2 duration-300',
                tempColor === color
                  ? 'w-4 h-4 ring-2 ring-primary ring-offset-1'
                  : 'w-3.5 h-3.5 hover:scale-110',
                colorMap[color],
              )}
              // STAGGER-EFFEKT: Jeder Kreis wartet (Index * 35 Millisekunden), bevor er herauswächst
              style={{
                animationDelay: `${index * 35}ms`,
                animationFillMode: 'both',
              }}
              title={color}
            >
              {tempColor === color && (
                <Check className="absolute inset-0 m-auto size-2.5 text-white drop-shadow-md" />
              )}
            </button>
          ))
        )
      ) : (
        <button
          type="button"
          onClick={(e) => handleCircleClick(e, currentColor)}
          className={cn(
            'w-3.5 h-3.5 rounded-full border border-background shadow-sm hover:scale-110 transition-transform shrink-0 cursor-pointer',
            // BUNTER KREIS: Nutzt das Tailwind Theme um ein fließendes Farbrad zu generieren
            'bg-[conic-gradient(from_0deg,var(--color-blue-500),var(--color-cyan-500),var(--color-green-500),var(--color-yellow-400),var(--color-red-500),var(--color-blue-500))]',
          )}
        />
      )}
    </div>
  )
}
