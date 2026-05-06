import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { encrypt, blindIndex } from '@/lib/encryption'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, name, product_slug } = body

    if (!email || !product_slug) {
      return NextResponse.json(
        { error: 'Missing required fields: email, product_slug' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Basic email validation
    if (!normalizedEmail.includes('@') || !normalizedEmail.includes('.')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    // Find product by slug
    const { data: product } = await supabaseAdmin
      .from('email_products')
      .select('id, is_active')
      .eq('slug', product_slug)
      .single()

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    if (!product.is_active) {
      return NextResponse.json({ error: 'Product is not active' }, { status: 400 })
    }

    // Find or create default audience for this product
    let audienceId: string

    const { data: existingAudience } = await supabaseAdmin
      .from('email_audiences')
      .select('id')
      .eq('product_id', product.id)
      .eq('source', 'default')
      .maybeSingle()

    if (existingAudience) {
      audienceId = existingAudience.id
    } else {
      const { data: newAudience, error: audError } = await supabaseAdmin
        .from('email_audiences')
        .insert({
          name: 'Default',
          product_id: product.id,
          source: 'default',
        })
        .select('id')
        .single()

      if (audError || !newAudience) {
        return NextResponse.json(
          { error: audError?.message || 'Failed to create audience' },
          { status: 500 }
        )
      }
      audienceId = newAudience.id
    }

    // Upsert subscriber
    const emailHash = blindIndex(normalizedEmail)
    const encryptedEmail = encrypt(normalizedEmail)
    const encryptedName = name ? encrypt(name.trim()) : null

    const { data: existingSub } = await supabaseAdmin
      .from('email_subscribers')
      .select('id')
      .eq('email_hash', emailHash)
      .maybeSingle()

    let subscriberId: string

    if (existingSub) {
      if (encryptedName) {
        await supabaseAdmin
          .from('email_subscribers')
          .update({ encrypted_name: encryptedName, updated_at: new Date().toISOString() })
          .eq('id', existingSub.id)
      }
      subscriberId = existingSub.id
    } else {
      const { data: newSub, error: subError } = await supabaseAdmin
        .from('email_subscribers')
        .insert({
          encrypted_email: encryptedEmail,
          email_hash: emailHash,
          encrypted_name: encryptedName,
          source: 'subscribe_form',
        })
        .select('id')
        .single()

      if (subError || !newSub) {
        return NextResponse.json(
          { error: subError?.message || 'Failed to create subscriber' },
          { status: 500 }
        )
      }
      subscriberId = newSub.id
    }

    // Add to audience (upsert)
    const { data: existingMember } = await supabaseAdmin
      .from('email_audience_members')
      .select('subscriber_id, is_active')
      .eq('audience_id', audienceId)
      .eq('subscriber_id', subscriberId)
      .maybeSingle()

    if (existingMember) {
      if (!existingMember.is_active) {
        await supabaseAdmin
          .from('email_audience_members')
          .update({ is_active: true, unsubscribed_at: null })
          .eq('audience_id', audienceId)
          .eq('subscriber_id', subscriberId)
      }
    } else {
      const { error: memberError } = await supabaseAdmin
        .from('email_audience_members')
        .insert({ audience_id: audienceId, subscriber_id: subscriberId })

      if (memberError) {
        return NextResponse.json({ error: memberError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, subscriber_id: subscriberId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
