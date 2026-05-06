import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * GET /api/emails/analytics/cohort?product_id=...
 *
 * Computes weekly subscriber cohorts and their engagement over subsequent weeks.
 * Returns an array of { week, new_subscribers, retention: number[] } where each
 * retention[i] is the fraction of that cohort who opened an email in week i
 * after joining.
 */
export async function GET(request: NextRequest) {
  try {
    const productId = request.nextUrl.searchParams.get('product_id')

    if (!productId) {
      return NextResponse.json(
        { error: 'Missing required query param: product_id' },
        { status: 400 }
      )
    }

    // Verify product exists
    const { data: product } = await supabaseAdmin
      .from('email_products')
      .select('id')
      .eq('id', productId)
      .single()

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // 1. Fetch all audiences for this product
    const { data: audiences } = await supabaseAdmin
      .from('email_audiences')
      .select('id')
      .eq('product_id', productId)

    if (!audiences || audiences.length === 0) {
      return NextResponse.json({ cohorts: [] })
    }

    const audienceIds = audiences.map(a => a.id)

    // 2. Fetch all audience members with subscription date
    const { data: members, error: membersError } = await supabaseAdmin
      .from('email_audience_members')
      .select('subscriber_id, subscribed_at')
      .in('audience_id', audienceIds)
      .eq('is_active', true)

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 })
    }

    if (!members || members.length === 0) {
      return NextResponse.json({ cohorts: [] })
    }

    // 3. Fetch all sends for this product
    const { data: sends, error: sendsError } = await supabaseAdmin
      .from('email_sends')
      .select('id, sent_at')
      .eq('product_id', productId)
      .eq('status', 'sent')
      .order('sent_at', { ascending: true })

    if (sendsError) {
      return NextResponse.json({ error: sendsError.message }, { status: 500 })
    }

    if (!sends || sends.length === 0) {
      // No sends yet — return cohorts without retention data
      const cohortMap = buildCohortMap(members)
      const cohorts = Array.from(cohortMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, subs]) => ({
          week,
          new_subscribers: subs.length,
          retention: [] as number[],
        }))

      return NextResponse.json({ cohorts })
    }

    const sendIds = sends.map(s => s.id)

    // 4. Fetch open events for these sends
    const { data: openEvents, error: eventsError } = await supabaseAdmin
      .from('email_events')
      .select('subscriber_id, send_id, created_at')
      .in('send_id', sendIds)
      .eq('event_type', 'open')

    if (eventsError) {
      return NextResponse.json({ error: eventsError.message }, { status: 500 })
    }

    // 5. Build cohort map: week string -> subscriber IDs
    const cohortMap = buildCohortMap(members)

    // 6. Build open-by-week set for each subscriber
    // subscriber_id -> Set<week_string>
    const subscriberOpenWeeks = new Map<string, Set<string>>()

    for (const event of openEvents || []) {
      if (!event.subscriber_id || !event.created_at) continue
      const week = toISOWeek(new Date(event.created_at))
      let weeks = subscriberOpenWeeks.get(event.subscriber_id)
      if (!weeks) {
        weeks = new Set()
        subscriberOpenWeeks.set(event.subscriber_id, weeks)
      }
      weeks.add(week)
    }

    // 7. For each cohort, compute weekly retention
    const allWeeks = getAllWeeksBetween(
      cohortMap.keys().next().value!,
      toISOWeek(new Date())
    )

    const cohorts = Array.from(cohortMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cohortWeek, subscriberIds]) => {
        const cohortWeekIdx = allWeeks.indexOf(cohortWeek)
        const weeksAfter = allWeeks.slice(cohortWeekIdx)

        // retention[i] = fraction of this cohort who opened in week cohortWeekIdx + i
        const retention = weeksAfter.map(week => {
          let engaged = 0
          for (const subId of subscriberIds) {
            const opens = subscriberOpenWeeks.get(subId)
            if (opens?.has(week)) engaged++
          }
          return subscriberIds.length > 0 ? engaged / subscriberIds.length : 0
        })

        // Limit retention to 12 weeks max
        return {
          week: cohortWeek,
          new_subscribers: subscriberIds.length,
          retention: retention.slice(0, 12),
        }
      })

    return NextResponse.json({ cohorts })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/* ─── Helpers ──────────────────────────────────────────────────────── */

/**
 * Groups members into ISO week cohorts.
 */
function buildCohortMap(
  members: { subscriber_id: string; subscribed_at: string }[]
): Map<string, string[]> {
  const map = new Map<string, string[]>()

  for (const m of members) {
    const week = toISOWeek(new Date(m.subscribed_at))
    const list = map.get(week) ?? []
    // Avoid duplicate subscriber IDs in the same cohort
    if (!list.includes(m.subscriber_id)) {
      list.push(m.subscriber_id)
    }
    map.set(week, list)
  }

  return map
}

/**
 * Returns ISO week string like "2026-W19".
 */
function toISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

/**
 * Returns all ISO weeks between start and end (inclusive).
 */
function getAllWeeksBetween(start: string, end: string): string[] {
  const weeks: string[] = []
  const current = isoWeekToDate(start)
  const endDate = isoWeekToDate(end)

  while (current <= endDate) {
    weeks.push(toISOWeek(current))
    current.setDate(current.getDate() + 7)
  }

  return weeks
}

/**
 * Converts an ISO week string like "2026-W19" to a Date (Monday of that week).
 */
function isoWeekToDate(isoWeek: string): Date {
  const [yearStr, weekStr] = isoWeek.split('-W')
  const year = parseInt(yearStr)
  const week = parseInt(weekStr)

  // Jan 4 is always in week 1
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dayOfWeek = jan4.getUTCDay() || 7
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7)

  return monday
}
