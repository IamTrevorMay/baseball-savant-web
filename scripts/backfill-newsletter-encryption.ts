/**
 * Backfill newsletter_subscribers with encrypted_email and email_hash.
 *
 * Prerequisites:
 *   1. Run scripts/migrate-newsletter-encryption.sql first
 *   2. Set ENCRYPTION_KEY and BLIND_INDEX_KEY env vars
 *
 * Usage:
 *   npx tsx scripts/backfill-newsletter-encryption.ts
 *
 * Idempotent — skips rows that already have email_hash populated.
 * After verifying all rows are backfilled, run the follow-up migration
 * to drop the plaintext email column.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { encrypt, blindIndex } from '../lib/encryption'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
  // Fetch all subscribers that still need backfilling
  const { data: rows, error } = await supabase
    .from('newsletter_subscribers')
    .select('id, email')
    .is('email_hash', null)

  if (error) {
    console.error('Failed to fetch subscribers:', error.message)
    process.exit(1)
  }

  if (!rows || rows.length === 0) {
    console.log('All subscribers already backfilled. Nothing to do.')
    return
  }

  console.log(`Backfilling ${rows.length} subscriber(s)...`)

  let updated = 0
  let errors = 0

  for (const row of rows) {
    if (!row.email) {
      console.warn(`  Skipping id=${row.id} — no email`)
      continue
    }

    const emailLower = row.email.trim().toLowerCase()
    const encryptedEmail = encrypt(emailLower)
    const emailHash = blindIndex(emailLower)

    const { error: updateError } = await supabase
      .from('newsletter_subscribers')
      .update({
        encrypted_email: encryptedEmail,
        email_hash: emailHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    if (updateError) {
      console.error(`  Failed id=${row.id}: ${updateError.message}`)
      errors++
    } else {
      updated++
    }
  }

  console.log(`Done. Updated: ${updated}, Errors: ${errors}`)

  if (errors === 0) {
    console.log('\nAll rows backfilled successfully.')
    console.log('Next step: verify in DB, then run the follow-up migration to drop the email column:')
    console.log('  ALTER TABLE newsletter_subscribers DROP COLUMN IF EXISTS email;')
  }
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
