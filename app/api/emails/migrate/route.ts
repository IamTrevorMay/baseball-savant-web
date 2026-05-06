import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { encrypt, blindIndex } from '@/lib/encryption'
import crypto from 'crypto'

/**
 * One-time migration endpoint: copies newsletter_subscribers → email_subscribers
 * and adds them to the Mayday Daily audience.
 *
 * POST /api/emails/migrate
 * Authorization: Bearer {CRON_SECRET}
 *
 * Requires ENCRYPTION_KEY and BLIND_INDEX_KEY env vars (available server-side).
 */

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Find or confirm Mayday Daily product exists
    const { data: product } = await supabaseAdmin
      .from('email_products')
      .select('id')
      .eq('slug', 'mayday-daily')
      .single()

    if (!product) {
      return NextResponse.json({ error: 'Mayday Daily product not found. Run the seed migration first.' }, { status: 404 })
    }

    // 2. Find or create default audience
    let { data: audience } = await supabaseAdmin
      .from('email_audiences')
      .select('id')
      .eq('product_id', product.id)
      .eq('source', 'default')
      .maybeSingle()

    if (!audience) {
      const { data: newAud, error: audErr } = await supabaseAdmin
        .from('email_audiences')
        .insert({
          name: 'Mayday Daily Subscribers',
          product_id: product.id,
          source: 'default',
        })
        .select('id')
        .single()
      if (audErr) return NextResponse.json({ error: audErr.message }, { status: 500 })
      audience = newAud
    }

    const audienceId = audience!.id

    // 3. Fetch all active newsletter subscribers
    const { data: oldSubs, error: subErr } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('id, email, encrypted_email, email_hash, name, source, unsubscribe_token, created_at')
      .eq('is_active', true)

    if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })

    let migrated = 0
    let skipped = 0
    const errors: string[] = []

    for (const old of oldSubs || []) {
      try {
        // Get plaintext email — decrypt if encrypted, otherwise use plaintext
        let email: string
        if (old.encrypted_email) {
          const { decrypt } = await import('@/lib/encryption')
          email = decrypt(old.encrypted_email)
        } else {
          email = old.email
        }

        if (!email) { skipped++; continue }

        const emailLower = email.toLowerCase().trim()
        const hash = old.email_hash || blindIndex(emailLower)
        const enc = old.encrypted_email || encrypt(emailLower)
        const encName = old.name ? encrypt(old.name) : null
        // Convert uuid token to hex string format for the new table
        const token = old.unsubscribe_token
          ? old.unsubscribe_token.replace(/-/g, '')
          : crypto.randomBytes(32).toString('hex')

        // Upsert subscriber
        const { data: sub, error: insErr } = await supabaseAdmin
          .from('email_subscribers')
          .upsert({
            encrypted_email: enc,
            email_hash: hash,
            encrypted_name: encName,
            source: old.source || 'migration',
            unsubscribe_token: token,
            metadata: { migrated_from: 'newsletter_subscribers', original_id: old.id },
            created_at: old.created_at,
          }, { onConflict: 'email_hash' })
          .select('id')
          .single()

        if (insErr || !sub) {
          errors.push(`${emailLower}: ${insErr?.message || 'insert failed'}`)
          skipped++
          continue
        }

        // Add to audience
        await supabaseAdmin
          .from('email_audience_members')
          .upsert({
            audience_id: audienceId,
            subscriber_id: sub.id,
            is_active: true,
          }, { onConflict: 'audience_id,subscriber_id' })

        migrated++
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${old.id}: ${msg}`)
        skipped++
      }
    }

    // Update audience subscriber count
    await supabaseAdmin
      .from('email_audiences')
      .update({ subscriber_count: migrated, updated_at: new Date().toISOString() })
      .eq('id', audienceId)

    return NextResponse.json({
      ok: true,
      product_id: product.id,
      audience_id: audienceId,
      migrated,
      skipped,
      total: (oldSubs || []).length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
