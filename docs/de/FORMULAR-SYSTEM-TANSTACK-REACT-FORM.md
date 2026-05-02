# 📝 Architektur-Dokumentation: Formular-System mit `@tanstack/react-form`

Dieses Dokument beschreibt die Architektur, den Event-Lebenszyklus und unsere verbindlichen Konventionen für die Implementierung von Formularen in der App. Wir nutzen `@tanstack/react-form` in Kombination mit `Zod` für maximale Performance und strikte Typsicherheit.

---

## 1. Der Event-Lebenszyklus (Lifecycle)

Um unerwartetes Verhalten zu vermeiden, ist es wichtig zu verstehen, wie das Formular-System initialisiert und validiert wird. `@tanstack/react-form` verfolgt standardmäßig eine **Lazy Validation** Strategie.

1.  **Initialisierung (`useForm`):** Das Formular wird mit den `defaultValues` geladen. Standardmäßig findet noch keine Validierung statt; das Formular gilt zunächst als gültig (`canSubmit: true`).
2.  **User Interaction (`onChange`, `onBlur`):** Sobald der Nutzer einen Wert ändert, greifen die `validators`. Zod aktualisiert die internen Metadaten (`isValid`, `errors`).
3.  **Submission (`onSubmit`):**
    - Das System validiert nun **alle** Felder gegen das Zod-Schema.
    - **Erfolg:** Der `onSubmit`-Callback des `useForm`-Hooks wird ausgeführt.
    - **Fehlschlag:** Der Callback wird stillschweigend blockiert. Fehler werden in `state.errorMap` geschrieben.

---

## 2. Struktur-Vorgabe: Der Submit-Button

**Regel:** Der Submit-Button (`type="submit"`) **muss** physisch innerhalb des `<form>`-Tags liegen. Dies stellt sicher, dass das native HTML-Submit-Event korrekt an den TanStack-Handler weitergegeben wird.

```tsx
// ✅ RICHTIG: Button innerhalb des Formulars
<form onSubmit={...}>
  <Field ... />
  <div className="flex justify-end">
    <Button type="submit">Speichern</Button>
  </div>
</form>
```

---

## 3. Der FormDebugger: Die "Source of Truth"

Ein häufiges Problem ist der **Sync Loss**: Die Library kann initiale Fehler (z. B. aus `onMount`) "vergessen", sobald der Nutzer mit anderen Feldern interagiert, da statische Werte ohne aktives Input-Feld oft aus dem Validierungs-Zyklus fallen.

### 3.1 Funktionsweise & Integration

Der [`FormDebugger`](/src/components/web/form-debugger.tsx) fungiert als unbestechlicher Wächter. Er validiert den aktuellen State bei jeder Änderung eigenständig gegen das bereitgestellte Zod-Schema, unabhängig von der internen Logik der Library.

**Integration im Dialog:**

```tsx
const form = useForm({
  defaultValues,
  validators: { onChange: mySchema }
})

return (
  <form ...>
    {/* Debugger nur für Admins und in Dev-Umgebung sichtbar */}
    {isAdmin && <FormDebugger form={form} schema={mySchema} />}
  </form>
)
```

### 3.2 Features des Debuggers

- **LED-Status:** Rot bei Schema-Verletzungen, Grün bei Validität, Gelb (Amber) während aktiver Validierung.
- **Sync Discrepancy:** Eine Warnung erscheint, wenn die Library "Grün" meldet, das Zod-Schema aber "Rot" (Sync Loss).
- **Force Validation:** Über `onMouseDown` (höhere Priorität als Focus/Click Events) wird eine manuelle Validierung erzwungen und alle Felder auf `isTouched: true` gesetzt.
- **Production Guard:** In `process.env.NODE_ENV === 'production'` rendert die Komponente automatisch `null`.

---

## 4. Developer Experience (DX) vs. User Experience (UX)

### Die Lösung für den Nutzer: `isTouched`

Um den Nutzer nicht sofort mit Fehlern zu erschlagen, zeigen wir UI-Fehlermeldungen nur an, wenn ein Feld ungültig **UND** berührt (`isTouched`) wurde.

### Die Lösung für Entwickler: Force Validation

Im Debugger können wir über "Force Validation" den `isTouched`-Status für alle Felder gleichzeitig erzwingen. Dies simuliert einen fehlgeschlagenen Submit-Versuch und macht alle Fehler in der UI sofort sichtbar.

---

## 5. Testing & Qualitätssicherung

Um die Verlässlichkeit des Debuggers zu garantieren, existiert eine umfassende [Test-Suite unter Vitest](/src/components/web/__tests__/form-debugger.test.tsx).

### 5.1 Test-Szenarien

- **Production-Schutz:** Sicherstellung, dass das Tool niemals beim Endkunden erscheint.
- **Schema-Validität:** Prüfung, ob Zod-Issues korrekt aus dem State extrahiert werden.
- **Interaktions-Tests:** Validierung der `onMouseDown`-Logik und der korrekten Triggerung von `form.validate()`.

### 5.2 Best Practices beim Testen

Beim Testen der Umgebungsvariablen nutzen wir `vi.stubEnv`, um Typsicherheit zu gewährleisten:

```tsx
it('sollte in Production nicht rendern', () => {
  vi.stubEnv('NODE_ENV', 'production')
  const { container } = render(<FormDebugger form={mockForm} />)
  expect(container.firstChild).toBeNull()
  vi.unstubAllEnvs()
})
```

**Wichtig für die Test-Umgebung:** Da wir DOM-Elemente prüfen, muss in der `vitest.config.ts` die `environment: 'jsdom'` gesetzt sein und `jest-dom/matchers` via `expect.extend` registriert werden, um Matcher wie `toBeInTheDocument()` nutzen zu können.
