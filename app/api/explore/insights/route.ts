import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are a baseball data analyst. Given query results, generate insights.

Respond with pure JSON (no markdown fences):
{
  "insights": [
    {
      "title": "Short label (e.g. 'Highest Whiff%')",
      "value": "The stat value (e.g. '42.3%')",
      "description": "One sentence explaining why this matters",
      "sentiment": "positive" | "negative" | "neutral"
    }
  ],
  "narrative": "2-3 sentence summary of the key pattern",
  "story_angles": ["Bullet point media/editorial angle", "..."]
}

Rules:
- 3-5 insights, each with a clear callout
- Focus on outliers, correlations, and actionable trends
- Story angles should be pitched for a baseball media show or article
- Keep descriptions concise — one sentence each`

export async function POST(req: NextRequest) {
  try {
    const { data, question, viz_config } = await req.json()

    // Sample data if too large
    const sample = Array.isArray(data) ? data.slice(0, 200) : []
    const columns = sample.length > 0 ? Object.keys(sample[0]) : []

    const prompt = `Original question: "${question}"

Visualization config: ${JSON.stringify(viz_config)}

Data columns: ${columns.join(', ')}
Row count: ${Array.isArray(data) ? data.length : 0}
Sample data (first ${sample.length} rows):
${JSON.stringify(sample, null, 1)}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('')

    let parsed
    try {
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({
        insights: [],
        narrative: text,
        story_angles: [],
      })
    }

    return NextResponse.json({
      insights: parsed.insights || [],
      narrative: parsed.narrative || '',
      story_angles: parsed.story_angles || [],
    })
  } catch (error: any) {
    console.error('Explore insights error:', error)
    return NextResponse.json({ error: error.message || 'Something went wrong' }, { status: 500 })
  }
}
