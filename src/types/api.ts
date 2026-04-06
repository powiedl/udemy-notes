export type UdNoServerResponse<T> =
  | { success: true; data: T; message?: string }
  | {
      success: false
      error: string
      code?: string
      component?: string
      serverFunction?: string
    }

// Ein Helper, der das 'T' aus UdNoServerResponse<T> extrahiert
export type ExtractData<T> = T extends { success: true; data: infer D }
  ? D
  : never

// Und ein Helper, um den Typ einer Server Function Antwort zu bekommen
export type ServerFnData<T extends (...args: any) => Promise<any>> =
  ExtractData<Awaited<ReturnType<T>>>

export interface ClientLoggingMetadata {
  component?: string
  // Hier könnten später weitere Felder wie 'feature' oder 'version' dazukommen
  feature?: string
}
