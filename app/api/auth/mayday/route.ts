import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyToken } from '@/lib/maydaySso'

/**
 * GET /api/auth/mayday?token=<payload>.<signature>
 *
 * The Triton half of "Continue with Mayday Studio" SSO. Mayday verifies its
 * own session, signs a short-lived assertion for the user's email, and
 * redirects the browser here; this endpoint verifies the signature, finds or
 * auto-provisions the Triton account, mints a magiclink session, and hands
 * off to the existing /auth/callback route. Passwords never leave Mayday.
 *
 * Token: base64url(JSON{ email, name?, iat }) + "." +
 *        base64url(HMAC-SHA256(payload, MAYDAY_SSO_SECRET)).
 * `iat` is unix seconds; assertions older than TOKEN_TTL_S are rejected, so
 * a leaked URL goes stale almost immediately. Mayday's side of the contract
 * is specced in docs/mayday-sso.md and must use the same secret.
 *
 * First-time users get the DB trigger's default 'user' role plus a
 * 'research' tool grant — the same baseline a manual invite with Research
 * access would produce. Admins can adjust from the admin panel afterwards.
 */

const DEFAULT_TOOLS = ['research']

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/login?error=mayday_sso&reason=${encodeURIComponent(reason)}`)

  const secret = process.env.MAYDAY_SSO_SECRET
  if (!secret) return fail('not_configured')

  const token = req.nextUrl.searchParams.get('token')
  if (!token) return fail('missing_token')

  const assertion = verifyToken(token, secret)
  if (!assertion) return fail('invalid_token')
  const { email, name } = assertion

  try {
    // Mint the session link. generateLink is also our existence check: for a
    // user Supabase doesn't know it fails, and we provision then retry.
    let link = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email })

    if (link.error) {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: name ?? undefined, sso_provider: 'mayday' },
      })
      if (createErr || !created.user) return fail('provision_failed')

      // The on_auth_user_created trigger inserts a default-role profile row;
      // fill in what the assertion carries and grant the baseline tool.
      await supabaseAdmin.from('profiles').upsert(
        { id: created.user.id, email, ...(name ? { full_name: name } : {}) },
        { onConflict: 'id' },
      )
      await supabaseAdmin.from('tool_permissions').insert(
        DEFAULT_TOOLS.map(tool => ({ user_id: created.user!.id, tool })),
      )

      link = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email })
      if (link.error) return fail('link_failed')
    }

    // Same hand-off the invite email uses: our /auth/callback verifies the
    // token_hash and sets the session cookies.
    const tokenHash = link.data.properties.hashed_token
    return NextResponse.redirect(
      `${origin}/auth/callback?token_hash=${tokenHash}&type=magiclink&next=${encodeURIComponent('/home')}`,
    )
  } catch {
    return fail('sso_error')
  }
}
