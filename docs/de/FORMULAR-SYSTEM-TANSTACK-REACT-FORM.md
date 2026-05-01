Hier ist ein Entwurf für deine Dokumentation, strukturiert als Leitfaden und Nachschlagewerk für das Projekt. Sie ist im Stil einer technischen Architektur- und Konzeptdokumentation gehalten.

---

# 📝 Architektur-Dokumentation: Formular-System mit `@tanstack/react-form`

Dieses Dokument beschreibt die Architektur, den Event-Lebenszyklus und unsere verbindlichen Konventionen für die Implementierung von Formularen in der App. Wir nutzen `@tanstack/react-form` in Kombination mit `Zod` für maximale Performance (gezieltes Re-Rendering einzelner Felder) und strikte Typsicherheit.

---

## 1. Der Event-Lebenszyklus (Lifecycle)

Um unerwartetes Verhalten zu vermeiden, ist es wichtig zu verstehen, wie das Formular-System initialisiert und validiert wird. `@tanstack/react-form` verfolgt standardmäßig eine **Lazy Validation** (träge Validierung) Strategie.

1. **Initialisierung (`useForm`):** Das Formular wird mit den `defaultValues` geladen. _Achtung:_ Zu diesem Zeitpunkt findet standardmäßig noch keine Validierung gegen das Zod-Schema statt. Das Formular geht zunächst davon aus, dass es gültig ist (`canSubmit: true`).
2. **User Interaction (`onChange`, `onBlur`):** Sobald der Nutzer einen Wert ändert oder ein Feld verlässt, greifen die im `validators`-Objekt definierten Trigger. Erst jetzt validiert Zod die Eingabe und aktualisiert die internen Metadaten (`isValid`, `errors`) für dieses spezifische Feld.
3. **Submission (`onSubmit`):** \* Der Nutzer klickt auf den Submit-Button.
   - Das native HTML-Event feuert und ruft `form.handleSubmit()` auf.
   - **Die Gatekeeper-Prüfung:** Das System validiert nun _alle_ Felder gegen das Zod-Schema.
   - **Erfolg:** Sind alle Daten gültig, wird der `onSubmit`-Callback des `useForm`-Hooks ausgeführt. Hier rufen wir unsere Server Actions (z.B. via `handleAction` oder `onExport`) auf und schließen ggf. Dialoge.
   - **Fehlschlag:** Ist das Formular ungültig, wird der `onSubmit`-Callback _stillschweigend blockiert_. Die Fehler werden in den `state.errorMap` und `state.fieldMeta` geschrieben.

---

## 2. Struktur-Vorgabe: Der Submit-Button

**Regel:** Der Submit-Button (`type="submit"`) **muss** physisch innerhalb des `<form>` ... `</form>` HTML-Tags definiert werden.

**Warum ist das wichtig?**
Wir verlassen uns auf die nativen HTML-Mechanismen. Ein Button mit `type="submit"` löst automatisch das `onSubmit`-Event des umschließenden Formulars aus.
Liegt der Button außerhalb (z. B. isoliert in einem `DialogFooter` nach dem Schließen des Form-Tags), verliert er den Kontext. Er weiß nicht, welches Formular er abschicken soll. Zwar ließe sich dies über `<form id="my-form">` und `<button form="my-form">` überbrücken, jedoch führt die Verschachtelung des Buttons im Formular zu einer robusteren und weniger fehleranfälligen Komponentenstruktur.

```tsx
// ❌ FALSCH: Button außerhalb des Formulars
<form onSubmit={...}>
  <Field ... />
</form>
<Button type="submit">Speichern</Button>

// ✅ RICHTIG: Button innerhalb des Formulars
<form onSubmit={...}>
  <Field ... />
  <div className="flex justify-end">
    <Button type="submit">Speichern</Button>
  </div>
</form>
```

---

## 3. Developer Experience (DX) vs. User Experience (UX)

Ein häufiges Problem bei der Entwicklung von Formularen ist die Diskrepanz zwischen den initialen `defaultValues` und dem strikten Zod-Schema (z. B. wenn Felder initial `undefined` sind, das Schema aber zwingend einen Boolean erwartet).

Da die Validierung standardmäßig erst bei Interaktion (`onChange`) greift, merkt man als Entwickler oft erst beim Klick auf "Speichern", dass das Formular kaputt ist (da der `onSubmit`-Block blockiert wird).

### Die Lösung für Entwickler: `onMount` Validierung

Um das Formular zu zwingen, die Datenrelevanz sofort beim Aufbau der Komponente zu prüfen, ergänzen wir das Schema auch als `onMount`-Validator:

```tsx
validators: {
  onChange: myZodSchema,
  onMount: myZodSchema, // Zwingt zur sofortigen Überprüfung
}
```

**Effekt:** Ein integrierter Form-Debugger (via `<form.Subscribe>`) füllt sich nun _sofort_ mit allen Struktur- und Validierungsfehlern, ohne dass ein Submit-Klick nötig ist. `canSubmit` wird sofort auf `false` korrigiert.

### Die Lösung für den Nutzer: `isTouched`

Die `onMount`-Validierung hat einen gefährlichen UX-Seiteneffekt: Alle Felder wissen sofort, dass sie ungültig sind. Würden wir unsere UI nur nach `isValid` rendern, würde der Nutzer beim Öffnen des Popups sofort von einem "Meer aus roten Fehlermeldungen" erschlagen werden, bevor er überhaupt etwas eingeben konnte.

**Die goldene Regel zur Fehleranzeige:**
Wir trennen den internen _Status_ des Formulars von der _Sichtbarkeit_ in der UI. Ein Feld darf nur als fehlerhaft (rot) gerendert werden, wenn es ungültig **UND** vom Nutzer bereits berührt (`isTouched`) wurde.

```tsx
<form.Field
  name="myField"
  children={(field) => {
    // UX-Filter: Fehler nur zeigen, wenn das Feld interagiert wurde
    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

    return (
      <Field data-invalid={isInvalid}>
        {/* Input UI und Fehlermeldungen hier */}
      </Field>
    )
  }}
/>
```

Durch diese Kombination erreichen wir das perfekte Setup:

1. **Für uns (DX):** Der Form-Debugger zeigt sofort alle fehlenden Daten an. Der Speichern-Button ist von Beginn an blockiert, wenn Daten fehlen.
2. **Für den Nutzer (UX):** Die Formularfelder sehen sauber und unschuldig aus. Erst wenn der Nutzer ein Feld ausfüllt und verlässt – oder den Speichern-Button klickt (was den Status "submitted/touched" forciert) –, wird dem Nutzer visuell mitgeteilt, wo es hakt.
