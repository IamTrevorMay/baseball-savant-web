import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Admin client — bypasses RLS. Server-side only.
// Lazy-initialized to avoid build-time errors when env vars aren't available.
let _admin: SupabaseClient | null = null

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_admin) {
      _admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
    }
    return (_admin as any)[prop]
  },
})
