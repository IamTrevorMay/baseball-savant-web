import { createClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder'

// Browser: use SSR-aware client that shares the cookie-based auth session.
// Server: plain client (API routes that need elevated access should use supabaseAdmin).
export const supabase = typeof window !== 'undefined'
  ? createBrowserClient(url, key)
  : createClient(url, key)
