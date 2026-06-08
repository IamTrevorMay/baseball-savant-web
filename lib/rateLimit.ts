/**
 * In-memory sliding window rate limiter.
 * No external dependencies — uses a Map of timestamp arrays per key.
 */

const windows = new Map<string, number[]>()

/** Prune stale keys every 5 minutes to prevent memory leaks from abandoned sessions. */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

let cleanupTimer: ReturnType<typeof setInterval> | null = null

function ensureCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, timestamps] of windows) {
      // Remove keys with no recent activity (oldest window we'd track is 60s)
      if (timestamps.length === 0 || now - timestamps[timestamps.length - 1] > 120_000) {
        windows.delete(key)
      }
    }
    if (windows.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer)
      cleanupTimer = null
    }
  }, CLEANUP_INTERVAL_MS)
  // Allow Node to exit even if timer is running
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref()
  }
}

/**
 * Check if a request is allowed under the rate limit.
 * @param key - Unique key (e.g. session ID, IP address)
 * @param limit - Max requests allowed in the window
 * @param windowMs - Window duration in milliseconds
 * @returns `{ allowed: true }` or `{ allowed: false, retryAfterMs }`
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterMs?: number } {
  ensureCleanup()
  const now = Date.now()
  const cutoff = now - windowMs

  let timestamps = windows.get(key)
  if (!timestamps) {
    timestamps = []
    windows.set(key, timestamps)
  }

  // Prune timestamps outside the window
  while (timestamps.length > 0 && timestamps[0] <= cutoff) {
    timestamps.shift()
  }

  if (timestamps.length >= limit) {
    const retryAfterMs = timestamps[0] + windowMs - now
    return { allowed: false, retryAfterMs: Math.max(1, retryAfterMs) }
  }

  timestamps.push(now)
  return { allowed: true }
}
