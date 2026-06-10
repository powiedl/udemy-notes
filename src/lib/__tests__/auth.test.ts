import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { env } from '#/lib/env.lib.server'

// --- MOCKS ---

// 1. better-auth mocken, damit es uns einfach die reingegebene Konfiguration zurückgibt
vi.mock('better-auth', () => ({
  betterAuth: vi.fn((config) => config),
}))

// 2. Plugins und Adapter mocken
vi.mock('better-auth/adapters/prisma', () => ({
  prismaAdapter: vi.fn(() => 'mocked-prisma-adapter'),
}))

vi.mock('better-auth/tanstack-start', () => ({
  tanstackStartCookies: vi.fn(() => 'mocked-tanstack-plugin'),
}))

// 3. Datenbank mocken
vi.mock('#/lib/db.lib.server', () => ({
  prisma: {},
}))

// 4. Env mocken (Wir machen das Objekt veränderbar für unsere Tests)
vi.mock('#/lib/env.lib.server', () => ({
  env: {
    VERCEL_ENV: undefined,
    VERCEL_URL: undefined,
    VERCEL_BRANCH_URL: undefined,
    BETTER_AUTH_URL: undefined,
  },
}))

describe('Auth Library Configuration', () => {
  // Sichert die originalen Env-Werte, um sie nach jedem Test zurückzusetzen
  const originalEnv = { ...env }

  beforeEach(() => {
    // Leert den Modul-Cache von Vitest.
    // Dadurch wird auth.lib.ts bei jedem 'await import' komplett neu ausgeführt!
    vi.resetModules()
    vi.clearAllMocks()

    // Env zurücksetzen
    Object.assign(env, originalEnv)
  })

  afterEach(() => {
    Object.assign(env, originalEnv)
  })

  describe('Environment-basierte URL-Generierung', () => {
    it('Lokal/Default: Nutzt localhost, wenn keine Env-Variablen gesetzt sind', async () => {
      // GIVEN (Env ist komplett leer)
      const { auth } = await import('../auth.lib')

      // THEN
      // Da wir betterAuth gemockt haben, ist 'auth' hier unser config-Objekt
      const config = auth as any

      expect(config.baseURL).toBe('http://localhost:3000')
      expect(config.trustedOrigins).toEqual([])
    })

    it('Lokal/Default: Nutzt BETTER_AUTH_URL, wenn gesetzt', async () => {
      // GIVEN
      env.BETTER_AUTH_URL = 'https://meine-lokale-domain.com'

      const { auth } = await import('../auth.lib')
      const config = auth as any

      // THEN
      expect(config.baseURL).toBe('https://meine-lokale-domain.com')
      expect(config.trustedOrigins).toEqual([])
    })

    it('Vercel Preview: Setzt korrekte BaseURL und TrustedOrigins', async () => {
      // GIVEN
      env.VERCEL_ENV = 'preview'
      env.VERCEL_URL = 'my-project-123.vercel.app'
      env.VERCEL_BRANCH_URL = 'my-project-git-feature.vercel.app'

      const { auth } = await import('../auth.lib')
      const config = auth as any

      // THEN
      expect(config.baseURL).toBe('https://my-project-123.vercel.app')

      // Muss beide URLs als vertrauenswürdig einstufen
      expect(config.trustedOrigins).toContain(
        'https://my-project-123.vercel.app',
      )
      expect(config.trustedOrigins).toContain(
        'https://my-project-git-feature.vercel.app',
      )
    })

    it('Vercel Preview: Filtern von leeren Branch-URLs', async () => {
      // GIVEN (Nur VERCEL_URL ist gesetzt, kein Branch)
      env.VERCEL_ENV = 'preview'
      env.VERCEL_URL = 'preview-only.vercel.app'
      env.VERCEL_BRANCH_URL = undefined

      const { auth } = await import('../auth.lib')
      const config = auth as any

      // THEN
      // Darf keinen leeren String im Array haben!
      expect(config.trustedOrigins).toEqual(['https://preview-only.vercel.app'])
    })

    it('Vercel Production: Ignoriert VERCEL_URL und nutzt BETTER_AUTH_URL', async () => {
      // GIVEN
      env.VERCEL_ENV = 'production'
      env.VERCEL_URL = 'prod-deployment.vercel.app' // Vercels interne URL (sollte ignoriert werden)
      env.BETTER_AUTH_URL = 'https://meine-echte-domain.de'

      const { auth } = await import('../auth.lib')
      const config = auth as any

      // THEN
      expect(config.baseURL).toBe('https://meine-echte-domain.de')
      expect(config.trustedOrigins).toEqual([])
    })
  })

  describe('BetterAuth Standard-Konfiguration', () => {
    it('Konfiguriert die Datenbank und User-Felder korrekt', async () => {
      const { auth } = await import('../auth.lib')
      const config = auth as any

      // Datenbank Adapter
      expect(config.database).toBe('mocked-prisma-adapter')

      // User Erweitung (Role)
      expect(config.user.additionalFields.role).toEqual({
        type: 'string',
        fieldName: 'role',
        defaultValue: 'user',
      })
    })

    it('Aktiviert E-Mail/Passwort Auth mit den richtigen Einschränkungen', async () => {
      const { auth } = await import('../auth.lib')
      const config = auth as any

      expect(config.emailAndPassword).toEqual({
        enabled: true,
        requireEmailVerification: false,
        minPasswordLength: 8,
      })
    })

    it('Lädt das TanStack Start Plugin und Advanced Settings', async () => {
      const { auth } = await import('../auth.lib')
      const config = auth as any

      // Plugins
      expect(config.plugins).toContain('mocked-tanstack-plugin')

      // Advanced
      expect(config.advanced).toEqual({
        cookiePrefix: 'udemy-notes',
        trustHosts: true,
      })
    })
  })
})
