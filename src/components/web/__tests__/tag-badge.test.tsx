// @vitest-environment jsdom
// ^^^ WICHTIG: Diese erste Zeile sagt Vitest, dass hier ein Browser simuliert werden muss!

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest' // Schaltet Befehle wie .toBeInTheDocument() frei

//import TagBadge from '../tag-badge'
import TagBadge from '#/components/web/tag-badge' // <-- Pfad zu deiner Komponente anpassen!
import { Link2 } from 'lucide-react'
import { afterEach } from 'node:test'

afterEach(() => {
  cleanup()
})
describe('TagBadge', () => {
  const baseTag = { id: 'tag-1', name: 'React', userId: 'user-1' }
  it('rendert den Namen des Tags korrekt', () => {
    render(<TagBadge tag={baseTag} />)
    expect(screen.getByText('React')).toBeInTheDocument()
  })

  it('zeigt einen Löschen-Button und feuert das Event, wenn onDelete übergeben wird', () => {
    // vi.fn() erstellt eine Mock-Funktion, um Klicks zu überwachen
    const mockDelete = vi.fn()

    render(<TagBadge tag={baseTag} onDelete={mockDelete} />)

    // Sucht nach dem HTML-Button-Element
    const deleteBtn = screen.getByRole('button')
    expect(deleteBtn).toBeInTheDocument()

    // Simuliert einen Klick auf den Button
    fireEvent.click(deleteBtn)
    expect(mockDelete).toHaveBeenCalledTimes(1)
  })

  it('rendert den übergebenen Tooltip (title)', () => {
    render(<TagBadge tag={baseTag} title="Inherited from course" />)

    // Wir suchen das Element über das HTML 'title' Attribut
    const badgeElement = screen.getByTitle('Inherited from course')
    expect(badgeElement).toBeInTheDocument()
  })

  it('rendert ein benutzerdefiniertes Icon (z.B. Link-Icon für Vererbung)', () => {
    // Wir übergeben das Icon exakt so, wie dein TagManager es tut
    const customIcon = <Link2 data-testid="link-icon" className="h-3 w-3" />

    render(<TagBadge tag={baseTag} icon={customIcon} />)

    // Teste, ob das übergebene React-Element im DOM ankommt
    expect(screen.getByTestId('link-icon')).toBeInTheDocument()
  })

  it('versteckt den Löschen-Button, wenn KEIN onDelete übergeben wird', () => {
    cleanup()
    render(<TagBadge tag={baseTag} onDelete={undefined} />)

    // queryByTestId gibt null zurück, wenn es nicht da ist.
    // Das ist der sicherste Test in der React Testing Library.
    const deleteBtn = screen.queryByTestId('tag-delete-button')
    expect(deleteBtn).not.toBeInTheDocument()
  })

  it('verwendet blaue Hintergrund- oder Textfarben für private Tags (isPrivate)', () => {
    cleanup()
    const privateTag = { id: 't1', name: 'Privat', userId: 'user-123' }

    const { container } = render(<TagBadge tag={privateTag} />)
    const badge = container.querySelector('[data-slot="badge"]')
    const className = badge?.className || ''

    // Wir prüfen spezifisch auf die Tailwind-Präfixe für Farben
    // Das Regex /bg-blue|text-blue/ findet "bg-blue-100" oder "text-blue-700"
    expect(className).toMatch(/bg-blue|text-blue/)

    // Sicherstellen, dass kein Violett/Lila (der alte Zustand) vorhanden ist
    expect(className).not.toMatch(/bg-violet|text-violet|bg-purple|text-purple/)
  })

  it('verwendet Schiefer/Grautöne für öffentliche/geerbte Tags', () => {
    cleanup()
    const publicTag = { id: 't2', name: 'Kurs-Tag', userId: null }

    const { container } = render(<TagBadge tag={publicTag} />)
    const badge = container.querySelector('[data-slot="badge"]')
    const className = badge?.className || ''

    // Prüfen auf Slate (deine Glassmorphismus-Wahl) oder Gray/Zinc als Fallback
    expect(className).toMatch(/bg-slate|text-slate|bg-gray|bg-white\/10/)
  })
})
