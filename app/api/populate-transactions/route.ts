import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// MLB team ID → abbreviation mapping
const TEAM_ABBREVS: Record<number, string> = {
  108:'LAA',109:'ARI',110:'BAL',111:'BOS',112:'CHC',113:'CIN',114:'CLE',115:'COL',
  116:'DET',117:'HOU',118:'KC',119:'LAD',120:'WSH',121:'NYM',133:'OAK',134:'PIT',
  135:'SD',136:'SEA',137:'SF',138:'STL',139:'TB',140:'TEX',141:'TOR',142:'MIN',
  143:'PHI',144:'ATL',145:'CWS',146:'MIA',147:'NYY',158:'MIL',
}

export async function POST(req: NextRequest) {
  try {
    const { start_date, end_date } = await req.json().catch(() => ({
      start_date: '01/01/2024',
      end_date: '12/31/2024',
    }))

    const url = `https://statsapi.mlb.com/api/v1/transactions?startDate=${start_date}&endDate=${end_date}`
    const resp = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!resp.ok) return NextResponse.json({ error: 'MLB API error' }, { status: 502 })

    const data = await resp.json()
    const txns = data.transactions || []

    const rows = txns
      .filter((t: any) => t.person?.id)
      .map((t: any) => ({
        transaction_id: String(t.id),
        date: t.date || t.effectiveDate || null,
        type: t.typeCode || null,
        type_desc: t.typeDesc || null,
        player_id: t.person.id,
        player_name: t.person.fullName || null,
        from_team: t.fromTeam ? (TEAM_ABBREVS[t.fromTeam.id] || t.fromTeam.name) : null,
        to_team: t.toTeam ? (TEAM_ABBREVS[t.toTeam.id] || t.toTeam.name) : null,
        description: t.description || null,
      }))

    if (rows.length === 0) return NextResponse.json({ inserted: 0, message: 'No transactions found' })

    let inserted = 0
    const batchSize = 500
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize)
      const { error } = await supabase.from('transactions').upsert(batch, { onConflict: 'transaction_id' })
      if (error) console.error('Transaction batch error:', error.message)
      else inserted += batch.length
    }

    return NextResponse.json({
      inserted,
      total_api: txns.length,
      message: `Populated ${inserted} transactions for ${start_date} - ${end_date}`,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
