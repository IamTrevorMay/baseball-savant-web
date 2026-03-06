import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { gameDay, dailyPlayerIndex, SCORE_TABLE, HINT_COSTS, GREEN_BONUS } from '@/lib/gameConstants'
import { SEASON_CONSTANTS } from '@/lib/constants-data'

// ── Pool cache (same for all submissions on the same day) ──
const poolCache = new Map<string, { pool: PoolEntry[]; ts: number }>()
interface PoolEntry { player_id: number; role?: string }

async function getPool(year: number, type: string): Promise<PoolEntry[]> {
  const today = gameDay()
  const cacheKey = `${year}-${type}-${today}`
  const cached = poolCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < 3600_000) return cached.pool

  let sql: string
  if (type === 'pitcher') {
    sql = `
      SELECT pitcher AS player_id,
        CASE WHEN COUNT(DISTINCT CASE WHEN inning = 1 THEN game_pk END)::numeric
             / NULLIF(COUNT(DISTINCT game_pk), 0) > 0.5
             THEN 'SP' ELSE 'RP' END AS role
      FROM pitches
      WHERE game_year = ${year} AND pitch_type NOT IN ('PO','IN')
      GROUP BY pitcher
      HAVING COUNT(*) >= 500
      ORDER BY pitcher`
  } else {
    sql = `
      SELECT p.batter AS player_id
      FROM pitches p
      JOIN players pl ON pl.id = p.batter
      WHERE p.game_year = ${year} AND p.pitch_type NOT IN ('PO','IN')
      GROUP BY p.batter
      HAVING COUNT(DISTINCT CASE WHEN p.events IS NOT NULL
                   THEN CONCAT(p.game_pk, p.at_bat_number) END) >= 200
      ORDER BY p.batter`
  }

  const { data, error } = await supabaseAdmin.rpc('run_query', { query_text: sql.trim() })
  if (error) throw error

  const pool = (data as Record<string, unknown>[]).map(r => ({
    player_id: r.player_id as number,
    role: r.role as string | undefined,
  }))

  poolCache.set(cacheKey, { pool, ts: Date.now() })
  for (const [k, v] of poolCache) { if (Date.now() - v.ts > 86400_000) poolCache.delete(k) }
  return pool
}

// ── Player metadata (for green-square bonus) ──
interface PlayerMeta { number: string; position: string; birthCountry: string; age: number }
const metaCache = new Map<number, PlayerMeta>()

