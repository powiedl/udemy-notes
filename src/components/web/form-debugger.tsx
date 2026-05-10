import { cn, getNodeEnv } from '#/lib/utils'
import { useState, useCallback, useRef, useEffect } from 'react'
import type { ZodSchema } from 'zod'

interface FormDebuggerProps {
  form: any
  schema?: ZodSchema
}

export const FormDebugger = ({ form, schema }: FormDebuggerProps) => {
  const [isBusy, setIsBusy] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (getNodeEnv('production')) return null
  if (!form) return null

  const handleForceValidation = useCallback(async () => {
    setIsBusy(true)
    // Ein einfacher Aufruf reicht jetzt, da der Debugger selbst prüft
    await form.validate('change')

    Object.keys(form.state.values || {}).forEach((name) => {
      form.setFieldMeta(name, (prev: any) => ({ ...prev, isTouched: true }))
    })

    timerRef.current = setTimeout(() => {
      setIsBusy(false)
      timerRef.current = null // Referenz nach Abschluss leeren
    }, 200)
  }, [form])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])
  return (
    <div className="mt-8 rounded-md bg-slate-900 p-4 text-xs text-green-400 border border-slate-700 shadow-2xl">
      <form.Subscribe
        selector={(s: any) => ({
          values: s.values,
          errorMap: s.errorMap,
          fieldMeta: s.fieldMeta,
          isValid: s.isValid,
        })}
      >
        {(state: any) => {
          // 1. Zod Check (Die Wahrheit)
          const zodResult = schema?.safeParse(state.values)
          const schemaInvalid = zodResult?.success === false
          const schemaIssues = !zodResult?.success
            ? zodResult?.error.issues
            : []

          // 2. Library Check (Der Status der UI)
          const libInvalid =
            !state.isValid || Object.keys(state.errorMap).length > 0

          // LED ist rot, wenn Zod oder die Library meckern
          const isRed = schemaInvalid || libInvalid

          return (
            <>
              <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-x-3">
                  <span
                    className={cn(
                      'w-3 h-3 rounded-full transition-all duration-300',
                      isBusy
                        ? 'bg-amber-500 animate-pulse'
                        : isRed
                          ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                          : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]',
                    )}
                  />
                  <h4 className="text-white font-bold uppercase italic">
                    Form Debugger
                  </h4>
                  {schemaInvalid && !libInvalid && (
                    <span className="text-[10px] text-amber-500 border border-amber-500/30 px-1 rounded bg-amber-500/5">
                      Sync Loss
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onMouseDown={handleForceValidation}
                  disabled={isBusy}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-700 uppercase font-bold text-[10px] active:scale-95"
                >
                  Force Validation
                </button>
              </div>

              <div className="space-y-3">
                {/* Zod Issues (Falls vorhanden) */}
                {schemaIssues?.map((issue, i) => (
                  <div
                    key={i}
                    className="bg-red-500/5 p-2 rounded border border-red-500/20 text-red-400 italic"
                  >
                    <span className="font-mono text-white not-italic mr-2 uppercase text-[9px]">
                      {issue.path.join('.') || 'root'}:
                    </span>
                    {issue.message}
                  </div>
                ))}

                {/* Library Meta (Nur zur Info) */}
                <div className="flex gap-x-4 opacity-40 font-mono text-[9px] uppercase pt-2 border-t border-slate-800/50">
                  <span>Lib-Valid: {String(state.isValid)}</span>
                  <span>Issues: {schemaIssues?.length || 0}</span>
                </div>

                <details className="cursor-pointer group">
                  <summary className="text-slate-500 group-hover:text-slate-300 uppercase text-[9px]">
                    Values JSON
                  </summary>
                  <pre className="mt-2 p-2 bg-black/30 rounded text-slate-400 max-h-40 overflow-auto">
                    {JSON.stringify(state.values, null, 2)}
                  </pre>
                </details>
              </div>
            </>
          )
        }}
      </form.Subscribe>
    </div>
  )
}
