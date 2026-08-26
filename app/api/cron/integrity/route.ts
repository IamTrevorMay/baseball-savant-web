import { NextRequest, NextResponse } from 'next/server'
import { trackCronRun } from '@/lib/cronTracker'
import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  checkUnknownPlayers,
  checkOrphanedPitchers,
  checkOrphanedBatters,
  checkNewPitchNames,
  checkSeasonConstants,
  checkMaterializedViews,
  checkLeagueAverages,
  checkPitchBaselines,
  checkPitchVideoArchive,
  type CheckResult,
} from '@/lib/dataIntegrity'
import { Resend } from 'resend'

/**
 * Email the archive dead-man alert. Best-effort: a failed send must never fail
 * the cron run, and an unconfigured address degrades to a log line rather than
 * silently swallowing the alert.
 */
async function alertArchiveStalled(check: CheckResult): Promise<void> {
  const d = check.details ?? {}
  const body = [
    `Pitch video archive has not gained a clip in ${d.ageHours}h.`,
    ``,
    `last download : ${d.lastDownload ?? 'never'}`,
    `queued        : ${d.pending} pending + ${d.failed} failed`,
    `archived      : ${d.downloaded}`,
    ``,
    `The indexer and the downloader fail independently — index rows keep`,
    `appearing while downloads are broken, so the Videos page looks healthy.`,
    `Check the pm2 'pitch-video-worker' log on the NAS machine, then:`,
    `  SELECT status, error, count(*) FROM pitch_videos`,
    `   WHERE requested_at > now() - interval '7 days' GROUP BY 1,2;`,
  ].join('\n')

  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.INTEGRITY_NOTIFY_EMAIL || process.env.JANITOR_NOTIFY_EMAIL
  if (!apiKey || !to) {
    console.error('[cron/integrity] archive stalled but no notify address configured:', body)
    return
  }
  try {
    const resend = new Resend(apiKey)
    const result = await resend.emails.send({
      from: process.env.JANITOR_FROM_EMAIL || 'Triton Integrity <janitor@tritonapex.io>',
      to,
      subject: `[Triton] Pitch video archive stalled ${d.ageHours}h`,
      text: body,
    })
    if ((result as any)?.error) {
      console.error('[cron/integrity] resend error:', (result as any).error)
    }
  } catch (e: any) {
    console.error('[cron/integrity] alert send threw:', e?.message || String(e))
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = await trackCronRun('integrity', async () => {
      const year = new Date().getFullYear()

      const settled = await Promise.allSettled([
        checkUnknownPlayers(),
        checkOrphanedPitchers(year),
        checkOrphanedBatters(year),
        checkNewPitchNames(year),
        checkSeasonConstants(year),
        checkMaterializedViews(),
        checkLeagueAverages(year),
        checkPitchBaselines(year),
        checkPitchVideoArchive(),
      ])

      // Collect results, converting rejected promises to fail entries
      const results: CheckResult[] = settled.map((s, i) => {
        if (s.status === 'fulfilled') return s.value
        const names = [
          'unknown_players',
          'orphaned_pitchers',
          'orphaned_batters',
          'new_pitch_names',
          'season_constants',
          'materialized_views',
          'league_averages',
          'pitch_baselines',
          'pitch_video_archive',
        ]
        return {
          check_name: names[i],
          status: 'fail' as const,
          found: 0,
          remediated: 0,
          details: { error: s.reason?.message ?? String(s.reason) },
        }
      })

      // The archive dead-man is the one check nobody is watching a dashboard
      // for — push it. Scoped deliberately: the other checks fail only when
      // their promise throws, and emailing on those would train the inbox to
      // ignore this address.
      const archive = results.find((r) => r.check_name === 'pitch_video_archive')
      if (archive?.status === 'fail') await alertArchiveStalled(archive)

      // Insert all results into integrity_checks (run_id is set by cronTracker via cron_runs)
      // We get the run_id from the most recent running cron_runs row for 'integrity'
      const { data: runRow } = await supabaseAdmin
        .from('cron_runs')
        .select('id')
        .eq('job', 'integrity')
        .eq('status', 'running')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle() // tolerate 0/>1 running rows (overlapping runs) instead of throwing

      const runId = runRow?.id ?? null

      const rows = results.map((r) => ({
        run_id: runId,
        check_name: r.check_name,
        status: r.status,
        found: r.found,
        remediated: r.remediated,
        details: r.details,
      }))

      if (runId) {
        const { error: insErr } = await supabaseAdmin.from('integrity_checks').insert(rows)
        if (insErr) console.error('[cron/integrity] integrity_checks insert failed:', insErr.message)
      } else {
        console.warn('[cron/integrity] no running cron_runs row found; skipping integrity_checks insert')
      }

      // Build summary counts
      const summary = {
        total: results.length,
        pass: results.filter((r) => r.status === 'pass').length,
        warn: results.filter((r) => r.status === 'warn').length,
        fail: results.filter((r) => r.status === 'fail').length,
        remediated: results.filter((r) => r.status === 'remediated').length,
      }

      return {
        result: { ok: true as const, year, summary, checks: results },
        counts: summary,
      }
    })

    return NextResponse.json(payload)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
