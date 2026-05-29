// prism-setup.ts
import Prism from 'prismjs'

declare global {
  interface Window {
    Prism: typeof Prism // Sagt TS: "Auf window gibt es ab jetzt Prism"
  }
}

// Wir hängen Prism an das globale window-Objekt,
// damit Lexical/MDXEditor es bei der Initialisierung findet.
if (typeof window !== 'undefined') {
  window.Prism = Prism
}
