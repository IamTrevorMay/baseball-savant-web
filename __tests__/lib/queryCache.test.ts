import { describe, it, expect, vi } from 'vitest'

// Mock supabaseAdmin before importing the module
vi.mock('@/lib/supabase-admin', () => {
  const mockFrom = vi.fn()
  return {
    supabaseAdmin: { from: mockFrom },
  }
})

import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCached, setCache, invalidateCache, purgeExpired, cached } from '@/lib/queryCache'

function setupMockChain(finalResult: any) {
  const chain: any = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.gt = vi.fn().mockReturnValue(chain)
  chain.lt = vi.fn().mockReturnValue(chain)
  chain.like = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(finalResult)
  chain.upsert = vi.fn().mockResolvedValue({ error: null })
  chain.delete = vi.fn().mockReturnValue(chain)
  ;(supabaseAdmin.from as any).mockReturnValue(chain)
  return chain
}

describe('getCached', () => {
  it('returns data when cache hit', async () => {
    setupMockChain({ data: { response: { rows: [1, 2, 3] } }, error: null })
    const result = await getCached('test-key')
    expect(result).toEqual({ rows: [1, 2, 3] })
  })

  it('returns null when cache miss', async () => {
    setupMockChain({ data: null, error: { message: 'not found' } })
    const result = await getCached('test-key')
    expect(result).toBeNull()
  })
})

describe('setCache', () => {
  it('calls upsert with correct TTL', async () => {
    const chain = setupMockChain({})
    await setCache('test-key', { data: 'hello' }, { ttlSeconds: 3600 })
    expect(chain.upsert).toHaveBeenCalled()
    const upsertArg = chain.upsert.mock.calls[0][0]
    expect(upsertArg.cache_key).toBe('test-key')
    expect(upsertArg.response).toEqual({ data: 'hello' })
    // Verify the expiry is roughly 1 hour from now
    const expiresAt = new Date(upsertArg.expires_at).getTime()
    const expectedExpiry = Date.now() + 3600 * 1000
    expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000)
  })

  it('defaults to 6-hour TTL', async () => {
    const chain = setupMockChain({})
    await setCache('key', 'val')
    const upsertArg = chain.upsert.mock.calls[0][0]
    const expiresAt = new Date(upsertArg.expires_at).getTime()
    const expectedExpiry = Date.now() + 21600 * 1000
    expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000)
  })
})

describe('cached', () => {
  it('returns cached value on hit', async () => {
    setupMockChain({ data: { response: 'cached-result' }, error: null })
    const fallback = vi.fn().mockResolvedValue('fresh-result')
    const result = await cached('key', fallback)
    expect(result).toBe('cached-result')
    expect(fallback).not.toHaveBeenCalled()
  })

  it('calls fallback on cache miss', async () => {
    setupMockChain({ data: null, error: { message: 'miss' } })
    const fallback = vi.fn().mockResolvedValue('fresh-result')
    const result = await cached('key', fallback)
    expect(result).toBe('fresh-result')
    expect(fallback).toHaveBeenCalledOnce()
  })
})
