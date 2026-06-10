/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import TagColorPicker from '../tag-color-picker' // Pfad ggf. anpassen

describe('TagColorPicker', () => {
  beforeEach(() => {
    // Vor jedem Test stellen wir sicher, dass wir echte Timer haben,
    // es sei denn, ein spezifischer Test überschreibt das.
    vi.useRealTimers()
  })

  afterEach(() => {
    // Nach jedem Test alles aufräumen
    vi.restoreAllMocks()
  })

  it('rendert initial im geschlossenen Zustand', () => {
    render(<TagColorPicker currentColor="blue" onColorChange={vi.fn()} />)

    // Im geschlossenen Zustand gibt es nur EINEN Button (den bunten Kreis)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)

    // Die Farbauswahl-Buttons (mit title) dürfen noch nicht da sein
    expect(screen.queryByTitle('red')).not.toBeInTheDocument()
  })

  it('öffnet sich beim Klick und zeigt alle Farben', () => {
    render(<TagColorPicker currentColor="blue" onColorChange={vi.fn()} />)

    // Klick auf den bunten Ausgangskreis
    fireEvent.click(screen.getByRole('button'))

    // Jetzt sollten alle 5 Farb-Buttons gerendert sein
    expect(screen.getByTitle('blue')).toBeInTheDocument()
    expect(screen.getByTitle('red')).toBeInTheDocument()
    expect(screen.getByTitle('yellow')).toBeInTheDocument()
    expect(screen.getByTitle('green')).toBeInTheDocument()
    expect(screen.getByTitle('cyan')).toBeInTheDocument()
  })

  it('ignoriert Klicks im disabled Zustand', () => {
    render(
      <TagColorPicker
        currentColor="blue"
        onColorChange={vi.fn()}
        disabled={true}
      />,
    )

    const triggerButton = screen.getByRole('button')
    fireEvent.click(triggerButton)

    // Darf nicht aufgehen
    expect(screen.queryByTitle('red')).not.toBeInTheDocument()
  })

  it('speichert die neue Farbe automatisch nach 2 Sekunden (Timer)', () => {
    // Wir täuschen die Zeit vor
    vi.useFakeTimers()
    const mockOnChange = vi.fn()

    render(<TagColorPicker currentColor="blue" onColorChange={mockOnChange} />)

    // 1. Öffnen
    fireEvent.click(screen.getByRole('button'))

    // 2. Rot anklicken
    fireEvent.click(screen.getByTitle('red'))

    // Die Funktion darf noch nicht aufgerufen worden sein
    expect(mockOnChange).not.toHaveBeenCalled()

    // 3. Zeit um 1999ms vorspulen -> immer noch nicht aufgerufen
    act(() => {
      vi.advanceTimersByTime(1999)
    })
    expect(mockOnChange).not.toHaveBeenCalled()

    // 4. Den letzten Millisekunden-Schritt machen
    act(() => {
      vi.advanceTimersByTime(1)
    })

    // Jetzt MUSS gespeichert worden sein
    expect(mockOnChange).toHaveBeenCalledWith('red')
    expect(mockOnChange).toHaveBeenCalledTimes(1)
  })

  it('speichert die Farbe sofort, wenn man denselben Kreis ein zweites Mal anklickt', () => {
    const mockOnChange = vi.fn()
    render(<TagColorPicker currentColor="blue" onColorChange={mockOnChange} />)

    // Öffnen
    fireEvent.click(screen.getByRole('button'))

    const redButton = screen.getByTitle('red')

    // Erster Klick (wählt aus, startet internen Timer)
    fireEvent.click(redButton)
    expect(mockOnChange).not.toHaveBeenCalled()

    // Zweiter Klick (erkennt tempColor === color und speichert sofort)
    fireEvent.click(redButton)

    expect(mockOnChange).toHaveBeenCalledWith('red')
    expect(mockOnChange).toHaveBeenCalledTimes(1)
  })

  it('bricht den Vorgang ab und schließt sich, wenn man woanders hin klickt', () => {
    const mockOnChange = vi.fn()
    render(<TagColorPicker currentColor="blue" onColorChange={mockOnChange} />)

    // Öffnen
    fireEvent.click(screen.getByRole('button'))

    // Rot anklicken (als "Preselection")
    fireEvent.click(screen.getByTitle('red'))

    // Irgendwoanders auf das Dokument klicken
    act(() => {
      fireEvent.mouseDown(document.body)
    })

    // Nichts wurde gespeichert
    expect(mockOnChange).not.toHaveBeenCalled()

    // Picker ist wieder zu (nur 1 Button)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('zeigt den Loading-State korrekt an und schließt automatisch nach Beendigung', () => {
    const { rerender } = render(
      <TagColorPicker currentColor="blue" onColorChange={vi.fn()} />,
    )

    // 1. Öffnen
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByTitle('red')).toBeInTheDocument() // Farben sind da

    // 2. Loading State simulieren (z.B. durch Re-Render mit neuer Prop, als käme es vom Server)
    rerender(
      <TagColorPicker
        currentColor="blue"
        onColorChange={vi.fn()}
        isLoading={true}
      />,
    )

    // Farben sollten verschwunden sein
    expect(screen.queryByTitle('red')).not.toBeInTheDocument()

    // Stattdessen sollten die 3 pulsierenden Punkte gerendert sein
    // (Wir wissen, dass es keine Buttons sind, sondern divs)
    const buttonsDuringLoad = screen.queryAllByRole('button')
    expect(buttonsDuringLoad).toHaveLength(0)

    // 3. Loading erfolgreich beendet (wieder false)
    rerender(
      <TagColorPicker
        currentColor="blue"
        onColorChange={vi.fn()}
        isLoading={false}
      />,
    )

    // Die Komponente sollte jetzt geschlossen sein (1 Ausgangs-Button)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
