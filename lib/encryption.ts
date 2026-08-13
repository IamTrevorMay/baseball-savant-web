import crypto from 'crypto'

/**
 * AES-256-GCM encryption module.
 *
 * Format: iv:tag:ciphertext (all base64)
 *
 * Key env vars:
 *   ENCRYPTION_KEY       — general-purpose (newsletter, future fields)
 *   WHOOP_ENCRYPTION_KEY — Whoop OAuth tokens + raw_data (existing)
 *   BLIND_INDEX_KEY      — HMAC-SHA256 for searchable encrypted fields
 */

const HEX_64 = /^[0-9a-fA-F]{64}$/
const warnedKeys = new Set<string>()

/**
 * Derive the 32-byte AES-256 key from an env var.
 *
 * **Two accepted forms, and the difference matters:**
 *
 * - **64 hex characters** (`openssl rand -hex 32`) — decoded as hex to a full **256-bit** key.
 *   This is the correct form. Use it for every new or rotated key.
 * - **Anything else** — the first 32 *characters* are taken as UTF-8 bytes. This is the legacy
 *   derivation and it is kept **only** so existing ciphertext stays decryptable. Changing it
 *   would silently orphan every value already encrypted under it.
 *
 * The legacy path is weaker than the "AES-256" name implies: a 32-character hex string carries
 * only **128 bits** of entropy, and any string longer than 32 characters is silently truncated —
 * the extra characters contribute nothing. It is not breakable in practice, but it is not what
 * the name claims, so we warn once per key rather than failing closed (failing would take down
 * Whoop sync and the newsletter on deploy).
 *
 * To rotate to a full-strength key: generate `openssl rand -hex 32`, decrypt existing rows under
 * the old key, re-encrypt under the new one, then swap the env var. The `iv:tag:ciphertext`
 * format carries no key identifier, so rotation is a flag-day migration — there is no way to
 * tell which key a given ciphertext used.
 */
function getKey(envVar: string): Buffer {
  const key = process.env[envVar]
  if (!key || key.length < 32) {
    throw new Error(`${envVar} must be at least 32 characters`)
  }

  if (HEX_64.test(key)) return Buffer.from(key, 'hex')

  if (!warnedKeys.has(envVar)) {
    warnedKeys.add(envVar)
    const bits = /^[0-9a-fA-F]+$/.test(key.slice(0, 32)) ? 128 : 'under 256'
    console.warn(
      `[encryption] ${envVar} uses the legacy derivation (first 32 chars as UTF-8), giving ` +
      `${bits} bits of key entropy rather than 256. Rotate to a 64-hex-character key ` +
      `(openssl rand -hex 32); see the getKey() docblock for the migration.`,
    )
  }
  return Buffer.from(key.slice(0, 32), 'utf-8')
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * @param plaintext  The string to encrypt
 * @param keyEnvVar  Env var holding the 32+ char key (default: ENCRYPTION_KEY)
 * @returns          "iv:tag:ciphertext" (base64-encoded segments)
 */
export function encrypt(plaintext: string, keyEnvVar = 'ENCRYPTION_KEY'): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(keyEnvVar), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

/**
 * Decrypt an AES-256-GCM encoded string.
 * @param encoded    "iv:tag:ciphertext" (base64-encoded segments)
 * @param keyEnvVar  Env var holding the 32+ char key (default: ENCRYPTION_KEY)
 * @returns          Original plaintext
 */
export function decrypt(encoded: string, keyEnvVar = 'ENCRYPTION_KEY'): string {
  const [ivB64, tagB64, dataB64] = encoded.split(':')
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const data = Buffer.from(dataB64, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(keyEnvVar), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

/**
 * Compute a deterministic HMAC-SHA256 blind index for a value.
 * Used for dedup / lookup on encrypted fields without decrypting.
 * @param value  The plaintext value to index (e.g. lowercase email)
 * @returns      Hex-encoded HMAC digest
 */
export function blindIndex(value: string): string {
  const key = process.env.BLIND_INDEX_KEY
  if (!key || key.length < 32) {
    throw new Error('BLIND_INDEX_KEY must be at least 32 characters')
  }
  return crypto.createHmac('sha256', key).update(value).digest('hex')
}
