import { describe, it, expect, vi, beforeEach } from 'vitest'

// checkPitchVideoArchive reads through supabaseAdmin.rpc('run_query', ...)
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { rpc: vi.fn() },
}))
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
  supabaseAdminLong: { rpc: vi.fn() },
}))

import { supabaseAdmin } from '@/lib/supabase/admin'
import { checkPitchVideoArchive } from '@/lib/dataIntegrity'

const HOUR = 3_600_000

/** One pitch_videos summary row, with the last download `hoursAgo` in the past. */
function mockArchive(opts: {
  hoursAgo: number | null
  pending?: number
  failed?: number
  downloaded?: number
}) {
  ;(supabaseAdmin.rpc as any).mockResolvedValue({
    data: [
      {
        last_download:
          opts.hoursAgo === null ? null : new Date(Date.now() - opts.hoursAgo * HOUR).toISOString(),
        pending: opts.pending ?? 0,
        failed: opts.failed ?? 0,
        downloaded: opts.downloaded ?? 1_000_000,
      },
    ],
    error: null,
  })
}

describe('checkPitchVideoArchive', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes while the worker is keeping up', async () => {
    mockArchive({ hoursAgo: 6, pending: 5_000 })
    const r = await checkPitchVideoArchive()
    expect(r.status).toBe('pass')
    expect(r.details.ageHours).toBe(6)
  })

  it('warns once downloads stall past 48h with work queued', async () => {
    mockArchive({ hoursAgo: 60, pending: 27_000 })
    const r = await checkPitchVideoArchive()
    expect(r.status).toBe('warn')
    expect(r.found).toBe(27_000)
  })

  it('fails past 96h — the July 2026 outage would have tripped on day 4', async () => {
    mockArchive({ hoursAgo: 35 * 24, pending: 153_152 })
    const r = await checkPitchVideoArchive()
    expect(r.status).toBe('fail')
    expect(r.found).toBe(153_152)
  })

  it('counts failed rows as queued work, not just pending', async () => {
    // The outage parked rows in 'failed'; a dead-man that only watched
    // 'pending' would have seen an empty queue and stayed silent.
    mockArchive({ hoursAgo: 200, pending: 0, failed: 18_868 })
    const r = await checkPitchVideoArchive()
    expect(r.status).toBe('fail')
    expect(r.found).toBe(18_868)
  })

  it('stays quiet when the queue is empty, however old the last download', async () => {
    mockArchive({ hoursAgo: 90 * 24, pending: 0, failed: 0 })
    const r = await checkPitchVideoArchive()
    expect(r.status).toBe('pass')
    expect(r.details.note).toMatch(/caught up/)
  })

  it('treats a never-downloaded archive with a backlog as failing', async () => {
    mockArchive({ hoursAgo: null, pending: 100, downloaded: 0 })
    const r = await checkPitchVideoArchive()
    expect(r.status).toBe('fail')
    expect(r.details.ageHours).toBeNull()
  })

  it('warns rather than throwing when the query errors', async () => {
    ;(supabaseAdmin.rpc as any).mockResolvedValue({ data: null, error: { message: 'timeout' } })
    const r = await checkPitchVideoArchive()
    expect(r.status).toBe('warn')
    expect(r.details.queryError).toBe('timeout')
  })
})
