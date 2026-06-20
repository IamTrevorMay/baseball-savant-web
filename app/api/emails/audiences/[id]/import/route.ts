import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { encrypt, blindIndex } from '@/lib/encryption'
import { requireSessionAdmin } from '@/lib/apiAuth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSessionAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  try {
    // Verify audience exists
    const { data: audience } = await supabaseAdmin
      .from('email_audiences')
      .select('id')
      .eq('id', id)
      .single()

    if (!audience) {
      return NextResponse.json({ error: 'Audience not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Missing file field' }, { status: 400 })
    }

    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(line => line.trim())

    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'CSV must have a header row and at least one data row' },
        { status: 400 }
      )
    }

    // Parse header row
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    const emailIdx = headers.indexOf('email')
    if (emailIdx === -1) {
      return NextResponse.json(
        { error: 'CSV must have an "email" column' },
        { status: 400 }
      )
    }
    const nameIdx = headers.indexOf('name')

    let imported = 0
    let skipped = 0
    const errors: string[] = []

    const chunk = <T,>(arr: T[], n: number): T[][] => {
      const out: T[][] = []
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
      return out
    }

    // Parse + encrypt all rows up front; dedupe by email hash (last occurrence wins).
    const byHash = new Map<string, { encEmail: string; encName: string | null }>()
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i])
      const rawEmail = cols[emailIdx]?.trim()
      if (!rawEmail || !rawEmail.includes('@')) { skipped++; continue }
      const normalizedEmail = rawEmail.toLowerCase()
      const rawName = nameIdx !== -1 ? cols[nameIdx]?.trim() || null : null
      try {
        byHash.set(blindIndex(normalizedEmail), {
          encEmail: encrypt(normalizedEmail),
          encName: rawName ? encrypt(rawName) : null,
        })
      } catch (e: any) {
        errors.push(`Row ${i + 1}: ${e.message}`)
        skipped++
      }
    }

    const allHashes = [...byHash.keys()]

    // Bulk-resolve existing subscribers by hash (instead of one SELECT per row).
    const hashToId = new Map<string, string>()
    for (const part of chunk(allHashes, 100)) {
      const { data } = await supabaseAdmin
        .from('email_subscribers')
        .select('id, email_hash')
        .in('email_hash', part)
      for (const r of data || []) hashToId.set(r.email_hash, r.id)
    }

    // Bulk-insert new subscribers.
    const newHashes = new Set(allHashes.filter(h => !hashToId.has(h)))
    for (const part of chunk([...newHashes], 100)) {
      const payload = part.map(h => {
        const v = byHash.get(h)!
        return { encrypted_email: v.encEmail, email_hash: h, encrypted_name: v.encName, source: 'csv_import' }
      })
      const { data, error } = await supabaseAdmin
        .from('email_subscribers')
        .insert(payload)
        .select('id, email_hash')
      if (error) { errors.push(`subscriber insert: ${error.message}`); continue }
      for (const r of data || []) hashToId.set(r.email_hash, r.id)
    }

    // Bulk-update names for pre-existing subscribers that arrived with a name.
    const nameUpdates = allHashes
      .filter(h => !newHashes.has(h) && hashToId.has(h) && byHash.get(h)!.encName)
      .map(h => ({ id: hashToId.get(h)!, encrypted_name: byHash.get(h)!.encName, updated_at: new Date().toISOString() }))
    for (const part of chunk(nameUpdates, 100)) {
      await supabaseAdmin.from('email_subscribers').upsert(part, { onConflict: 'id' })
    }

    const subIds = allHashes.map(h => hashToId.get(h)).filter((x): x is string => !!x)

    // Bulk-resolve existing audience members.
    const activeMap = new Map<string, boolean>()
    for (const part of chunk(subIds, 100)) {
      const { data } = await supabaseAdmin
        .from('email_audience_members')
        .select('subscriber_id, is_active')
        .eq('audience_id', id)
        .in('subscriber_id', part)
      for (const r of data || []) activeMap.set(r.subscriber_id, r.is_active)
    }

    const toInsert = subIds.filter(sid => !activeMap.has(sid))
    const toReactivate = subIds.filter(sid => activeMap.get(sid) === false)
    skipped += subIds.filter(sid => activeMap.get(sid) === true).length // already active

    for (const part of chunk(toInsert, 100)) {
      const { error } = await supabaseAdmin
        .from('email_audience_members')
        .insert(part.map(sid => ({ audience_id: id, subscriber_id: sid })))
      if (error) errors.push(`member insert: ${error.message}`)
      else imported += part.length
    }
    for (const part of chunk(toReactivate, 100)) {
      const { error } = await supabaseAdmin
        .from('email_audience_members')
        .update({ is_active: true, unsubscribed_at: null })
        .eq('audience_id', id)
        .in('subscriber_id', part)
      if (error) errors.push(`member reactivate: ${error.message}`)
      else imported += part.length
    }

    return NextResponse.json({
      imported,
      skipped,
      total: lines.length - 1,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * Simple CSV line parser that handles quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++ // Skip escaped quote
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }
  }

  result.push(current)
  return result
}
