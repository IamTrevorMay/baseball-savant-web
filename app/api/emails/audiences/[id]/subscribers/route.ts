import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { encrypt, decrypt, blindIndex } from '@/lib/encryption'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1')
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    // Get total count
    const { count } = await supabaseAdmin
      .from('email_audience_members')
      .select('*', { count: 'exact', head: true })
      .eq('audience_id', id)
      .eq('is_active', true)

    // Get paginated members with subscriber data
    const { data: members, error } = await supabaseAdmin
      .from('email_audience_members')
      .select('subscriber_id, subscribed_at, email_subscribers:subscriber_id(id, encrypted_email, encrypted_name, source, created_at)')
      .eq('audience_id', id)
      .eq('is_active', true)
      .order('subscribed_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Decrypt emails and names
    const subscribers = (members || []).map((m: any) => {
      const sub = m.email_subscribers
      if (!sub) return null

      let email = ''
      let name: string | null = null

      try {
        email = decrypt(sub.encrypted_email)
      } catch {
        email = '[decryption error]'
      }

      if (sub.encrypted_name) {
        try {
          name = decrypt(sub.encrypted_name)
        } catch {
          name = '[decryption error]'
        }
      }

      return {
        subscriber_id: sub.id,
        email,
        name,
        source: sub.source,
        subscribed_at: m.subscribed_at,
        created_at: sub.created_at,
      }
    }).filter(Boolean)

    return NextResponse.json({
      subscribers,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        pages: Math.ceil((count ?? 0) / limit),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = await request.json()
    const { email, name } = body

    if (!email) {
      return NextResponse.json(
        { error: 'Missing required field: email' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()
    const emailHash = blindIndex(normalizedEmail)
    const encryptedEmail = encrypt(normalizedEmail)
    const encryptedName = name ? encrypt(name.trim()) : null

    // Upsert subscriber by email_hash
    const { data: existing } = await supabaseAdmin
      .from('email_subscribers')
      .select('id')
      .eq('email_hash', emailHash)
      .maybeSingle()

    let subscriberId: string

    if (existing) {
      // Update name if provided
      if (encryptedName) {
        await supabaseAdmin
          .from('email_subscribers')
          .update({ encrypted_name: encryptedName, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      }
      subscriberId = existing.id
    } else {
      // Create new subscriber
      const { data: newSub, error: insertError } = await supabaseAdmin
        .from('email_subscribers')
        .insert({
          encrypted_email: encryptedEmail,
          email_hash: emailHash,
          encrypted_name: encryptedName,
          source: 'api',
        })
        .select('id')
        .single()

      if (insertError || !newSub) {
        return NextResponse.json(
          { error: insertError?.message || 'Failed to create subscriber' },
          { status: 500 }
        )
      }
      subscriberId = newSub.id
    }

    // Add to audience (upsert: reactivate if previously deactivated)
    const { data: existingMember } = await supabaseAdmin
      .from('email_audience_members')
      .select('subscriber_id, is_active')
      .eq('audience_id', id)
      .eq('subscriber_id', subscriberId)
      .maybeSingle()

    if (existingMember) {
      if (!existingMember.is_active) {
        await supabaseAdmin
          .from('email_audience_members')
          .update({ is_active: true, unsubscribed_at: null })
          .eq('audience_id', id)
          .eq('subscriber_id', subscriberId)
      }
    } else {
      const { error: memberError } = await supabaseAdmin
        .from('email_audience_members')
        .insert({ audience_id: id, subscriber_id: subscriberId })

      if (memberError) {
        return NextResponse.json({ error: memberError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ subscriber_id: subscriberId }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = await request.json()
    const { subscriber_id } = body

    if (!subscriber_id) {
      return NextResponse.json(
        { error: 'Missing required field: subscriber_id' },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('email_audience_members')
      .update({ is_active: false, unsubscribed_at: new Date().toISOString() })
      .eq('audience_id', id)
      .eq('subscriber_id', subscriber_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
