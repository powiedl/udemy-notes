import { useEffect, useState } from 'react'
import { useSettings } from '#/hooks/use-user-settings.hook'
import type { UITheme } from '#/types/ui.type' // Passe den Pfad an, wo deine UITheme Typen liegen

// Helper-Funktion bleibt, nur 'auto' wurde zu 'system'
function applyThemeMode(mode: UITheme) {
  // SSR Check: Wenn window nicht definiert ist, tun wir am Server nichts.
  if (typeof window === 'undefined') return

  window.localStorage.setItem('theme-cache', mode)

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode

  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(resolved)

  if (mode === 'system') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', mode)
  }

  document.documentElement.style.colorScheme = resolved
}

export default function ThemeToggle() {
  const { settings, updateSettings, isLoading } = useSettings()
  const [fallbackMode, setFallbackMode] = useState<UITheme>('system')
  // 2. Aktuellen Modus ableiten (Fallback auf 'system', falls nicht eingeloggt oder ladend)
  const mode = settings?.ui.theme || fallbackMode

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('theme-cache')

      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setFallbackMode(stored)
      }
    }
  }, [])

  useEffect(() => {
    // Verhindert das "Zurückfallen auf System", während der Cache/DB noch lädt.
    // Das Script im <head> hat die UI ohnehin schon gerettet.
    if (isLoading) return

    applyThemeMode(mode)
  }, [mode, isLoading]) // isLoading als Dependency hinzufügen

  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined') return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      // WICHTIG: Auch beim OS-Wechsel darf es nicht vom Loading-State blockiert werden
      if (!isLoading) applyThemeMode('system')
    }

    media.addEventListener('change', onChange)
    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [mode, isLoading])

  function toggleMode() {
    // Nächsten State berechnen: light -> dark -> system -> light
    const nextMode: UITheme =
      mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light'
    applyThemeMode(nextMode)
    setFallbackMode(nextMode)

    // Einfach an den Server schicken!
    // Der Hook updatet optimistisch den Cache -> Komponente rendert neu -> useEffect greift -> Theme ändert sich.
    updateSettings({ ui: { theme: nextMode } }).catch(() => {}) // der .catch is nur dazu da, den Fehler - falls wir nicht angemeldet sind - zu ignorieren (dann ist klar, dass wir es nicht in die Datenbank schreiben können ...)
  }

  const label =
    mode === 'system'
      ? 'Theme mode: system. Click to switch to light mode.'
      : `Theme mode: ${mode}. Click to switch mode.`

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={label}
      title={label}
      className="rounded-full border border-(--chip-line) bg-(--chip-bg) px-3 py-1.5 text-sm font-semibold text-(--sea-ink) shadow-[0_8px_22px_rgba(30,90,72,0.08)] transition hover:-translate-y-0.5 hover:cursor-pointer"
    >
      {mode === 'system' ? 'System' : mode === 'dark' ? 'Dark' : 'Light'}
    </button>
  )
}
