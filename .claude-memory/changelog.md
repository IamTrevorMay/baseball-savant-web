# Changelog

## 2026-03-25

### Game Log Detail Expansion
- **What**: Added expandable detail panel to Game Log tab — click any game row to see rich per-game stats inline
- **Why**: Users wanted deeper game-level analysis without leaving the tab
- **Files**: `components/dashboard/GameDetail.tsx` (new), `components/dashboard/GameLogTab.tsx`, `components/chartConfig.ts`, `components/dashboard/LocationTab.tsx`
- **Details**: 6 sections — summary pills, pitch arsenal table, 3 Plotly charts (zone scatter, movement, velo by pitch #), inning-by-inning, at-bat results, batted ball summary. Moved `ZONE_SHAPES` to `chartConfig.ts` to deduplicate.

### Fix Invite & Reset Password Flows
- **What**: Invite emails and password reset emails were sending users to sign-in instead of set-password page
- **Why**: Two bugs — (1) reset-password `redirectTo` was missing `?next=/set-password`, (2) invite used raw `token_hash` with `verifyOtp` which had session cookie issues on redirect
- **Files**: `app/api/admin/invite/route.ts`, `app/api/admin/reset-password/route.ts`
- **Fix**: Reset password now includes `?next=/set-password` in redirectTo. Invite now uses Supabase `action_link` (server-side verification + PKCE code exchange) instead of manual token_hash. Also needed to add redirect URL to Supabase dashboard allowlist.

### Fix Build Errors (pre-existing)
- **What**: Vercel deployment was failing due to two pre-existing type/dependency issues
- **Files**: `app/api/batch-render/route.ts`, `package.json`
- **Fix**: Wrapped `Buffer` with `new Uint8Array()` for Next.js 16 `BodyInit` compatibility. Installed missing `recharts` dependency used by `ExploreCharts.tsx`.
