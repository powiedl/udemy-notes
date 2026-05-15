// @vitest-environment jsdom
// ^^^ WICHTIG: Diese erste Zeile sagt Vitest, dass hier ein Browser simuliert werden muss!

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest' // Schaltet Befehle wie .toBeInTheDocument() frei

import TagBadge from '../tag-badge' // <-- Pfad zu deiner Komponente anpassen!
import { Link2 } from 'lucide-react'

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

    // Sucht nach dem Button über sein title-Attribut (sicherer als getByRole bei mehreren Buttons)
    const deleteBtn = screen.getByTitle('remove tag')
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

    // queryByTitle gibt null zurück, wenn es nicht da ist.
    // Das ist der sicherste Test in der React Testing Library.
    const deleteBtn = screen.queryByTitle('remove tag')
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

  // ==========================================
  // NEU: AI Suggestions & Read-Only
  // ==========================================
  describe('AI Suggestions (SUGGESTION)', () => {
    const suggestionTag = { ...baseTag, status: 'SUGGESTION' as const }

    it('zeigt ACCEPT und REJECT Buttons, wenn Handler übergeben werden (Edit Mode)', () => {
      render(
        <TagBadge tag={suggestionTag} onApprove={vi.fn()} onDelete={vi.fn()} />,
      )
      // Der klickbare Haken muss da sein
      expect(screen.getByTitle('accept tag')).toBeInTheDocument()
      // Das Ablehnen-X (reject) muss da sein
      expect(screen.getByTitle('reject suggestion')).toBeInTheDocument()
      // Das Read-Only Sparkle-Icon darf NICHT da sein
      expect(screen.queryByTitle('AI suggestion')).not.toBeInTheDocument()
    })
  })

  // ==========================================
  // Inline-Editing (Rename) Feature
  // ==========================================
  describe('Inline-Editing (Rename) Feature', () => {
    const privateTag = { id: 'tag-1', name: 'React', userId: 'user-1' }

    it('feuert onStartEdit, wenn ein privates Tag geklickt wird', () => {
      const mockStartEdit = vi.fn()
      // onRename muss übergeben werden, da wir im Code prüfen: isPrivate && onRename && !isEditing
      render(
        <TagBadge
          tag={privateTag}
          onStartEdit={mockStartEdit}
          onRename={vi.fn()}
        />,
      )

      const badgeText = screen.getByText('React')
      fireEvent.click(badgeText)

      expect(mockStartEdit).toHaveBeenCalledTimes(1)
    })

    it('feuert onStartEdit NICHT, wenn es ein globales Tag ist, selbst wenn die Funktion übergeben wird', () => {
      const publicTag = { id: 'tag-2', name: 'Global', userId: null } // userId ist null!
      const mockStartEdit = vi.fn()

      render(
        <TagBadge
          tag={publicTag}
          onStartEdit={mockStartEdit}
          onRename={vi.fn()}
        />,
      )

      const badgeText = screen.getByText('Global')
      fireEvent.click(badgeText)

      // Erwartung: Wurde exakt 0 mal aufgerufen
      expect(mockStartEdit).not.toHaveBeenCalled()
    })

    it('zeigt ein Input-Feld, wenn isEditing true ist', () => {
      render(<TagBadge tag={privateTag} isEditing={true} />)

      // Sucht nach einem Element, in dem "React" als Wert (value) steht
      const input = screen.getByDisplayValue('React')

      expect(input).toBeInTheDocument()
      expect(input.tagName.toLowerCase()).toBe('input') // Stellt sicher, dass es wirklich das Textfeld ist
    })

    it('speichert die Änderung bei Druck auf die Enter-Taste', () => {
      const mockRename = vi.fn()
      render(
        <TagBadge tag={privateTag} isEditing={true} onRename={mockRename} />,
      )

      const input = screen.getByDisplayValue('React')

      // 1. Simuliere das Tippen (ändert den internen tempName)
      fireEvent.change(input, { target: { value: 'React 19' } })

      // 2. Simuliere den Tastendruck 'Enter'
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

      // Prüfe, ob die Funktion mit dem NEUEN Namen aufgerufen wurde
      expect(mockRename).toHaveBeenCalledWith('React 19')
      expect(mockRename).toHaveBeenCalledTimes(1)
    })

    it('bricht die Änderung ab, wenn Escape gedrückt wird', () => {
      const mockCancel = vi.fn()
      render(
        <TagBadge
          tag={privateTag}
          isEditing={true}
          onCancelEdit={mockCancel}
        />,
      )

      const input = screen.getByDisplayValue('React')

      fireEvent.change(input, { target: { value: 'React 19' } })
      fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' })

      // onCancelEdit muss gefeuert werden
      expect(mockCancel).toHaveBeenCalledTimes(1)
    })

    it('speichert die Änderung automatisch, wenn das Input-Feld den Fokus verliert (onBlur)', () => {
      const mockRename = vi.fn()
      render(
        <TagBadge tag={privateTag} isEditing={true} onRename={mockRename} />,
      )

      const input = screen.getByDisplayValue('React')

      fireEvent.change(input, { target: { value: 'React 19' } })

      // Simuliere einen Klick irgendwo anders hin
      fireEvent.blur(input)

      expect(mockRename).toHaveBeenCalledWith('React 19')
    })
  })
})
