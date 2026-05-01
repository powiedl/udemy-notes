# 📝 Architecture Documentation: Form System with `@tanstack/react-form`

This document describes the architecture, the event lifecycle, and our mandatory conventions for implementing forms in the app. We use `@tanstack/react-form` in combination with `Zod` for maximum performance (targeted re-rendering of individual fields) and strict type safety.

---

## 1. The Event Lifecycle

To avoid unexpected behavior, it is important to understand how the form system is initialized and validated. By default, `@tanstack/react-form` follows a **Lazy Validation** strategy.

1. **Initialization (`useForm`):** The form is loaded with the `defaultValues`. _Note:_ At this point, no validation against the Zod schema occurs by default. The form initially assumes it is valid (`canSubmit: true`).
2. **User Interaction (`onChange`, `onBlur`):** As soon as the user changes a value or leaves a field, the triggers defined in the `validators` object take effect. Only now does Zod validate the input and update the internal metadata (`isValid`, `errors`) for this specific field.
3. **Submission (`onSubmit`):** \* The user clicks the submit button.
   - The native HTML event fires and calls `form.handleSubmit()`.
   - **The Gatekeeper Check:** The system now validates _all_ fields against the Zod schema.
   - **Success:** If all data is valid, the `onSubmit` callback of the `useForm` hook is executed. Here we call our Server Actions (e.g., via `handleAction` or `onExport`) and close dialogs if necessary.
   - **Failure:** If the form is invalid, the `onSubmit` callback is _silently blocked_. The errors are written to `state.errorMap` and `state.fieldMeta`.

---

## 2. Structural Requirement: The Submit Button

**Rule:** The submit button (`type="submit"`) **must** be physically defined within the `<form>` ... `</form>` HTML tags.

**Why is this important?**
We rely on native HTML mechanisms. A button with `type="submit"` automatically triggers the `onSubmit` event of the enclosing form.
If the button is located outside (e.g., isolated in a `DialogFooter` after closing the form tag), it loses context. It doesn't know which form it should submit. Although this could be bypassed using `<form id="my-form">` and `<button form="my-form">`, nesting the button inside the form leads to a more robust and less error-prone component structure.

```tsx
// ❌ WRONG: Button outside the form
<form onSubmit={...}>
  <Field ... />
</form>
<Button type="submit">Save</Button>

// ✅ RIGHT: Button inside the form
<form onSubmit={...}>
  <Field ... />
  <div className="flex justify-end">
    <Button type="submit">Save</Button>
  </div>
</form>
```

---

## 3. Developer Experience (DX) vs. User Experience (UX)

A common problem when developing forms is the discrepancy between the initial `defaultValues` and the strict Zod schema (e.g., if fields are initially `undefined`, but the schema strictly expects a boolean).

Since validation is only triggered upon interaction (`onChange`) by default, developers often only realize the form is broken when clicking "Save" (because the `onSubmit` block gets blocked).

### The Solution for Developers: `onMount` Validation

To force the form to check data validity immediately when the component mounts, we add the schema as an `onMount` validator as well:

```tsx
validators: {
  onChange: myZodSchema,
  onMount: myZodSchema, // Forces immediate validation
}
```

**Effect:** An integrated form debugger (via `<form.Subscribe>`) now fills _immediately_ with all structural and validation errors without needing a submit click. `canSubmit` is immediately corrected to `false`.

### The Solution for the User: `isTouched`

The `onMount` validation has a dangerous UX side effect: All fields immediately know they are invalid. If we were to render our UI solely based on `isValid`, the user would be overwhelmed by a "sea of red error messages" right upon opening the popup, before they even had a chance to enter anything.

**The Golden Rule for Error Display:**
We separate the internal _state_ of the form from its _visibility_ in the UI. A field may only be rendered as invalid (red) if it is invalid **AND** has already been touched by the user (`isTouched`).

```tsx
<form.Field
  name="myField"
  children={(field) => {
    // UX Filter: Only show errors if the field has been interacted with
    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

    return (
      <Field data-invalid={isInvalid}>
        {/* Input UI and error messages here */}
      </Field>
    )
  }}
/>
```

Through this combination, we achieve the perfect setup:

1. **For us (DX):** The form debugger immediately displays all missing data. The save button is blocked right from the start if data is missing.
2. **For the user (UX):** The form fields look clean and innocent. Only when the user fills out a field and leaves it – or clicks the save button (which forces the "submitted/touched" state) – is the user visually informed of what is wrong.
