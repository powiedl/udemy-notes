---
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
