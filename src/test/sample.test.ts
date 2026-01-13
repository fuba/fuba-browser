import { describe, it, expect } from 'vitest'

describe('Sample tests', () => {
  it('should pass a basic assertion', () => {
    expect(1 + 1).toBe(2)
  })

  it('should handle string operations', () => {
    const str = 'fuba-browser'
    expect(str).toContain('browser')
    expect(str.split('-')).toHaveLength(2)
  })

  it('should handle async operations', async () => {
    const result = await Promise.resolve('async value')
    expect(result).toBe('async value')
  })
})
