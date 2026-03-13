import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const latest = req.nextUrl.searchParams.get('latest')
  const date = req.nextUrl.searchParams.get('date')

  // Latest brief (summary only, for home page)
  if (latest === 'true') {
    const { data, error } = await supabase
      .from('briefs')
      .select('id, date, title, summary, metadata')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ brief: data })
  }

  // Full brief by date
  if (date) {
    const { data, error } = await supabase
      .from('briefs')
      .select('*')
      .eq('date', date)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Brief not found' }, { status: 404 })
    return NextResponse.json({ brief: data })
  }

  // Archive list (last 30)
  const { data, error } = await supabase
    .from('briefs')
    .select('id, date, title, summary, metadata')
    .order('date', { ascending: false })
    .limit(30)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ briefs: data || [] })
}
