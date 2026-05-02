# 📝 Architecture Documentation: Form System with `@tanstack/react-form`

This document describes the architecture, event lifecycle, and our binding conventions for implementing forms within the application. We use `@tanstack/react-form` in combination with `Zod` for maximum performance and strict type safety.

---

## 1. The Event Lifecycle

To avoid unexpected behavior, it is important to understand how the form system is initialized and validated. By default, `@tanstack/react-form` follows a **Lazy Validation** strategy.

1.  **Initialization (`useForm`):** The form is loaded with `defaultValues`. By default, no validation takes place yet; the form is initially considered valid (`canSubmit: true`).
2.  **User Interaction (`onChange`, `onBlur`):** As soon as the user changes a value, the `validators` kick in. Zod updates the internal metadata (`isValid`, `errors`).
3.  **Submission (`onSubmit`):**
    - The system now validates **all** fields against the Zod schema.
    - **Success:** The `onSubmit` callback of the `useForm` hook is executed.
    - **Failure:** The callback is silently blocked. Errors are written to `state.errorMap`.

---

## 2. Structural Requirement: The Submit Button

**Rule:** The submit button (`type="submit"`) **must** be physically located within the `<form>` tag. This ensures that the native HTML submit event is correctly passed to the TanStack handler.

```tsx
// ✅ CORRECT: Button inside the form
<form onSubmit={...}>
  <Field ... />
  <div className="flex justify-end">
    <Button type="submit">Save</Button>
  </div>
</form>
```

---

## 3. The FormDebugger: The "Source of Truth"

A common issue is **Sync Loss**: The library can "forget" initial errors (e.g., from `onMount`) as soon as the user interacts with other fields, because static values without an active input field often fall out of the validation cycle.

### 3.1 Functionality & Integration

The [`FormDebugger`](/src/components/web/form-debugger.tsx) acts as an incorruptible guardian. It independently validates the current state against the provided Zod schema on every change, regardless of the library's internal logic.

**Integration in a Dialog:**

```tsx
const form = useForm({
  defaultValues,
  validators: { onChange: mySchema }
})

return (
  <form ...>
    {/* Debugger only visible for admins and in dev environment */}
    {isAdmin && <FormDebugger form={form} schema={mySchema} />}
  </form>
)
```

### 3.2 Features of the Debugger

- **LED Status:** Red for schema violations, Green for validity, Yellow (Amber) during active validation.
- **Sync Discrepancy:** A warning appears if the library reports "Green" but the Zod schema reports "Red" (Sync Loss).
- **Force Validation:** A manual validation is forced via `onMouseDown` (higher priority than focus/click events), setting all fields to `isTouched: true`.
- **Production Guard:** The component automatically renders `null` when `process.env.NODE_ENV === 'production'`.

---

## 4. Developer Experience (DX) vs. User Experience (UX)

### The User Solution: `isTouched`

To avoid overwhelming the user with errors immediately, we only display UI error messages if a field is invalid **AND** has been touched (`isTouched`).

### The Developer Solution: Force Validation

In the debugger, we can use "Force Validation" to force the `isTouched` status for all fields simultaneously. This simulates a failed submit attempt and makes all errors in the UI immediately visible.

---

## 5. Testing & Quality Assurance

To guarantee the reliability of the debugger, a comprehensive [test suite exists under Vitest](/src/components/web/__tests__/form-debugger.test.tsx).

### 5.1 Test Scenarios

- **Production Protection:** Ensuring the tool never appears to the end customer.
- **Schema Validity:** Checking whether Zod issues are correctly extracted from the state.
- **Interaction Tests:** Validating the `onMouseDown` logic and the correct triggering of `form.validate()`.

### 5.2 Best Practices for Testing

When testing environment variables, we use `vi.stubEnv` to ensure type safety:

```tsx
it('should not render in production', () => {
  vi.stubEnv('NODE_ENV', 'production')
  const { container } = render(<FormDebugger form={mockForm} />)
  expect(container.firstChild).toBeNull()
  vi.unstubAllEnvs()
})
```

**Important for the test environment:** Since we are checking DOM elements, `environment: 'jsdom'` must be set in the `vitest.config.ts`, and `jest-dom/matchers` must be registered via `expect.extend` to use matchers such as `toBeInTheDocument()`.
