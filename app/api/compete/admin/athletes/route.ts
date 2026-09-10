import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * Compete Admin — athlete account management.
 *
 * POST creates an athlete: invites the email (branded Resend mail with a
 * Supabase invite link → /set-password → the launcher bounces the athlete
 * role straight into /compete), sets profiles.role='athlete', and creates
 * the athlete_profiles row. That row's id IS the canonical Athlete ID —
 * every integration (Whoop, TrackMan, mocap) keys to it.
 *
 * GET lists the roster with invite status.
 *
 * Modeled on /api/admin/invite; gated to owner/admin like is_compete_admin.
 */

const LEVELS = new Set(['youth', 'hs', 'college', 'indy', 'pro'])

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user }
}

export async function GET() {
  const gate = await requireAdmin()
  if ('error' in gate) return gate.error

  const { data: athletes, error } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id, profile_id, height_in, weight_lbs, level, position, created_at, profiles:profile_id (full_name, email)')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Invite status: signed in at least once = active, else still invited.
  const rows = await Promise.all((athletes || []).map(async (a: any) => {
    let status = 'invited'
    if (a.profile_id) {
      const { data } = await supabaseAdmin.auth.admin.getUserById(a.profile_id)
      if (data?.user?.last_sign_in_at) status = 'active'
    }
    return {
      athleteId: a.id,
      name: a.profiles?.full_name || '—',
      email: a.profiles?.email || '—',
      heightIn: a.height_in,
      weightLbs: a.weight_lbs,
      level: a.level,
      createdAt: a.created_at,
      status,
    }
  }))
  return NextResponse.json({ athletes: rows })
}

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if ('error' in gate) return gate.error
  const admin = gate.user

  const body = await request.json()
  const firstName = String(body.firstName || '').trim()
  const lastName = String(body.lastName || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const heightIn = Number(body.heightIn) || null
  const weightLbs = Number(body.weightLbs) || null
  const level = LEVELS.has(body.level) ? body.level : null

  if (!firstName || !lastName || !email) {
    return NextResponse.json({ error: 'First name, last name, and email are required' }, { status: 400 })
  }

  // One account per email — surface the conflict rather than silently re-inviting
  const { data: existing } = await supabaseAdmin
    .from('profiles').select('id, role').eq('email', email).maybeSingle()
  if (existing) {
    return NextResponse.json({ error: `An account already exists for ${email} (role: ${existing.role})` }, { status: 409 })
  }

  const fullName = `${firstName} ${lastName}`
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${siteUrl}/auth/callback?next=/set-password` },
  })
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 })

  const invitedUserId = linkData.user.id
  const tokenHash = linkData.properties.hashed_token
  const inviteLink = `${siteUrl}/auth/callback?token_hash=${tokenHash}&type=invite&next=/set-password`

  // Athlete role first: if anything below fails, the account is still
  // correctly scoped to Compete-only rather than default 'user'.
  const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
    id: invitedUserId,
    email,
    full_name: fullName,
    display_name: firstName,
    role: 'athlete',
  }, { onConflict: 'id' })
  if (profileErr) {
    return NextResponse.json({ error: `Failed to set athlete role: ${profileErr.message}` }, { status: 500 })
  }

  const { data: athleteProfile, error: athleteErr } = await supabaseAdmin
    .from('athlete_profiles')
    .insert({
      profile_id: invitedUserId,
      height_in: heightIn,
      weight_lbs: weightLbs,
      level,
    })
    .select('id')
    .single()
  if (athleteErr) {
    return NextResponse.json({ error: `Failed to create athlete profile: ${athleteErr.message}` }, { status: 500 })
  }

  const { error: emailError } = await resend.emails.send({
    from: 'Triton Apex <noreply@tritonapex.io>',
    to: email,
    subject: `${firstName}, your Compete athlete account is ready`,
    html: `
      <div style="background-color:#09090b;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:480px;margin:0 auto;">
          <h1 style="color:#f97316;font-size:28px;text-align:center;margin-bottom:8px;letter-spacing:2px;">TRITON APEX</h1>
          <p style="color:#a1a1aa;text-align:center;font-size:14px;margin-bottom:32px;">Compete — Athlete Development</p>
          <div style="background-color:#18181b;border:1px solid #27272a;border-radius:12px;padding:32px;">
            <p style="color:#e4e4e7;font-size:15px;line-height:1.6;margin:0 0 24px;">
              Hi ${firstName} — your athlete account has been created. Click below to set your
              password and open Compete, where your training data, reports, and progress live.
            </p>
            <a href="${inviteLink}" style="display:block;text-align:center;background-color:#059669;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
              Set Password &amp; Enter Compete
            </a>
            <p style="color:#71717a;font-size:12px;margin-top:24px;text-align:center;">
              This link will expire in 24 hours.
            </p>
          </div>
        </div>
      </div>
    `,
  })
  if (emailError) {
    // Account + athlete profile exist; the invite just needs re-sending.
    return NextResponse.json({
      error: `Athlete created but the invite email failed (${emailError.message}). Use Resend Invite.`,
      athleteId: athleteProfile.id,
    }, { status: 502 })
  }

  await supabaseAdmin.from('invitations').insert({
    email,
    role: 'athlete',
    tools: [],
    invited_by: admin.id,
  })

  return NextResponse.json({ success: true, athleteId: athleteProfile.id })
}

/**
 * DELETE — remove an athlete account entirely. Deletes the auth user, which
 * cascades: profiles → athlete_profiles → whoop_* / biomech_captures.
 * compete_pitches.athlete_profile_id is ON DELETE SET NULL, so pitch data
 * survives unattributed. Only role='athlete' accounts can be deleted here —
 * this endpoint must never be able to nuke a staff account.
 */
export async function DELETE(request: Request) {
  const gate = await requireAdmin()
  if ('error' in gate) return gate.error

  const { athleteId } = await request.json()
  if (!athleteId) return NextResponse.json({ error: 'athleteId required' }, { status: 400 })

  const { data: a } = await supabaseAdmin
    .from('athlete_profiles')
    .select('profile_id, profiles:profile_id (role, email)')
    .eq('id', athleteId).single()
  if (!a?.profile_id) return NextResponse.json({ error: 'Athlete not found' }, { status: 404 })
  if ((a as any).profiles?.role !== 'athlete') {
    return NextResponse.json({ error: 'Only athlete-role accounts can be deleted here' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(a.profile_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

/** PUT — re-send the invite for an athlete who hasn't signed in yet (links expire in 24h). */
export async function PUT(request: Request) {
  const gate = await requireAdmin()
  if ('error' in gate) return gate.error

  const { athleteId } = await request.json()
  if (!athleteId) return NextResponse.json({ error: 'athleteId required' }, { status: 400 })

  const { data: a } = await supabaseAdmin
    .from('athlete_profiles')
    .select('profile_id, profiles:profile_id (email, full_name, display_name)')
    .eq('id', athleteId).single()
  const email = (a as any)?.profiles?.email
  if (!email) return NextResponse.json({ error: 'Athlete not found' }, { status: 404 })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
  // 'invite' only works once per user; for an existing user a recovery link
  // serves the same purpose — set a password, land in Compete.
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${siteUrl}/auth/callback?next=/set-password` },
  })
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 })

  const inviteLink = `${siteUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=recovery&next=/set-password`
  const firstName = (a as any)?.profiles?.display_name || (a as any)?.profiles?.full_name || 'there'
  const { error: emailError } = await resend.emails.send({
    from: 'Triton Apex <noreply@tritonapex.io>',
    to: email,
    subject: `${firstName}, here's a fresh link to your Compete account`,
    html: `
      <div style="background-color:#09090b;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:480px;margin:0 auto;">
          <h1 style="color:#f97316;font-size:28px;text-align:center;margin-bottom:8px;letter-spacing:2px;">TRITON APEX</h1>
          <p style="color:#a1a1aa;text-align:center;font-size:14px;margin-bottom:32px;">Compete — Athlete Development</p>
          <div style="background-color:#18181b;border:1px solid #27272a;border-radius:12px;padding:32px;">
            <p style="color:#e4e4e7;font-size:15px;line-height:1.6;margin:0 0 24px;">
              Hi ${firstName} — here's a fresh link to set your password and open Compete.
            </p>
            <a href="${inviteLink}" style="display:block;text-align:center;background-color:#059669;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
              Set Password &amp; Enter Compete
            </a>
            <p style="color:#71717a;font-size:12px;margin-top:24px;text-align:center;">This link will expire in 24 hours.</p>
          </div>
        </div>
      </div>
    `,
  })
  if (emailError) return NextResponse.json({ error: emailError.message }, { status: 502 })
  return NextResponse.json({ success: true })
}
