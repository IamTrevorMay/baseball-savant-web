import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { populateReportCard } from '@/lib/reportCardPopulate'

export const maxDuration = 300

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization',
}

export async function OPTIONS() {
  return NextResponse.json(null, { headers: corsHeaders })
}

function json(body: any, init?: { status?: number }) {
  return NextResponse.json(body, { ...init, headers: corsHeaders })
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Compute yesterday's date in ET
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  et.setDate(et.getDate() - 1)
  const cardDate = et.toISOString().slice(0, 10)

  // Skip offseason (Dec, Jan)
  const month = et.getMonth() + 1
  if (month === 12 || month === 1) {
    return json({ ok: true, skipped: true, reason: 'offseason' })
  }

  // Force regeneration: delete existing cards for this date
  const force = req.nextUrl.searchParams.get('force') === 'true'
  if (force) {
    await supabaseAdmin.from('daily_cards').delete().eq('date', cardDate)
  }

  // Idempotency: skip if cards already exist for this date
  const { data: existing } = await supabaseAdmin
    .from('daily_cards')
    .select('id')
    .eq('date', cardDate)
    .limit(1)
    .maybeSingle()

  if (existing) {
    return json({ ok: true, skipped: true, reason: 'already_exists', date: cardDate })
  }

  try {
    // 0. Load config (template + top_n)
    const { data: configRow } = await supabaseAdmin
      .from('daily_cards_config')
      .select('template_id, top_n')
      .limit(1)
      .maybeSingle()

    // 1. Fetch finished games via MLB Schedule API
    const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?date=${cardDate}&sportId=1&hydrate=team`
    const scheduleRes = await fetch(scheduleUrl)
    if (!scheduleRes.ok) {
      return json({ error: 'Failed to fetch schedule' }, { status: 500 })
    }
    const scheduleData = await scheduleRes.json()
    const dateEntry = scheduleData?.dates?.[0]
    if (!dateEntry || !dateEntry.games?.length) {
      return json({ ok: true, skipped: true, reason: 'no_games', date: cardDate })
    }

    const finishedGames = (dateEntry.games || []).filter(
      (g: any) => g.status?.abstractGameState === 'Final'
    )

    if (finishedGames.length === 0) {
      return json({ ok: true, skipped: true, reason: 'no_finished_games', date: cardDate })
    }

    // 2. Fetch boxscores and extract starting pitchers
    interface StarterInfo {
      mlbId: number
      name: string
      ip: number
      pitchCount: number
      gamePk: number
      gameInfo: string
    }

    const starters: StarterInfo[] = []

    // Batch boxscore fetches (5 at a time)
    for (let i = 0; i < finishedGames.length; i += 5) {
      const batch = finishedGames.slice(i, i + 5)
      const results = await Promise.allSettled(
        batch.map(async (game: any) => {
          const gamePk = game.gamePk
          const boxRes = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`)
          if (!boxRes.ok) return null
          const box = await boxRes.json()

          const awayAbbrev = game.teams?.away?.team?.abbreviation || '??'
          const homeAbbrev = game.teams?.home?.team?.abbreviation || '??'
          const gameInfo = `${awayAbbrev} @ ${homeAbbrev}`

          // Extract starting pitcher from each side (first in pitchers array)
          for (const side of ['away', 'home'] as const) {
            const pitcherIds = box.teams?.[side]?.pitchers || []
            if (pitcherIds.length === 0) continue
            const starterId = pitcherIds[0]
            const playerData = box.teams?.[side]?.players?.[`ID${starterId}`]
            if (!playerData) continue
            const pStats = playerData.stats?.pitching
            if (!pStats) continue

            const ipStr = pStats.inningsPitched || '0.0'
            // Parse IP: "6.2" means 6 and 2/3
            const ipParts = ipStr.split('.')
            const fullInnings = parseInt(ipParts[0]) || 0
            const partialOuts = parseInt(ipParts[1]) || 0
            const ipNumeric = fullInnings + partialOuts / 3

            starters.push({
              mlbId: starterId,
              name: playerData.person?.fullName || 'Unknown',
              ip: ipNumeric,
              pitchCount: pStats.numberOfPitches ?? 0,
              gamePk,
              gameInfo,
            })
          }
        })
      )
      // Just process fulfilled results (errors are silently skipped)
      for (const r of results) {
        if (r.status === 'rejected') console.error('Boxscore fetch failed:', r.reason)
      }
    }

    if (starters.length === 0) {
      return json({ ok: true, skipped: true, reason: 'no_starters', date: cardDate })
    }

    // 3. Sort by IP desc, pitch_count desc → top N
    const topN = configRow?.top_n || 5
    starters.sort((a, b) => b.ip - a.ip || b.pitchCount - a.pitchCount)
    const top5 = starters.slice(0, topN)

    // 4. Load template from config (falls back to name search if no config)
    let templateData: any = null
    let templateError: any = null

    if (configRow?.template_id) {
      const result = await supabaseAdmin
        .from('report_card_templates')
        .select('*')
        .eq('id', configRow.template_id)
        .maybeSingle()
      templateData = result.data
      templateError = result.error
    }

    // Fallback: search by name if config missing or template deleted
    if (!templateData) {
      const result = await supabaseAdmin
        .from('report_card_templates')
        .select('*')
        .eq('user_id', DEFAULT_USER_ID)
        .ilike('name', '%Starter Card%')
        .limit(1)
        .maybeSingle()
      templateData = result.data
      templateError = result.error
    }

    if (templateError || !templateData) {
      return json({
        error: 'No report card template found. Set one in daily cards config.',
        detail: templateError?.message,
      }, { status: 500 })
    }

    const templateScene = {
      id: templateData.id,
      name: templateData.name,
      width: templateData.width,
      height: templateData.height,
      background: templateData.background,
      elements: templateData.elements || [],
    }

    // 5. For each starter: fetch data from /api/starter-card, populate template
    // Use NEXT_PUBLIC_SITE_URL (production domain) to avoid Vercel deployment protection
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || (
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'
    )

    const cards: any[] = []

    for (let rank = 0; rank < top5.length; rank++) {
      const starter = top5[rank]
      try {
        const cardRes = await fetch(
          `${baseUrl}/api/starter-card?pitcherId=${starter.mlbId}&gamePk=${starter.gamePk}`
        )
        if (!cardRes.ok) {
          console.error(`starter-card failed for ${starter.name}:`, await cardRes.text())
          continue
        }
        const cardJson = await cardRes.json()
        const data = cardJson.data || cardJson

        // Override with MLB API data (more reliable for spring training / missing pitch data)
        if (!data.pitcher_name || data.pitcher_name === 'Unknown') {
          data.pitcher_name = starter.name
        }
        if (!data.game_date) data.game_date = cardDate
        if (!data.opponent || data.opponent === '??') data.opponent = starter.gameInfo

        const populated = populateReportCard(templateScene, data)

        cards.push({
          date: cardDate,
          pitcher_id: starter.mlbId,
          pitcher_name: starter.name,
          game_pk: starter.gamePk,
          game_info: starter.gameInfo,
          ip: starter.ip,
          pitch_count: starter.pitchCount,
          scene: populated,
          template_id: templateData.id,
          rank: rank + 1,
        })
      } catch (err) {
        console.error(`Failed to generate card for ${starter.name}:`, err)
      }
    }

    if (cards.length === 0) {
      return json({ error: 'No cards generated', date: cardDate }, { status: 500 })
    }

    // 6. Batch insert
    const { error: insertError } = await supabaseAdmin
      .from('daily_cards')
      .insert(cards)

    if (insertError) {
      return json({ error: insertError.message }, { status: 500 })
    }

    return json({
      ok: true,
      date: cardDate,
      count: cards.length,
      pitchers: cards.map(c => c.pitcher_name),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, { status: 500 })
  }
}
