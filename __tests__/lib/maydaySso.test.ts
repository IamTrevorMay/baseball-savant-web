import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { verifyToken } from '@/lib/maydaySso'

const SECRET = 'test-secret'

/** Sign exactly the way docs/mayday-sso.md tells the Mayday side to. */
function sign(payload: object, secret = SECRET): string {
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret).update(p).digest('base64url')
  return `${p}.${sig}`
}

const now = () => Math.floor(Date.now() / 1000)

describe('mayday SSO verifyToken', () => {
  it('accepts a fresh, well-signed assertion and normalizes the email', () => {
    const token = sign({ email: '  Trevor@Example.COM ', name: 'Trevor', iat: now() })
    expect(verifyToken(token, SECRET)).toEqual({ email: 'trevor@example.com', name: 'Trevor' })
  })

  it('name is optional', () => {
    const token = sign({ email: 'a@b.co', iat: now() })
    expect(verifyToken(token, SECRET)).toEqual({ email: 'a@b.co', name: null })
  })

  it('rejects a signature made with the wrong secret', () => {
    const token = sign({ email: 'a@b.co', iat: now() }, 'other-secret')
    expect(verifyToken(token, SECRET)).toBeNull()
  })

  it('rejects a tampered payload even with the original signature', () => {
    const good = sign({ email: 'a@b.co', iat: now() })
    const sig = good.split('.')[1]
    const evil = Buffer.from(JSON.stringify({ email: 'owner@b.co', iat: now() })).toString('base64url')
    expect(verifyToken(`${evil}.${sig}`, SECRET)).toBeNull()
  })

  it('rejects stale assertions (> 60s old)', () => {
    const token = sign({ email: 'a@b.co', iat: now() - 61 })
    expect(verifyToken(token, SECRET)).toBeNull()
  })

  it('rejects far-future iat (> 30s ahead)', () => {
    const token = sign({ email: 'a@b.co', iat: now() + 60 })
    expect(verifyToken(token, SECRET)).toBeNull()
  })

  it('rejects garbage email shapes and malformed tokens', () => {
    expect(verifyToken(sign({ email: 'not-an-email', iat: now() }), SECRET)).toBeNull()
    expect(verifyToken(sign({ iat: now() }), SECRET)).toBeNull()
    expect(verifyToken('no-dot-here', SECRET)).toBeNull()
    expect(verifyToken('', SECRET)).toBeNull()
    expect(verifyToken('a.!!!notbase64!!!', SECRET)).toBeNull()
  })
})
