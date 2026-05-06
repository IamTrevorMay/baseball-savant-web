/**
 * Data binding resolution for email blocks.
 *
 * At send time, walks all blocks, fetches data for bound blocks,
 * and returns a map of blockId → resolved data.
 */

import type { EmailBlock, DataBinding } from '@/lib/emailTypes'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { highlightsToStandouts, fetchLatestSubstackPost } from '@/lib/newsletterHtml'
import Parser from 'rss-parser'

type BlockData = Record<string, unknown>

/**
 * Resolve a JSON path like "metadata.scores" against an object.
 */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

/**
 * Fetch the latest brief for a given date.
 */
async function fetchBrief(date: string): Promise<Record<string, unknown> | null> {
  const { data } = await supabaseAdmin
    .from('briefs')
    .select('*')
    .eq('date', date)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data as Record<string, unknown> | null
}

/**
 * Resolve a single data binding, returning the data to pass to the block renderer.
 */
async function resolveBinding(
  binding: DataBinding,
  context: { date: string; briefCache: Record<string, unknown> | null }
): Promise<BlockData> {
  switch (binding.source) {
    case 'briefs': {
      if (!context.briefCache) return {}
      if (binding.path) {
        const value = getByPath(context.briefCache, binding.path)
        // Special handling for known paths
        if (binding.path === 'metadata.daily_highlights') {
          return { standouts: highlightsToStandouts(value) }
        }
        if (binding.path === 'metadata.scores') {
          return { scores: value || [] }
        }
        if (binding.path === 'metadata.trend_alerts') {
          const alerts = value as Record<string, unknown> | undefined
          return {
            surges: (alerts as any)?.surges || [],
            concerns: (alerts as any)?.concerns || [],
          }
        }
        return { data: value }
      }
      return context.briefCache
    }

    case 'daily_cards': {
      const { data } = await supabaseAdmin
        .from('daily_cards')
        .select('*')
        .eq('date', context.date)
        .limit(1)
        .single()
      return { date: context.date, ...(data || {}) }
    }

    case 'stats_query': {
      if (!binding.query) return { rows: [], columns: [] }
      try {
        const { data } = await supabaseAdmin.rpc('run_query', { query_text: binding.query })
        const rows = Array.isArray(data) ? data : []
        const columns = rows.length > 0 ? Object.keys(rows[0]) : []
        return { rows, columns }
      } catch {
        return { rows: [], columns: [], error: 'Query failed' }
      }
    }

    case 'rss': {
      if (!binding.rssUrl) {
        // Default to Substack feed
        const post = await fetchLatestSubstackPost()
        return post || {}
      }
      try {
        const parser = new Parser({ timeout: 10000 })
        const feed = await parser.parseURL(binding.rssUrl)
        const item = feed.items?.[0]
        if (!item) return {}

        let imageUrl = (item.enclosure as any)?.url || null
        if (!imageUrl && item['content:encoded']) {
          const match = (item['content:encoded'] as string).match(/<img[^>]+src="([^"]+)"/)
          if (match) imageUrl = match[1]
        }

        return {
          title: item.title || '',
          link: item.link || '',
          description: (item.contentSnippet || '').slice(0, 200),
          author: item.creator || (item as any)['dc:creator'] || undefined,
          imageUrl,
        }
      } catch {
        return {}
      }
    }

    case 'claude': {
      // Claude-generated sections come from brief metadata
      if (!context.briefCache || !binding.claudeField) return {}
      const meta = context.briefCache.metadata as Record<string, unknown> | undefined
      if (!meta) return {}
      const html = meta[binding.claudeField] as string | undefined
      return { html: html || '' }
    }

    case 'static':
    default:
      return {}
  }
}

/**
 * Resolve all bindings for an array of blocks.
 * Returns a map of blockId → resolved data.
 */
export async function resolveAllBindings(
  blocks: EmailBlock[],
  date: string
): Promise<Record<string, BlockData>> {
  // Pre-fetch brief once (most bindings need it)
  const briefCache = await fetchBrief(date)

  const result: Record<string, BlockData> = {}
  const context = { date, briefCache }

  // Collect all blocks including nested children
  function collectBlocks(blks: EmailBlock[]): EmailBlock[] {
    const all: EmailBlock[] = []
    for (const b of blks) {
      all.push(b)
      if (b.children) {
        all.push(...collectBlocks(b.children))
      }
    }
    return all
  }

  const allBlocks = collectBlocks(blocks)
  const boundBlocks = allBlocks.filter(b => b.binding)

  // Resolve in parallel
  const results = await Promise.all(
    boundBlocks.map(async b => {
      const data = await resolveBinding(b.binding!, context)
      return { id: b.id, data }
    })
  )

  for (const r of results) {
    result[r.id] = r.data
  }

  return result
}
