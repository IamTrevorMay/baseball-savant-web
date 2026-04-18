import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { getCached, setCache } from '@/lib/queryCache'
import { computeTrendAlerts } from '@/lib/trendAlerts'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

export async function POST(req: NextRequest) {
  try {
    const { season = 2025, playerType = 'pitcher', minPitches = 500, tab = 'overview' } = await req.json()
    const safeSeason = parseInt(season)
    if (isNaN(safeSeason)) return NextResponse.json({ error: 'Invalid season' }, { status: 400 })

    // Check DB cache (6h TTL)
    const cacheKey = `trends:${safeSeason}:${playerType}:${minPitches}`
    const cached = await getCached(cacheKey)
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' }
      })
    }

    // Determine if regular season data exists — if so, exclude Spring Training
    const regSeasonCheck = await q(`SELECT 1 FROM pitches WHERE game_year = ${safeSeason} AND game_type = 'R' LIMIT 1`)
    const hasRegularSeason = (regSeasonCheck.data || []).length > 0
    const gameTypeFilter = hasRegularSeason ? "AND game_type = 'R'" : ''

    // Recent window: adaptive based on how much season data exists
    const dateRes = await q(`SELECT MIN(game_date) as earliest, MAX(game_date) as latest FROM pitches WHERE game_year = ${safeSeason} ${gameTypeFilter}`)
    if (dateRes.error) return NextResponse.json({ error: dateRes.error.message }, { status: 500 })
    const latestDate = dateRes.data?.[0]?.latest
    const earliestDate = dateRes.data?.[0]?.earliest
    if (!latestDate) return NextResponse.json({ rows: [], message: 'No data for this season' })

    // If season span is < 21 days, use half the span as the recent window (min 3 days)
    // Otherwise use 14 days
    const seasonSpanDays = Math.round((new Date(latestDate).getTime() - new Date(earliestDate).getTime()) / 86400000)
    const recentWindowDays = seasonSpanDays < 21 ? Math.max(3, Math.floor(seasonSpanDays / 2)) : 14
    const recentDate = new Date(new Date(latestDate).getTime() - recentWindowDays * 86400000).toISOString().slice(0, 10)

    // ── Stuff+ Tab ──
    if (tab === 'stuff') {
      const mp = Math.max(parseInt(String(minPitches)) || 0, 30)
      const leadersRes = await q(`
        SELECT p.pitcher as player_id, pl.name as player_name,
          COUNT(*) as pitches,
          ROUND(AVG(stuff_plus)::numeric, 0) as avg_stuff_plus
        FROM pitches p JOIN players pl ON pl.id = p.pitcher
        WHERE game_year = ${safeSeason} AND stuff_plus IS NOT NULL AND pitch_type NOT IN ('PO','IN') ${gameTypeFilter}
        GROUP BY p.pitcher, pl.name
        HAVING COUNT(*) >= ${mp}
        ORDER BY avg_stuff_plus DESC LIMIT 25
      `)
      const changesRes = await q(`
        SELECT p.pitcher as player_id, pl.name as player_name, pitch_name,
          COUNT(*) as pitches,
          ROUND(AVG(stuff_plus)::numeric, 0) as season_stuff,
          ROUND(AVG(stuff_plus) FILTER (WHERE game_date >= '${recentDate}')::numeric, 0) as recent_stuff
        FROM pitches p JOIN players pl ON pl.id = p.pitcher
        WHERE game_year = ${safeSeason} AND stuff_plus IS NOT NULL AND pitch_type NOT IN ('PO','IN') ${gameTypeFilter}
        GROUP BY p.pitcher, pl.name, pitch_name
        HAVING COUNT(*) >= 20 AND COUNT(*) FILTER (WHERE game_date >= '${recentDate}') >= 5
      `)
      const changes = (changesRes.data || []).map((r: any) => ({
        ...r, delta: (r.recent_stuff || 0) - (r.season_stuff || 0),
      })).filter((r: any) => Math.abs(r.delta) >= 2)
      changes.sort((a: any, b: any) => b.delta - a.delta)
      const result = {
        leaders: leadersRes.data || [],
        gainers: changes.filter((r: any) => r.delta > 0).slice(0, 15),
        losers: changes.filter((r: any) => r.delta < 0).slice(-15).reverse(),
        recentDate, latestDate,
      }
      setCache(`trends:stuff:${safeSeason}:${mp}`, result, { ttlSeconds: 21600 }).catch(() => {})
      return NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=3600' } })
    }

    // ── Arsenal Tab ──
    if (tab === 'arsenal') {
      const mp = Math.max(parseInt(String(minPitches)) || 0, 30)
      const { data: arsenalData, error: aErr } = await q(`
        SELECT p.pitcher as player_id, pl.name as player_name, pitch_name,
          COUNT(*) as pitches,
          ROUND(AVG(release_speed)::numeric, 1) as season_velo,
          ROUND(AVG(release_speed) FILTER (WHERE game_date >= '${recentDate}')::numeric, 1) as recent_velo,
          ROUND(AVG(pfx_z * 12)::numeric, 1) as season_ivb,
          ROUND(AVG(pfx_z * 12) FILTER (WHERE game_date >= '${recentDate}')::numeric, 1) as recent_ivb,
          ROUND(AVG(pfx_x * 12)::numeric, 1) as season_hb,
          ROUND(AVG(pfx_x * 12) FILTER (WHERE game_date >= '${recentDate}')::numeric, 1) as recent_hb,
          ROUND(AVG(release_spin_rate)::numeric, 0) as season_spin,
          ROUND(AVG(release_spin_rate) FILTER (WHERE game_date >= '${recentDate}')::numeric, 0) as recent_spin,
          ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY p.pitcher), 1) as season_usage,
          ROUND(100.0 * COUNT(*) FILTER (WHERE game_date >= '${recentDate}')
            / NULLIF(SUM(COUNT(*) FILTER (WHERE game_date >= '${recentDate}')) OVER (PARTITION BY p.pitcher), 0), 1) as recent_usage
        FROM pitches p JOIN players pl ON pl.id = p.pitcher
        WHERE game_year = ${safeSeason} AND pitch_type NOT IN ('PO','IN') ${gameTypeFilter}
        GROUP BY p.pitcher, pl.name, pitch_name
        HAVING COUNT(*) >= 20 AND COUNT(*) FILTER (WHERE game_date >= '${recentDate}') >= 5
      `)
      if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
      const changes = (arsenalData || []).map((r: any) => ({
        ...r,
        velo_delta: r.recent_velo != null && r.season_velo != null ? +(r.recent_velo - r.season_velo).toFixed(1) : 0,
        ivb_delta: r.recent_ivb != null && r.season_ivb != null ? +(r.recent_ivb - r.season_ivb).toFixed(1) : 0,
        hb_delta: r.recent_hb != null && r.season_hb != null ? +(r.recent_hb - r.season_hb).toFixed(1) : 0,
        spin_delta: r.recent_spin != null && r.season_spin != null ? r.recent_spin - r.season_spin : 0,
        usage_delta: r.recent_usage != null && r.season_usage != null ? +(r.recent_usage - r.season_usage).toFixed(1) : 0,
      }))
      const result = { changes, recentDate, latestDate }
      setCache(`trends:arsenal:${safeSeason}:${mp}`, result, { ttlSeconds: 21600 }).catch(() => {})
      return NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=3600' } })
    }

    const result = await computeTrendAlerts({
      supabase,
      season: safeSeason,
      playerType,
      minPitches: parseInt(String(minPitches)) || 0,
    })
    // Cache for 6 hours (only when we got real data)
    if (result.rows.length > 0) {
      setCache(cacheKey, result, { ttlSeconds: 21600 }).catch(() => {})
    }
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
