# Changelog

## 2026-03-25

### Game Log Detail Expansion
- **What**: Added expandable detail panel to Game Log tab — click any game row to see rich per-game stats inline
- **Why**: Users wanted deeper game-level analysis without leaving the tab
- **Files**: `components/dashboard/GameDetail.tsx` (new), `components/dashboard/GameLogTab.tsx`, `components/chartConfig.ts`, `components/dashboard/LocationTab.tsx`
- **Details**: 6 sections — summary pills, pitch arsenal table, 3 Plotly charts (zone scatter, movement, velo by pitch #), inning-by-inning, at-bat results, batted ball summary. Moved `ZONE_SHAPES` to `chartConfig.ts` to deduplicate.

### Fix Auth Flows — Cookie Propagation + Token Hash (ed14801)
- **What**: Invite and reset-password emails sent users to sign-in instead of set-password page
- **Root cause**: Two issues — (1) auth callback Route Handler set session cookies via `cookies()` but returned `NextResponse.redirect()` which didn't carry them, so middleware on `/set-password` found no session and bounced to `/login`; (2) `action_link` (attempted fix) went through Supabase's verify endpoint which redirects with fragment tokens (`#access_token=...`) invisible to server-side handlers
- **Files**: `app/(auth)/auth/callback/route.ts`, `app/api/admin/invite/route.ts`, `app/api/admin/reset-password/route.ts`
- **Fix**: (1) Rewrote callback to create Supabase client with `setAll` writing directly to the `NextResponse.redirect()` object; (2) Reverted invite to `token_hash` query param approach; (3) Switched reset-password from `resetPasswordForEmail` (Supabase email with fragment tokens) to `generateLink({ type: 'recovery' })` + Resend email with `token_hash`
- **Also needed**: Added `https://www.tritonapex.io/auth/callback?next=/set-password` to Supabase dashboard Redirect URLs allowlist

### Fix Build Errors (pre-existing)
- **What**: Vercel deployment was failing due to two pre-existing type/dependency issues
- **Files**: `app/api/batch-render/route.ts`, `package.json`
- **Fix**: Wrapped `Buffer` with `new Uint8Array()` for Next.js 16 `BodyInit` compatibility. Installed missing `recharts` dependency used by `ExploreCharts.tsx`.
