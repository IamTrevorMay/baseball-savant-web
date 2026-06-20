import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * trackCronRun — wraps a cron job's inner work and records its run in the
 * `cron_runs` table (see scripts/create-cron-runs.sql).
 *
 * Behavior:
 * - Inserts a `running` row at start; saves the row id.
 * - On success: updates row with status='success', finished_at, duration_ms, counts.
 * - On thrown error: updates row with status='error', finished_at, duration_ms,
 *   error_message; then re-throws so the caller sees the original error.
 * - If the initial insert itself fails, swallow the tracking error and run
 *   `fn` anyway. Tracking must never break the actual job.
 */
export async function trackCronRun<T>(
  job: string,
  fn: () => Promise<{ result: T; counts?: Record<string, any> }>,
): Promise<T> {
  const startedAt = new Date()
  const startMs = Date.now()
  let runId: number | null = null

  // Reconcile orphaned 'running' rows from prior invocations that were killed
  // (Vercel function timeout / OOM) before they could record success or error —
  // otherwise they stay 'running' forever and pollute cron-health. No real cron
  // runs >30 min, so older 'running' rows are dead. Best-effort; never throws.
  try {
    const staleCutoff = new Date(startMs - 30 * 60 * 1000).toISOString()
    await supabaseAdmin
      .from('cron_runs')
      .update({
        status: 'timeout',
        finished_at: startedAt.toISOString(),
        error_message: 'orphaned running row — function likely killed (timeout/OOM)',
      })
      .eq('job', job)
      .eq('status', 'running')
      .lt('started_at', staleCutoff)
  } catch (err: any) {
    console.error('[cronTracker] reconcile threw:', err?.message || String(err))
  }

  // Best-effort INSERT. Never throw out of this block.
  try {
    const { data, error } = await supabaseAdmin
      .from('cron_runs')
      .insert({
        job,
        started_at: startedAt.toISOString(),
        status: 'running',
      })
      .select('id')
      .single()

    if (error) {
      console.error('[cronTracker] insert failed:', error.message)
      runId = null
    } else {
      runId = (data as any)?.id ?? null
    }
  } catch (err: any) {
    console.error('[cronTracker] insert threw:', err?.message || String(err))
    runId = null
  }

  try {
    const out = await fn()
    const finishedAt = new Date()
    const durationMs = Date.now() - startMs

    if (runId !== null) {
      try {
        const { error } = await supabaseAdmin
          .from('cron_runs')
          .update({
            status: 'success',
            finished_at: finishedAt.toISOString(),
            duration_ms: durationMs,
            counts: out.counts ?? null,
          })
          .eq('id', runId)
        if (error) console.error('[cronTracker] success update failed:', error.message)
      } catch (err: any) {
        console.error('[cronTracker] success update threw:', err?.message || String(err))
      }
    }

    return out.result
  } catch (err: any) {
    const finishedAt = new Date()
    const durationMs = Date.now() - startMs
    const message = err instanceof Error ? err.message : String(err)

    if (runId !== null) {
      try {
        const { error } = await supabaseAdmin
          .from('cron_runs')
          .update({
            status: 'error',
            finished_at: finishedAt.toISOString(),
            duration_ms: durationMs,
            error_message: message,
          })
          .eq('id', runId)
        if (error) console.error('[cronTracker] error update failed:', error.message)
      } catch (e: any) {
        console.error('[cronTracker] error update threw:', e?.message || String(e))
      }
    }

    throw err
  }
}
