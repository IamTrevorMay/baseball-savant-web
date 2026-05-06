/**
 * Seed script: Creates the Mayday Daily email product, template, and audience.
 * Also migrates newsletter_subscribers to email_subscribers.
 *
 * Run via: npx tsx scripts/seed-mayday-daily.ts
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *                    ENCRYPTION_KEY, BLIND_INDEX_KEY
 */

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// ─── Env setup ────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ENC_KEY = process.env.ENCRYPTION_KEY
const BLIND_KEY = process.env.BLIND_INDEX_KEY

if (!SUPABASE_URL || !SERVICE_KEY || !ENC_KEY || !BLIND_KEY) {
  console.error('Missing required env vars. Need:')
  console.error('  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_KEY, BLIND_INDEX_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ─── Encryption helpers (inline to avoid import issues with tsx) ──────

function encrypt(plaintext: string): string {
  const key = Buffer.from(ENC_KEY!.slice(0, 32), 'utf-8')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

function blindIndex(value: string): string {
  return crypto.createHmac('sha256', BLIND_KEY!).update(value).digest('hex')
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('Starting Mayday Daily seed...\n')

  // 1. Create email product
  console.log('1. Creating Mayday Daily product...')
  const { data: product, error: prodErr } = await supabase
    .from('email_products')
    .upsert({
      name: 'Mayday Daily',
      slug: 'mayday-daily',
      product_type: 'recurring',
      branding: {
        primaryColor: '#34d399',
        logoUrl: 'https://www.tritonapex.io/mayday-daily-banner.png',
        headerStyle: 'banner',
        fromName: 'Mayday Daily',
        fromEmail: 'noreply@tritonapex.io',
        replyTo: null,
      },
      schedule: {
        cron: '0 15 * * *',
        timezone: 'America/New_York',
        skipMonths: [12, 1],
      },
      landing_enabled: true,
      landing_config: {
        heroText: 'Mayday Daily',
        description: 'Daily baseball analytics newsletter powered by Triton Apex. Scores, standouts, trends, and more — delivered every morning.',
        socialLinks: [
          { platform: 'Twitter', url: 'https://twitter.com/maaborern' },
          { platform: 'Substack', url: 'https://www.mayday.show' },
        ],
      },
      is_active: true,
    }, { onConflict: 'slug' })
    .select('id')
    .single()

  if (prodErr) {
    console.error('  Error creating product:', prodErr.message)
    process.exit(1)
  }
  const productId = product!.id
  console.log(`  Product created: ${productId}`)

  // 2. Create template with blocks matching the current newsletter layout
  console.log('2. Creating Mayday Daily template...')

  const maydayBlocks = [
    {
      id: crypto.randomUUID(),
      type: 'header',
      config: {
        style: 'banner',
        bannerUrl: 'https://www.tritonapex.io/mayday-daily-banner.png',
        title: 'Mayday Daily',
        subtitle: '',
        showDate: true,
      },
      visible: true,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    {
      id: crypto.randomUUID(),
      type: 'divider',
      config: { color: '#27272a', thickness: 1, style: 'solid' },
      visible: true,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    {
      id: crypto.randomUUID(),
      type: 'spacer',
      config: { height: 24 },
      visible: true,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    {
      id: crypto.randomUUID(),
      type: 'scores',
      config: { columns: 4, showRHE: true, showDecisions: true },
      binding: { source: 'briefs', path: 'metadata.scores' },
      visible: true,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    {
      id: crypto.randomUUID(),
      type: 'standouts',
      config: { columns: 2, maxCards: 4 },
      binding: { source: 'briefs', path: 'metadata.daily_highlights' },
      visible: true,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    {
      id: crypto.randomUUID(),
      type: 'trend-alerts',
      config: { maxItems: 5, showSigma: true },
      binding: { source: 'briefs', path: 'metadata.trend_alerts' },
      visible: true,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    {
      id: crypto.randomUUID(),
      type: 'starter-card',
      config: { cardType: 'ig-starter-card' },
      binding: { source: 'daily_cards' },
      visible: true,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    {
      id: crypto.randomUUID(),
      type: 'columns',
      config: { columnCount: 2, gap: 16 },
      visible: true,
      padding: { top: 0, right: 0, bottom: 24, left: 0 },
      children: [
        {
          id: crypto.randomUUID(),
          type: 'section',
          config: { title: 'Top Performances', showTitle: true },
          visible: true,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          children: [
            {
              id: crypto.randomUUID(),
              type: 'rich-text',
              config: { html: '' },
              binding: { source: 'claude', claudeField: 'topPerformances' },
              visible: true,
              padding: { top: 0, right: 0, bottom: 0, left: 0 },
            },
          ],
        },
        {
          id: crypto.randomUUID(),
          type: 'section',
          config: { title: 'Rough Outings', showTitle: true },
          visible: true,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          children: [
            {
              id: crypto.randomUUID(),
              type: 'rich-text',
              config: { html: '' },
              binding: { source: 'claude', claudeField: 'worstPerformances' },
              visible: true,
              padding: { top: 0, right: 0, bottom: 0, left: 0 },
            },
          ],
        },
      ],
    },
    {
      id: crypto.randomUUID(),
      type: 'columns',
      config: { columnCount: 2, gap: 16 },
      visible: true,
      padding: { top: 0, right: 0, bottom: 24, left: 0 },
      children: [
        {
          id: crypto.randomUUID(),
          type: 'section',
          config: { title: 'Injuries', showTitle: true },
          visible: true,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          children: [
            {
              id: crypto.randomUUID(),
              type: 'rich-text',
              config: { html: '' },
              binding: { source: 'claude', claudeField: 'injuries' },
              visible: true,
              padding: { top: 0, right: 0, bottom: 0, left: 0 },
            },
          ],
        },
        {
          id: crypto.randomUUID(),
          type: 'section',
          config: { title: 'Transactions', showTitle: true },
          visible: true,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          children: [
            {
              id: crypto.randomUUID(),
              type: 'rich-text',
              config: { html: '' },
              binding: { source: 'claude', claudeField: 'transactions' },
              visible: true,
              padding: { top: 0, right: 0, bottom: 0, left: 0 },
            },
          ],
        },
      ],
    },
    {
      id: crypto.randomUUID(),
      type: 'rss-card',
      config: { showImage: true, showAuthor: true, showDescription: true, ctaText: 'Read on Substack →' },
      binding: { source: 'rss', rssUrl: 'https://www.mayday.show/feed' },
      visible: true,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    {
      id: crypto.randomUUID(),
      type: 'footer',
      config: {
        text: '',
        showUnsubscribe: true,
        showBranding: true,
      },
      visible: true,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  ]

  // Check if template already exists for this product
  const { data: existing } = await supabase
    .from('email_templates')
    .select('id')
    .eq('product_id', productId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (existing) {
    // Update existing
    await supabase
      .from('email_templates')
      .update({
        blocks: maydayBlocks,
        subject_template: '{{title}} — {{date_short}}',
        preheader_template: "Yesterday's scores, standouts, and trends",
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    console.log(`  Template updated: ${existing.id}`)
  } else {
    const { data: tmpl, error: tmplErr } = await supabase
      .from('email_templates')
      .insert({
        product_id: productId,
        name: 'Mayday Daily',
        version: 1,
        is_active: true,
        blocks: maydayBlocks,
        settings: { maxWidth: 640, bodyBg: '#09090b', contentBg: '#09090b', fontFamily: 'sans-serif' },
        subject_template: '{{title}} — {{date_short}}',
        preheader_template: "Yesterday's scores, standouts, and trends",
      })
      .select('id')
      .single()

    if (tmplErr) {
      console.error('  Error creating template:', tmplErr.message)
      process.exit(1)
    }
    console.log(`  Template created: ${tmpl!.id}`)
  }

  // 3. Create default audience
  console.log('3. Creating default audience...')
  const { data: audience, error: audErr } = await supabase
    .from('email_audiences')
    .upsert({
      name: 'Mayday Daily Subscribers',
      product_id: productId,
      source: 'default',
    }, { onConflict: 'product_id' })
    .select('id')
    .single()

  // If upsert fails due to no unique constraint, try insert
  let audienceId: string
  if (audErr) {
    // Check if one exists
    const { data: existingAud } = await supabase
      .from('email_audiences')
      .select('id')
      .eq('product_id', productId)
      .eq('source', 'default')
      .limit(1)
      .maybeSingle()

    if (existingAud) {
      audienceId = existingAud.id
      console.log(`  Audience already exists: ${audienceId}`)
    } else {
      const { data: newAud, error: newAudErr } = await supabase
        .from('email_audiences')
        .insert({
          name: 'Mayday Daily Subscribers',
          product_id: productId,
          source: 'default',
        })
        .select('id')
        .single()
      if (newAudErr) {
        console.error('  Error creating audience:', newAudErr.message)
        process.exit(1)
      }
      audienceId = newAud!.id
      console.log(`  Audience created: ${audienceId}`)
    }
  } else {
    audienceId = audience!.id
    console.log(`  Audience created: ${audienceId}`)
  }

  // 4. Migrate subscribers from newsletter_subscribers
  console.log('4. Migrating newsletter subscribers...')
  const { data: oldSubs, error: subErr } = await supabase
    .from('newsletter_subscribers')
    .select('id, email, encrypted_email, email_hash, name, is_active, source, unsubscribe_token, created_at')
    .eq('is_active', true)

  if (subErr) {
    console.error('  Error fetching newsletter subscribers:', subErr.message)
    process.exit(1)
  }

  let migrated = 0
  let skipped = 0

  for (const old of oldSubs || []) {
    const email = old.encrypted_email
      ? decryptEmail(old.encrypted_email)
      : old.email

    if (!email) {
      skipped++
      continue
    }

    const emailLower = email.toLowerCase()
    const hash = old.email_hash || blindIndex(emailLower)
    const enc = old.encrypted_email || encrypt(emailLower)
    const encName = old.name ? encrypt(old.name) : null

    // Upsert into email_subscribers
    const { data: sub, error: subInsErr } = await supabase
      .from('email_subscribers')
      .upsert({
        encrypted_email: enc,
        email_hash: hash,
        encrypted_name: encName,
        source: old.source || 'migration',
        unsubscribe_token: old.unsubscribe_token || crypto.randomBytes(32).toString('hex'),
        metadata: { migrated_from: 'newsletter_subscribers', original_id: old.id },
      }, { onConflict: 'email_hash' })
      .select('id')
      .single()

    if (subInsErr || !sub) {
      console.error(`  Error migrating ${emailLower}:`, subInsErr?.message)
      skipped++
      continue
    }

    // Add to audience
    await supabase
      .from('email_audience_members')
      .upsert({
        audience_id: audienceId,
        subscriber_id: sub.id,
        is_active: true,
      }, { onConflict: 'audience_id,subscriber_id' })

    migrated++
  }

  // Update audience subscriber count
  await supabase
    .from('email_audiences')
    .update({ subscriber_count: migrated })
    .eq('id', audienceId)

  console.log(`  Migrated: ${migrated}, Skipped: ${skipped}`)

  // 5. Seed default template library entries
  console.log('5. Seeding default block templates...')

  const simpleBlastBlocks = [
    {
      id: crypto.randomUUID(),
      type: 'header',
      config: { style: 'text', title: 'Your Newsletter', subtitle: '', showDate: false },
      visible: true,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    {
      id: crypto.randomUUID(),
      type: 'divider',
      config: { color: '#27272a', thickness: 1, style: 'solid' },
      visible: true,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    {
      id: crypto.randomUUID(),
      type: 'rich-text',
      config: { html: '<p style="color:#d4d4d8;font-size:15px;line-height:1.6;margin:0;">Write your message here...</p>' },
      visible: true,
      padding: { top: 24, right: 0, bottom: 24, left: 0 },
    },
    {
      id: crypto.randomUUID(),
      type: 'button',
      config: { text: 'Learn More', url: '', bgColor: '#34d399', textColor: '#09090b', align: 'center', borderRadius: 6, fullWidth: false },
      visible: true,
      padding: { top: 0, right: 0, bottom: 24, left: 0 },
    },
    {
      id: crypto.randomUUID(),
      type: 'footer',
      config: { text: '', showUnsubscribe: true, showBranding: true },
      visible: true,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  ]

  const weeklyReportBlocks = [
    {
      id: crypto.randomUUID(),
      type: 'header',
      config: { style: 'text', title: 'Weekly Report', subtitle: 'Your weekly stats roundup', showDate: true },
      visible: true,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    {
      id: crypto.randomUUID(),
      type: 'divider',
      config: { color: '#27272a', thickness: 1, style: 'solid' },
      visible: true,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    {
      id: crypto.randomUUID(),
      type: 'rich-text',
      config: { html: '<p style="color:#d4d4d8;font-size:15px;line-height:1.6;margin:0;">Here\'s your weekly stats roundup...</p>' },
      visible: true,
      padding: { top: 24, right: 0, bottom: 24, left: 0 },
    },
    {
      id: crypto.randomUUID(),
      type: 'leaderboard',
      config: { metric: 'stuff_plus', limit: 5, role: 'SP', showRank: true },
      binding: { source: 'stats_query' },
      visible: true,
      padding: { top: 0, right: 0, bottom: 24, left: 0 },
    },
    {
      id: crypto.randomUUID(),
      type: 'stats-table',
      config: { columns: [], maxRows: 10, showHeaders: true, striped: true },
      binding: { source: 'stats_query', query: '' },
      visible: true,
      padding: { top: 0, right: 0, bottom: 24, left: 0 },
    },
    {
      id: crypto.randomUUID(),
      type: 'player-card',
      config: { playerId: null, stats: ['stuff_plus', 'cmd_plus', 'brink_plus'], showHeadshot: true },
      visible: true,
      padding: { top: 0, right: 0, bottom: 24, left: 0 },
    },
    {
      id: crypto.randomUUID(),
      type: 'footer',
      config: { text: '', showUnsubscribe: true, showBranding: true },
      visible: true,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  ]

  // Insert as library entries
  await supabase.from('email_blocks_library').upsert([
    {
      name: 'Simple Blast',
      category: 'template',
      block_config: { blocks: simpleBlastBlocks, settings: { maxWidth: 640, bodyBg: '#09090b', contentBg: '#09090b', fontFamily: 'sans-serif' } },
    },
    {
      name: 'Weekly Report',
      category: 'template',
      block_config: { blocks: weeklyReportBlocks, settings: { maxWidth: 640, bodyBg: '#09090b', contentBg: '#09090b', fontFamily: 'sans-serif' } },
    },
  ], { onConflict: 'name' } as any)

  console.log('  Simple Blast and Weekly Report templates seeded.')

  console.log('\nDone! Mayday Daily is ready.')
}

function decryptEmail(encoded: string): string | null {
  try {
    const key = Buffer.from(ENC_KEY!.slice(0, 32), 'utf-8')
    const [ivB64, tagB64, dataB64] = encoded.split(':')
    const iv = Buffer.from(ivB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')
    const data = Buffer.from(dataB64, 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
