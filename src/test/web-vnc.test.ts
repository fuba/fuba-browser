import { describe, it, expect } from 'vitest'
import type { Request } from 'express'
import { buildWebVncRedirectUrl } from '../server/index.js'

const TEST_PASSWORD = 'test-password'

function createRequest(overrides: Partial<Request> = {}): Request {
  const base = {
    headers: {},
    protocol: 'http',
  }
  return { ...base, ...overrides } as Request
}

describe('buildWebVncRedirectUrl', () => {
  it('uses forwarded headers and password in hash', () => {
    const req = createRequest({
      headers: {
        'x-forwarded-host': 'proxy.example.com:8443',
        'x-forwarded-proto': 'https',
      },
    })

    const result = buildWebVncRedirectUrl(req, 39001, TEST_PASSWORD)
    expect(result).toBe(`https://proxy.example.com:39001/vnc.html#password=${TEST_PASSWORD}&autoconnect=1`)
  })

  it('falls back to host header when forwarded headers are missing', () => {
    const req = createRequest({
      headers: {
        host: 'localhost:39000',
      },
    })

    const result = buildWebVncRedirectUrl(req, 39001, TEST_PASSWORD)
    expect(result).toBe(`http://localhost:39001/vnc.html#password=${TEST_PASSWORD}&autoconnect=1`)
  })
})
