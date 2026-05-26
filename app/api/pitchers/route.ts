import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { checkVisionAuth } from '@/lib/visionAuth'

// GET  /api/pitchers           — list all bullpen pitchers (ordered by name)
// POST /api/pitchers           — create new pitcher {name, throws?, team?}

export async function GET(req: NextRequest) {
  const auth = checkVisionAuth(req)
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('bullpen_pitchers')
    .select('id, name, throws, team, created_at')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pitchers: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = checkVisionAuth(req)
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 })

  let body: { name?: string; throws?: string | null; team?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const name = (body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const throws = body.throws ? body.throws.trim().toUpperCase() : null
  if (throws && throws !== 'R' && throws !== 'L') {
    return NextResponse.json({ error: "throws must be 'R' or 'L'" }, { status: 400 })
  }

  // Idempotent on case-insensitive name (unique index in DDL).
  const { data: existing } = await supabaseAdmin
    .from('bullpen_pitchers')
    .select('id, name, throws, team, created_at')
    .ilike('name', name)
    .maybeSingle()

  if (existing) return NextResponse.json({ pitcher: existing, created: false })

  const { data, error } = await supabaseAdmin
    .from('bullpen_pitchers')
    .insert({ name, throws, team: body.team ?? null })
    .select('id, name, throws, team, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pitcher: data, created: true }, { status: 201 })
}
