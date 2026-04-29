import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { encrypt, blindIndex } from '@/lib/encryption'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = (body.email || '').trim().toLowerCase()
    const name = (body.name || '').trim() || null

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    const emailHash = blindIndex(email)
    const encryptedEmail = encrypt(email)

    // Upsert: re-activate if previously unsubscribed
    // Dedup via email_hash blind index; plaintext email kept during migration
    const { data, error } = await supabaseAdmin
      .from('newsletter_subscribers')
      .upsert(
        {
          email,
          encrypted_email: encryptedEmail,
          email_hash: emailHash,
          name,
          is_active: true,
          source: 'api',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'email_hash' }
      )
      .select('id, is_active')
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
