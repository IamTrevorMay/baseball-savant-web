import { createClient } from '@supabase/supabase-js'

function createAdminClient(timeoutMs = 30000) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) })
      }
    }
  )
}

/** Default admin client — 30s timeout for standard queries */
export const supabaseAdmin = createAdminClient(30000)

/** Long-running admin client — 120s timeout for heavy data routes (player-data, report) */
export const supabaseAdminLong = createAdminClient(120000)
