import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Check if a user has system-level admin privileges by looking up
 * their role in the profiles table. Returns true for 'owner' or 'admin'.
 */
export async function isSystemAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  return data?.role === 'owner' || data?.role === 'admin'
}
