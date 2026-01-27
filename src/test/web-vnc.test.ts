import { describe, it, expect } from 'vitest'
import type { Request } from 'express'
import { buildWebVncRedirectUrl } from '../server/index.js'

function createRequest(overrides: Partial<Request> = {}): Request {
  const base = {
    headers: {},
    protocol: 'http',
  } as Request
  return { ...base, ...overrides }
}

describe('buildWebVncRedirectUrl', () => {
  it('uses forwarded headers and password in hash', () => {
    const req = createRequest({
      headers: {
        'x-forwarded-host': 'proxy.example.com:8443',
        'x-forwarded-proto': 'https',
      },
    })

    const result = buildWebVncRedirectUrl(req, 39001, 'secret')
    expect(result).toBe('https://proxy.example.com:39001/vnc.html#password=secret&autoconnect=1')
  })

  it('falls back to host header when forwarded headers are missing', () => {
    const req = createRequest({
      headers: {
        host: 'localhost:39000',
      },
    })

    const result = buildWebVncRedirectUrl(req, 39001, 'fuba-browser')
    expect(result).toBe('http://localhost:39001/vnc.html#password=fuba-browser&autoconnect=1')
  })
})
