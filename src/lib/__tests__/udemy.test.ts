import { describe, expect, it } from 'vitest'
import { orderInfo } from '#/lib/udemy.lib'

/**
 * Tests for the orderInfo function
 */
describe('orderInfo', () => {
  it('should return the correct order string', () => {
    const section = '1'
    const lecture = '2'
    const timestamp = '12:34:56'
    const expectedOrder = `001-002-${12 * 3600 + 34 * 60 + 56}`
    const result = orderInfo(section, lecture, timestamp)
    expect(result).toBe(expectedOrder)
  })

  it('should return the correct order string with default values', () => {
    const section = ''
    const lecture = ''
    const timestamp = ''
    const expectedOrder = '000-000-00000'
    const result = orderInfo(section, lecture, timestamp)
    expect(result).toBe(expectedOrder)
  })

  it('should return the correct order string with invalid values', () => {
    const section = 'abc'
    const lecture = 'def'
    const timestamp = '123:abc:def'
    const expectedOrder = '000-000-00000'
    const result = orderInfo(section, lecture, timestamp)
    expect(result).toBe(expectedOrder)
  })
})
