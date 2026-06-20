import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ymdInTimeZone, addDaysToYmd } from '@/lib/dateTz'

export const maxDuration = 30

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization',
}

export async function OPTIONS() {
  return NextResponse.json(null, { headers: corsHeaders })
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
  }

  // Delete briefs and daily_cards older than 5 days (ET calendar)
  const cutoff = addDaysToYmd(ymdInTimeZone(), -5)

  const [briefsResult, cardsResult] = await Promise.all([
    supabaseAdmin.from('briefs').delete().lt('date', cutoff).select('id'),
    supabaseAdmin.from('daily_cards').delete().lt('date', cutoff).select('id'),
  ])

  return NextResponse.json({
    ok: true,
    cutoff,
    briefsDeleted: briefsResult.data?.length ?? 0,
    cardsDeleted: cardsResult.data?.length ?? 0,
  }, { headers: corsHeaders })
}
