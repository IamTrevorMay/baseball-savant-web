import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = (body.email || '').trim().toLowerCase()
    const name = (body.name || '').trim() || null

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    // Upsert: re-activate if previously unsubscribed
    const { data, error } = await supabaseAdmin
      .from('newsletter_subscribers')
      .upsert(
        {
          email,
          name,
          is_active: true,
          source: 'api',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      )
      .select('id, email, is_active')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, subscriber: data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
