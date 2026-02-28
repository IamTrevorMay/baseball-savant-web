import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Admin client — bypasses RLS. Server-side only.
// Lazy-initialized to avoid build-time errors when env vars aren't available.
let _admin: SupabaseClient | null = null

function getAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _admin
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getAdmin()
    const val = (client as any)[prop]
    return typeof val === 'function' ? val.bind(client) : val
  },
})
