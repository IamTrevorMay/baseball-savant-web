import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdminLong as supabase } from '@/lib/supabase-admin'
import { checkMachineAuth } from '@/lib/apiAuth'
import { reportError } from '@/lib/observability'

export const maxDuration = 300

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })
const m = (sql: string) => supabase.rpc('run_mutation', { query_text: sql.trim() })

/**
 * One day ≈ 4k pitches. The PostgREST role (`authenticator`) carries
 * statement_timeout=8s and service_role does not override it, so every run_query /
 * run_mutation call is capped at 8s no matter what the client-side timeout says —
 * supabaseAdminLong's 120s is a fetch timeout, not a DB one. Measured on 2026 data:
 * ~8k rows/statement passes, ~11k times out. 1 day keeps a wide margin as the table grows.
 */
const DEFAULT_CHUNK_DAYS = 1

/**
 * GET /api/admin/backfill-stuff-plus?year=YYYY[&start=YYYY-MM-DD&end=YYYY-MM-DD][&mode=repair|rescore][&chunkDays=N]
 *
 * Scores stuff_plus from pitch_baselines, walking the season in date-scoped chunks.
 *
 * mode=repair (default) only touches rows where stuff_plus IS NULL — cheap, idempotent,
 * and it leaves already-scored rows alone. mode=rescore rewrites every eligible row, which
 * is what you want after a formula or baseline change.
 *
 * Chunking is by game_date (indexed), not ctid/OFFSET. The previous implementation paged
 * on `ctid = ANY(SELECT ctid ... LIMIT n OFFSET m)` with no ORDER BY — unordered, so batches
 * could overlap or skip rows — and its hasMore probe was `SELECT COUNT(*) ... LIMIT 1 OFFSET n`,
 * which returns zero rows for any n > 0 because COUNT yields a single row. It therefore always
 * stopped after one batch, and that batch rewrote the whole year at once and timed out.
 */
