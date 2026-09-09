import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Verification for the Mayday Studio SSO hand-off assertion (the Triton half
 * of "Continue with Mayday Studio" — see docs/mayday-sso.md for the contract
 * the Mayday side signs against).
 *
 * Token: base64url(JSON{ email, name?, iat }) + "." +
 *        base64url(HMAC-SHA256(payload, secret)).
 * `iat` is unix seconds; assertions older than TOKEN_TTL_S (or more than 30s
 * from the future) are rejected, so a leaked URL goes stale almost instantly.
 */

export const TOKEN_TTL_S = 60

const b64urlDecode = (s: string) => Buffer.from(s, 'base64url')

export function verifyToken(token: string, secret: string): { email: string; name: string | null } | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const payloadPart = token.slice(0, dot)
  const sigPart = token.slice(dot + 1)

  const expected = createHmac('sha256', secret).update(payloadPart).digest()
  let given: Buffer
  try {
    given = b64urlDecode(sigPart)
  } catch {
    return null
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  let payload: { email?: unknown; name?: unknown; iat?: unknown }
  try {
    payload = JSON.parse(b64urlDecode(payloadPart).toString('utf8'))
  } catch {
    return null
  }

  const email = String(payload.email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null

  const iat = Number(payload.iat)
  const age = Date.now() / 1000 - iat
  if (!isFinite(iat) || age < -30 || age > TOKEN_TTL_S) return null

  return { email, name: payload.name ? String(payload.name) : null }
}
