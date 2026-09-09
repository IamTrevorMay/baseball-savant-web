# Mayday Studio → Triton SSO ("Continue with Mayday Studio")

One-hop hand-off so a signed-in Mayday Studio user lands in Triton without a
Triton password. The two apps stay on separate Supabase projects; passwords
live only on Mayday. Triton's half is built (`app/api/auth/mayday/route.ts` +
the login-page button); this file is the contract the **Mayday-side endpoint**
must implement.

## Flow

```
Triton /login ── "Continue with Mayday Studio" ──▶ MAYDAY: GET /api/triton-sso
                                                        │ verify own Supabase session
                                                        │ sign assertion (HMAC, shared secret)
                                                        ▼
TRITON: GET /api/auth/mayday?token=…  ◀── 302 redirect ─┘
   │ verify signature + 60s freshness
   │ find-or-create the Triton account (default role 'user' + 'research' grant)
   │ mint magiclink via admin API
   ▼
TRITON: /auth/callback?token_hash=…&type=magiclink  → session cookies → /home
```

If anything fails, the browser is bounced to `/login?error=mayday_sso&reason=…`.

## What Mayday implements

A route (suggested: `GET /api/triton-sso`) that:

1. **Requires a signed-in Mayday session.** No session → redirect to Mayday's
   own login, then back here.
2. **Builds the assertion payload** for the session's user:
   ```json
   { "email": "user@example.com", "name": "First Last", "iat": 1757400000 }
   ```
   - `email` — required; Triton lowercases and trims it, and it becomes the
     Triton account's identity. Use the verified auth email, never
     user-supplied input.
   - `name` — optional; used only when auto-provisioning a new account.
   - `iat` — required; unix **seconds** at signing time. Triton rejects
     assertions older than **60s** (and more than 30s from the future), so
     sign at redirect time, never cache.
3. **Signs it** with the shared secret:
   ```
   payload = base64url( JSON.stringify(assertion) )   // no padding
   sig     = base64url( HMAC_SHA256(payload, TRITON_SSO_SECRET) )
   token   = payload + "." + sig
   ```
   Node reference:
   ```ts
   import { createHmac } from 'crypto'
   const payload = Buffer.from(JSON.stringify({ email, name, iat: Math.floor(Date.now() / 1000) }))
     .toString('base64url')
   const sig = createHmac('sha256', process.env.TRITON_SSO_SECRET!).update(payload).digest('base64url')
   const token = `${payload}.${sig}`
   ```
4. **Redirects the browser** (302) to:
   ```
   https://<triton-host>/api/auth/mayday?token=<token>
   ```

## Environment variables

| Where | Var | Value |
|---|---|---|
| Triton | `MAYDAY_SSO_SECRET` | shared secret (32+ random bytes, e.g. `openssl rand -base64 32`) |
| Triton | `NEXT_PUBLIC_MAYDAY_SSO_URL` | Mayday's start URL, e.g. `https://<mayday-host>/api/triton-sso`. The login button only renders when this is set. |
| Mayday | `TRITON_SSO_SECRET` | **same value** as Triton's `MAYDAY_SSO_SECRET` |
| Mayday | (its redirect target) | `https://<triton-host>/api/auth/mayday` |

## Provisioning semantics on the Triton side

- Existing Triton account with that email → signed straight in; role and
  grants untouched.
- No account → created with `email_confirm: true`, the DB trigger's default
  **role `user`**, and a **`research` tool grant** (the same baseline as a
  manual Research invite). Admins adjust from the admin panel afterwards.

## Security notes

- HMAC is compared in constant time; malformed base64url, bad email shape,
  and stale `iat` all reject before any DB work.
- The assertion is bearer-ish for its 60-second life: anyone holding the URL
  within that window can redeem it once. It travels only inside a 302
  Location header over HTTPS; if that window ever matters, add a `jti` +
  replay table on the Triton side.
- The magiclink `token_hash` is single-use and consumed by `/auth/callback`
  immediately.
- Rotating the shared secret only breaks the hand-off button, never existing
  sessions or passwords.
