import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * DB-backed query cache for heavy aggregation endpoints.
 * Uses the query_cache table with TTL-based expiration.
 */

interface CacheOptions {
  /** Time-to-live in seconds (default: 6 hours) */
  ttlSeconds?: number
}

/**
 * Get a cached response by key. Returns null if not found or expired.
 */
export async function getCached<T = any>(key: string): Promise<T | null> {
  const { data, error } = await supabaseAdmin
    .from('query_cache')
    .select('response')
    .eq('cache_key', key)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (error || !data) return null
  return data.response as T
}

/**
 * Set a cached response with TTL.
 */
export async function setCache(key: string, response: any, opts?: CacheOptions): Promise<void> {
  const ttl = opts?.ttlSeconds ?? 21600 // 6 hours default
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()

  await supabaseAdmin
    .from('query_cache')
    .upsert({
      cache_key: key,
      response,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    }, { onConflict: 'cache_key' })
}

/**
 * Invalidate cache entries matching a prefix (e.g., "trends:" clears all trends caches).
 */
export async function invalidateCache(prefix: string): Promise<void> {
  await supabaseAdmin
    .from('query_cache')
    .delete()
    .like('cache_key', `${prefix}%`)
}

/**
 * Purge all expired entries. Call from daily cron.
 */
export async function purgeExpired(): Promise<void> {
  await supabaseAdmin
    .from('query_cache')
    .delete()
    .lt('expires_at', new Date().toISOString())
}

/**
 * Wrapper: check cache, call fallback if miss, store result.
 */
export async function cached<T>(key: string, fallback: () => Promise<T>, opts?: CacheOptions): Promise<T> {
  const hit = await getCached<T>(key)
  if (hit !== null) return hit

  const result = await fallback()
  // Don't await cache write — let it happen in background
  setCache(key, result, opts).catch(() => {})
  return result
}
