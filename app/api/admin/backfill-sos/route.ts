import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeSOSForYears } from '@/app/api/update/route'

// Use a long-timeout client for heavy SOS computation
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(300000) })
    }
  }
)

/**
 * GET /api/admin/backfill-sos?year=YYYY
 * GET /api/admin/backfill-sos?year=all  (2015-2025)
 *
 * Computes SOS for all hitters and pitchers in the given year(s)
 * and upserts into sos_scores table.
 */
export async function GET(req: NextRequest) {
  try {
    const yearParam = req.nextUrl.searchParams.get('year')
    if (!yearParam) {
      return NextResponse.json({ error: 'year parameter required (e.g. ?year=2024 or ?year=all)' }, { status: 400 })
    }

    let years: number[]
    if (yearParam === 'all') {
      years = []
      for (let y = 2015; y <= new Date().getFullYear(); y++) years.push(y)
    } else {
      const y = parseInt(yearParam, 10)
      if (isNaN(y)) return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
      years = [y]
    }

    const results: Record<number, any> = {}

    for (const year of years) {
      const startDate = `${year}-01-01`
      const endDate = `${year}-12-31`
      const result = await computeSOSForYears(supabase as any, startDate, endDate)
      results[year] = result
    }

    return NextResponse.json({ results })
  } catch (err: any) {
    console.error('backfill-sos error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
