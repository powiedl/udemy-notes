export type ServerResponse<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string; code?: string; component?: string }
