import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { gameDay } from '@/lib/gameConstants'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { player_uuid, display_name, puzzle_year, puzzle_type, score, won, guesses, hints_used } = body

    // Validate required fields
    if (
      typeof player_uuid !== 'string' ||
      typeof display_name !== 'string' ||
      typeof puzzle_year !== 'number' ||
      typeof puzzle_type !== 'string' ||
      typeof score !== 'number' ||
      typeof won !== 'boolean' ||
      typeof guesses !== 'number' ||
      typeof hints_used !== 'number'
    ) {
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
    }

    // Validate constraints
    if (display_name.length < 1 || display_name.length > 16) {
      return NextResponse.json({ error: 'Display name must be 1-16 characters' }, { status: 400 })
    }
    if (!['pitcher', 'hitter'].includes(puzzle_type)) {
      return NextResponse.json({ error: 'Invalid puzzle type' }, { status: 400 })
    }
    if (score < 0 || score > 100 || guesses < 1 || guesses > 5 || hints_used < 0 || hints_used > 3) {
      return NextResponse.json({ error: 'Values out of range' }, { status: 400 })
    }

    const today = gameDay()

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

    // Unique constraint violation = already submitted, treat as success
    if (error && error.code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true })
    }
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