export async function GET(req: NextRequest) {
  const denied = checkMachineAuth(req)
  if (denied) return denied

  try {
    const sp = req.nextUrl.searchParams
    const yearParam = sp.get('year')
    if (!yearParam || isNaN(parseInt(yearParam, 10))) {
      return NextResponse.json({ error: 'year parameter required (e.g. ?year=2026)' }, { status: 400 })
    }
    const year = parseInt(yearParam, 10)

    const mode = sp.get('mode') ?? 'repair'
    if (mode !== 'repair' && mode !== 'rescore') {
      return NextResponse.json({ error: `mode must be 'repair' or 'rescore', got '${mode}'` }, { status: 400 })
    }

    const chunkDays = parseInt(sp.get('chunkDays') ?? String(DEFAULT_CHUNK_DAYS), 10)
    if (isNaN(chunkDays) || chunkDays < 1 || chunkDays > 60) {
      return NextResponse.json({ error: 'chunkDays must be between 1 and 60' }, { status: 400 })
    }

    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
    const startParam = sp.get('start')
    const endParam = sp.get('end')
    for (const [name, val] of [['start', startParam], ['end', endParam]] as const) {
      if (val && !DATE_RE.test(val)) {
        return NextResponse.json({ error: `${name} must be YYYY-MM-DD` }, { status: 400 })
      }
    }

    // Baselines must exist or every chunk would be a silent no-op.
    const { data: baselineCheck, error: bcErr } = await q(`
      SELECT COUNT(*)::int AS cnt FROM pitch_baselines WHERE game_year = ${year}
    `)
    if (bcErr) return NextResponse.json({ error: bcErr.message }, { status: 500 })
    if (Number(baselineCheck?.[0]?.cnt ?? 0) === 0) {
      return NextResponse.json({
        error: `No baselines found for year ${year}. Run /api/admin/compute-stuff-baselines?year=${year} first.`,
      }, { status: 400 })
    }

    // Walk only the days the season actually spans — avoids ~9 months of empty chunks.
    const { data: span, error: spanErr } = await q(`
      SELECT MIN(game_date)::text AS min_d, MAX(game_date)::text AS max_d
      FROM pitches WHERE game_year = ${year}
    `)
    if (spanErr) return NextResponse.json({ error: spanErr.message }, { status: 500 })

    const rangeStart = startParam ?? span?.[0]?.min_d
    const rangeEnd = endParam ?? span?.[0]?.max_d
    if (!rangeStart || !rangeEnd) {
      return NextResponse.json({ error: `No pitches found for year ${year}`, year }, { status: 400 })
    }

    // Repair mode narrows to unscored rows; rescore rewrites everything eligible.
    const repairOnly = mode === 'repair' ? 'AND p.stuff_plus IS NULL' : ''

    const chunks: { start: string; end: string; updated: number }[] = []
    let totalUpdated = 0
    let covTotal = 0
    let covScored = 0

    let cursor = rangeStart
    while (cursor <= rangeEnd) {
      // Half-open [chunkStart, chunkEnd) so adjacent chunks can't double-count a day.
      const chunkStart = cursor
      const chunkEnd = addDays(chunkStart, chunkDays)

      // Count the exact set the UPDATE will touch. Joining pitch_baselines here matters:
      // a pitch_name with no baseline row is not updatable, and counting it would overstate
      // progress. Date-scoped, so this rides idx_pitches_game_date.
      const { data: targetCount, error: countErr } = await q(`
        SELECT COUNT(*)::int AS cnt
        FROM pitches p
        JOIN pitch_baselines b ON p.pitch_name = b.pitch_name AND p.game_year = b.game_year
        WHERE p.game_date >= '${chunkStart}' AND p.game_date < '${chunkEnd}'
          AND p.release_speed IS NOT NULL
          ${repairOnly}
      `)
      if (countErr) {
        return failure(countErr.message, { year, mode, chunks, totalUpdated, failedChunk: chunkStart })
      }

      const target = Number(targetCount?.[0]?.cnt ?? 0)

      if (target > 0) {
        const { error: updateErr } = await m(`
          UPDATE pitches p
          SET stuff_plus = GREATEST(0, LEAST(200, ROUND(
            100
            + COALESCE((p.release_speed - b.avg_velo) / NULLIF(b.std_velo, 0), 0) * 4.5
            + COALESCE((SQRT(POWER(p.pfx_x * 12, 2) + POWER(p.pfx_z * 12, 2)) - b.avg_movement) / NULLIF(b.std_movement, 0), 0) * 3.5
            + COALESCE((p.release_extension - b.avg_ext) / NULLIF(b.std_ext, 0), 0) * 2.0
          )::numeric))
          FROM pitch_baselines b
          WHERE p.pitch_name = b.pitch_name
            AND p.game_year = b.game_year
            AND p.game_date >= '${chunkStart}' AND p.game_date < '${chunkEnd}'
            AND p.release_speed IS NOT NULL
            ${repairOnly}
        `)
        if (updateErr) {
          // Earlier chunks are already committed — report how far we got so a re-run
          // (idempotent in repair mode) can pick up from here.
          return failure(updateErr.message, { year, mode, chunks, totalUpdated, failedChunk: chunkStart })
        }

        totalUpdated += target
        chunks.push({ start: chunkStart, end: chunkEnd, updated: target })
      }

      // Accumulate coverage per chunk rather than scanning the whole range at the end:
      // a full-season COUNT exceeds the statement_timeout on the run_query RPC role,
      // while these date-scoped counts ride idx_pitches_game_date and stay fast.
      const { data: chunkCov, error: chunkCovErr } = await q(`
        SELECT COUNT(*)::int AS total, COUNT(stuff_plus)::int AS scored
        FROM pitches
        WHERE game_date >= '${chunkStart}' AND game_date < '${chunkEnd}'
      `)
      if (chunkCovErr) {
        return failure(chunkCovErr.message, { year, mode, chunks, totalUpdated, failedChunk: chunkStart })
      }
      covTotal += Number(chunkCov?.[0]?.total ?? 0)
      covScored += Number(chunkCov?.[0]?.scored ?? 0)

      cursor = chunkEnd
    }

    return NextResponse.json({
      ok: true,
      year,
      mode,
      range: { start: rangeStart, end: rangeEnd },
      chunkDays,
      chunks: chunks.length,
      total_updated: totalUpdated,
      coverage: {
        total: covTotal,
        scored: covScored,
        unscored: covTotal - covScored,
        pct: covTotal > 0 ? Math.round((covScored / covTotal) * 1000) / 10 : null,
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    reportError(err, { route: 'admin/backfill-stuff-plus' })
    return NextResponse.json({ error: msg || 'Internal error' }, { status: 500 })
  }
}

/** YYYY-MM-DD + n days, in UTC so DST can't shift a chunk boundary. */
function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function failure(
  message: string,
  ctx: {
    year: number
    mode: string
    chunks: { start: string; end: string; updated: number }[]
    totalUpdated: number
    failedChunk: string
  },
) {
  reportError(new Error(message), {
    route: 'admin/backfill-stuff-plus',
    year: ctx.year,
    mode: ctx.mode,
    failedChunk: ctx.failedChunk,
  })
  return NextResponse.json({
    error: message,
    year: ctx.year,
    mode: ctx.mode,
    chunks: ctx.chunks.length,
    total_updated: ctx.totalUpdated,
    failed_chunk: ctx.failedChunk,
    hint: `Chunks before ${ctx.failedChunk} are committed. Re-run with &start=${ctx.failedChunk} (repair mode is idempotent), or a smaller &chunkDays.`,
  }, { status: 500 })
}
