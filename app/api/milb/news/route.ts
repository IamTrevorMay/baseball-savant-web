import { NextResponse } from 'next/server'
import Parser from 'rss-parser'

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Triton Baseball News Aggregator' },
})

interface FeedSource {
  name: string
  url: string
  color: string
}

const FEEDS: FeedSource[] = [
  { name: 'MiLB.com', url: 'https://www.milb.com/news/rss.xml', color: '#3b82f6' },
  { name: 'MLB Pipeline', url: 'https://www.mlb.com/pipeline/feed/rss.xml', color: '#e11d48' },
  { name: 'FanGraphs', url: 'https://blogs.fangraphs.com/feed/', color: '#10b981' },
]

export async function GET() {
  try {
    const results = await Promise.allSettled(
      FEEDS.map(async (source) => {
        const feed = await parser.parseURL(source.url)
        return (feed.items || []).slice(0, 10).map(item => ({
          title: item.title || '',
          link: item.link || '',
          pubDate: item.isoDate || item.pubDate || '',
          source: source.name,
          sourceColor: source.color,
          description: (item.contentSnippet || item.content || '').slice(0, 200).replace(/<[^>]*>/g, ''),
          imageUrl: item.enclosure?.url || extractImage(item.content || item['content:encoded'] || '') || null,
        }))
      })
    )

    const items = results
      .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .filter(item => item.title && item.link)
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .slice(0, 30)

    return NextResponse.json({ items }, {
      headers: { 'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600' },
    })
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e.message }, { status: 500 })
  }
}

function extractImage(html: string): string | null {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/)
  return match?.[1] || null
}