async function fetchPlayerMeta(id: number): Promise<PlayerMeta | null> {
  const cached = metaCache.get(id)
  if (cached) return cached
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/people/${id}`)
    const data = await res.json()
    const person = data.people?.[0]
    if (!person) return null
    const birthDate = person.birthDate ? new Date(person.birthDate) : null
    const age = birthDate
      ? Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 86400_000))
      : 0
    const meta: PlayerMeta = {
      number: person.primaryNumber || '?',
      position: person.primaryPosition?.abbreviation || '?',
      birthCountry: person.birthCountry || '?',
      age,
    }
    metaCache.set(id, meta)
    return meta
  } catch { return null }
}

function countGreenSquares(
  guessMeta: PlayerMeta | null, answerMeta: PlayerMeta | null,
  guessRole: string | undefined, answerRole: string | undefined,
  playerType: string,
): number {
  if (!guessMeta || !answerMeta) return 0
  let greens = 0
  if (guessMeta.number === answerMeta.number) greens++
  if (guessMeta.birthCountry === answerMeta.birthCountry) greens++
  if (guessMeta.age === answerMeta.age) greens++
  const guessPos = playerType === 'pitcher' ? (guessRole || 'P') : guessMeta.position
  const answerPos = playerType === 'pitcher' ? (answerRole || 'P') : answerMeta.position
  if (guessPos === answerPos) greens++
  return greens
}

// ── POST handler ──
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { player_uuid, display_name, puzzle_year, puzzle_type, guess_ids, hints_used } = body

    // ── Type validation ──
    if (
      typeof player_uuid !== 'string' ||
      typeof display_name !== 'string' ||
      typeof puzzle_year !== 'number' ||
      typeof puzzle_type !== 'string' ||
      !Array.isArray(guess_ids) ||
      typeof hints_used !== 'number'
    ) {
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
    }

    // ── Constraint validation ──
    if (display_name.length < 1 || display_name.length > 16)
      return NextResponse.json({ error: 'Display name must be 1-16 characters' }, { status: 400 })
    if (!['pitcher', 'hitter'].includes(puzzle_type))
      return NextResponse.json({ error: 'Invalid puzzle type' }, { status: 400 })
    if (![...Object.keys(SEASON_CONSTANTS)].map(Number).includes(puzzle_year))
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
    if (guess_ids.length < 1 || guess_ids.length > 5)
      return NextResponse.json({ error: 'Invalid number of guesses' }, { status: 400 })
    if (hints_used < 0 || hints_used > 3)
      return NextResponse.json({ error: 'Invalid hints_used' }, { status: 400 })
    if (!guess_ids.every((id: unknown) => typeof id === 'number'))
      return NextResponse.json({ error: 'guess_ids must be numbers' }, { status: 400 })
    if (new Set(guess_ids).size !== guess_ids.length)
      return NextResponse.json({ error: 'Duplicate guess_ids' }, { status: 400 })
    if (hints_used > Math.min(guess_ids.length - 1, 3))
      return NextResponse.json({ error: 'Too many hints for number of guesses' }, { status: 400 })

    // ── Reconstruct correct answer ──
    const pool = await getPool(puzzle_year, puzzle_type)
    const poolMap = new Map(pool.map(p => [p.player_id, p]))

    // Validate all guess_ids exist in pool
    for (const gid of guess_ids) {
      if (!poolMap.has(gid))
        return NextResponse.json({ error: 'Invalid guess_id' }, { status: 400 })
    }

    const today = gameDay()
    const answerIdx = dailyPlayerIndex(today, puzzle_year, puzzle_type, pool.length)
    const correctId = pool[answerIdx].player_id
    const answerRole = pool[answerIdx].role

    // ── Determine outcome ──
    const correctGuessIdx = guess_ids.indexOf(correctId)
    const won = correctGuessIdx >= 0
    const guesses = guess_ids.length

    // If won, correct must be the last guess (player stops after correct)
    if (won && correctGuessIdx !== guesses - 1)
      return NextResponse.json({ error: 'Correct answer must be the last guess' }, { status: 400 })
    // If not won, must have exhausted all 5 guesses
    if (!won && guesses !== 5)
      return NextResponse.json({ error: 'Must use all 5 guesses if not won' }, { status: 400 })

    // ── Green bonus (fetch metadata in parallel) ──
    const wrongGuessIds = won ? guess_ids.slice(0, -1) : guess_ids
    const allMetaIds = [correctId, ...wrongGuessIds]
    const allMetas = await Promise.all(allMetaIds.map(id => fetchPlayerMeta(id)))
    const answerMeta = allMetas[0]

    let greenBonus = 0
    wrongGuessIds.forEach((gid: number, i: number) => {
      greenBonus += countGreenSquares(
        allMetas[i + 1], answerMeta,
        poolMap.get(gid)?.role, answerRole, puzzle_type,
      ) * GREEN_BONUS
    })

    // ── Compute score ──
    let score: number
    if (won) {
      const hintPenalty = HINT_COSTS.slice(0, hints_used).reduce((s, c) => s + c, 0)
      score = Math.min(100, Math.max(0, SCORE_TABLE[correctGuessIdx] - hintPenalty + greenBonus))
    } else {
      score = Math.min(100, greenBonus)
    }

    // ── Insert (ON CONFLICT = duplicate = success) ──
    const { error } = await supabaseAdmin.from('game_scores').insert({
      player_uuid,
      display_name,
      puzzle_date: today,
      puzzle_year,
      puzzle_type,
      score,
      won,
      guesses,
      hints_used,
    })

    if (error && error.code === '23505')
      return NextResponse.json({ ok: true, duplicate: true })
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Leaderboard submit error:', e)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
