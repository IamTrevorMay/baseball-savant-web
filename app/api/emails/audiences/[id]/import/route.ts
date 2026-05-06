import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { encrypt, blindIndex } from '@/lib/encryption'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // Process each data row
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i])
      const rawEmail = cols[emailIdx]?.trim()

      if (!rawEmail || !rawEmail.includes('@')) {
        skipped++
        continue
      }

      const normalizedEmail = rawEmail.toLowerCase()
      const rawName = nameIdx !== -1 ? cols[nameIdx]?.trim() || null : null

      try {
        const emailHash = blindIndex(normalizedEmail)
        const encryptedEmail = encrypt(normalizedEmail)
        const encryptedName = rawName ? encrypt(rawName) : null

        // Upsert subscriber
        const { data: existing } = await supabaseAdmin
          .from('email_subscribers')
          .select('id')
          .eq('email_hash', emailHash)
          .maybeSingle()

        let subscriberId: string

        if (existing) {
          subscriberId = existing.id
          // Update name if provided and subscriber exists
          if (encryptedName) {
            await supabaseAdmin
              .from('email_subscribers')
              .update({ encrypted_name: encryptedName, updated_at: new Date().toISOString() })
              .eq('id', existing.id)
          }
        } else {
          const { data: newSub, error: insertError } = await supabaseAdmin
            .from('email_subscribers')
            .insert({
              encrypted_email: encryptedEmail,
              email_hash: emailHash,
              encrypted_name: encryptedName,
              source: 'csv_import',
            })
            .select('id')
            .single()

          if (insertError || !newSub) {
            errors.push(`Row ${i + 1}: ${insertError?.message || 'insert failed'}`)
            skipped++
            continue
          }
          subscriberId = newSub.id
        }

        // Add to audience (upsert)
        const { data: existingMember } = await supabaseAdmin
          .from('email_audience_members')
          .select('subscriber_id, is_active')
          .eq('audience_id', id)
          .eq('subscriber_id', subscriberId)
          .maybeSingle()

        if (existingMember) {
          if (!existingMember.is_active) {
            await supabaseAdmin
              .from('email_audience_members')
              .update({ is_active: true, unsubscribed_at: null })
              .eq('audience_id', id)
              .eq('subscriber_id', subscriberId)
            imported++
          } else {
            skipped++ // Already active member
          }
        } else {
          await supabaseAdmin
            .from('email_audience_members')
            .insert({ audience_id: id, subscriber_id: subscriberId })
          imported++
        }
      } catch (rowErr: any) {
        errors.push(`Row ${i + 1}: ${rowErr.message}`)
        skipped++
      }
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
