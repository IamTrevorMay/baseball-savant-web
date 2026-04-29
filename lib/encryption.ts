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

function getKey(envVar: string): Buffer {
  const key = process.env[envVar]
  if (!key || key.length < 32) {
    throw new Error(`${envVar} must be at least 32 characters`)
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
