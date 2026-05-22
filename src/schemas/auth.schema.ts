import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(3, 'Password must be at least 3 characters long'),
})

export const signupSchema = z
  .object({
    fullName: z.string().min(3, 'name must be at least 3 characters long'),
    email: z.email(),
    password: z.string().min(3, 'Password must be at least 3 characters long'),
    confirmPassword: z
      .string()
      .min(3, 'Password must be at least 3 characters long'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'], // Zeigt den Fehler direkt am zweiten Feld an
  })
