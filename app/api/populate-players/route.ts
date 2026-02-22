import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST() {
  try {
    const { data: unknowns } = await supabaseAdmin
      .from('players').select('id').eq('name', 'Unknown').limit(500)

    if (!unknowns || unknowns.length === 0) {
      return NextResponse.json({ message: 'No unknown players remaining', remaining: 0 })
    }

    let updated = 0
    let errors = 0

    for (let i = 0; i < unknowns.length; i += 10) {
      const batch = unknowns.slice(i, i + 10)
      const promises = batch.map(async (p) => {
        try {
          const res = await fetch(`https://statsapi.mlb.com/api/v1/people/${p.id}`)
          if (!res.ok) return null
          const data = await res.json()
          const person = data?.people?.[0]
          if (!person) return null
          return {
            id: p.id,
            name: person.fullName || 'Unknown',
            position: person.primaryPosition?.abbreviation || null,
          }
        } catch { return null }
      })

      const results = await Promise.all(promises)
      for (const r of results) {
        if (r && r.name !== 'Unknown') {
          const parts = r.name.split(' ')
          const formatted = parts.length > 1
            ? `${parts.slice(-1)[0]}, ${parts.slice(0, -1).join(' ')}`
            : r.name

          await supabaseAdmin.from('players').update({
            name: formatted,
            position: r.position,
            updated_at: new Date().toISOString()
          }).eq('id', r.id)
          updated++
        } else {
          errors++
        }
      }
    }

    const { count } = await supabaseAdmin
      .from('players').select('*', { count: 'exact', head: true }).eq('name', 'Unknown')

    return NextResponse.json({ updated, errors, remaining: count })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
