import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, role = 'user', tools = [] } = await request.json()
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  // Generate invite link without sending Supabase's default email
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${siteUrl}/auth/callback?next=/set-password` },
  })
  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }

  // Use Supabase's action_link which goes through their verification endpoint
  // then redirects to our callback with a PKCE code — more reliable than raw token_hash
  const inviteLink = linkData.properties.action_link
  const { error: emailError } = await resend.emails.send({
    from: 'Triton Apex <noreply@tritonapex.io>',
    to: email,
    subject: "You've been invited to Triton Apex",
    html: `
      <div style="background-color:#09090b;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:480px;margin:0 auto;">
          <h1 style="color:#f97316;font-size:28px;text-align:center;margin-bottom:8px;letter-spacing:2px;">TRITON APEX</h1>
          <p style="color:#a1a1aa;text-align:center;font-size:14px;margin-bottom:32px;">Baseball Analytics Platform</p>
          <div style="background-color:#18181b;border:1px solid #27272a;border-radius:12px;padding:32px;">
            <p style="color:#e4e4e7;font-size:15px;line-height:1.6;margin:0 0 24px;">
              You've been invited to join Triton Apex. Click the button below to create your account and set your password.
            </p>
            <a href="${inviteLink}" style="display:block;text-align:center;background-color:#059669;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
              Accept Invite
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
    return NextResponse.json({ error: emailError.message }, { status: 500 })
  }

  const invitedUserId = linkData.user.id

  // Pre-create profile with chosen role
  await supabaseAdmin.from('profiles').upsert({
    id: invitedUserId,
    email,
    role,
  }, { onConflict: 'id' })

  // Insert tool permissions for non-admin roles
  if (role !== 'owner' && role !== 'admin' && tools.length > 0) {
    const permRows = tools.map((tool: string) => ({
      user_id: invitedUserId,
      granted_by: user.id,
      tool,
    }))
    await supabaseAdmin.from('tool_permissions').insert(permRows)
  }

  // Record invitation
  await supabaseAdmin.from('invitations').insert({
    email,
    role,
    tools,
    invited_by: user.id,
  })

  return NextResponse.json({ success: true })
}
