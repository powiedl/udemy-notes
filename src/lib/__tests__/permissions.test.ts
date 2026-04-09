import { describe, expect, it } from 'vitest'
import { hasAnyRole, hasRole } from '../permissions'

describe('permissions', () => {
  it('hasRole', () => {
    const userWithRole = { role: 'admin' }
    const userWithoutRole = { role: null }
    const userWithInvalidRole = { role: 'invalid' }

    expect(hasRole(userWithRole, 'admin')).toBe(true)
    expect(hasRole(userWithoutRole, 'admin')).toBe(false)
    expect(hasRole(userWithInvalidRole, 'admin')).toBe(false)
  })

  it('hasAnyRole', () => {
    const userWithRole = { role: 'admin' }
    const userWithoutRole = { role: null }
    const userWithInvalidRole = { role: 'invalid' }

    expect(hasAnyRole(userWithRole, ['admin'])).toBe(true)
    expect(hasAnyRole(userWithoutRole, ['admin'])).toBe(false)
    expect(hasAnyRole(userWithInvalidRole, ['admin'])).toBe(false)
    // @ts-expect-error: 'editor' ist kein gültiges Element von Role
    expect(hasAnyRole(userWithRole, ['admin', 'editor'])).toBe(true)
    // @ts-expect-error: 'editor' ist kein gültiges Element von Role
    expect(hasAnyRole(userWithRole, ['editor'])).toBe(false)
  })
})
