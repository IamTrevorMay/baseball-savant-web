import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
}

export async function OPTIONS() {
  return NextResponse.json(null, { headers: corsHeaders })
}

function json(body: any, init?: { status?: number }) {
  return NextResponse.json(body, { ...init, headers: corsHeaders })
}

// GET /api/daily-cards-config — returns current config + available templates
export async function GET() {
  const { data: config } = await supabaseAdmin
    .from('daily_cards_config')
    .select('id, template_id, top_n, updated_at')
    .limit(1)
    .maybeSingle()

  const { data: templates } = await supabaseAdmin
    .from('report_card_templates')
    .select('id, name, description, category, width, height, updated_at')
    .eq('user_id', '00000000-0000-0000-0000-000000000001')
    .order('name')

  return json({ config, templates: templates || [] })
}

// PUT /api/daily-cards-config — update config (auth via CRON_SECRET)
export async function PUT(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { template_id, top_n } = body

  if (!template_id) {
    return json({ error: 'template_id is required' }, { status: 400 })
  }

  // Verify template exists
  const { data: template } = await supabaseAdmin
    .from('report_card_templates')
    .select('id, name')
    .eq('id', template_id)
    .maybeSingle()

  if (!template) {
    return json({ error: 'Template not found' }, { status: 404 })
  }

  // Get existing config row
  const { data: existing } = await supabaseAdmin
    .from('daily_cards_config')
    .select('id')
    .limit(1)
    .maybeSingle()

  if (existing) {
    const { error } = await supabaseAdmin
      .from('daily_cards_config')
      .update({
        template_id,
        ...(top_n !== undefined ? { top_n } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

    if (error) return json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabaseAdmin
      .from('daily_cards_config')
      .insert({
        template_id,
        top_n: top_n || 5,
      })

    if (error) return json({ error: error.message }, { status: 500 })
  }

  return json({ ok: true, template_id, template_name: template.name })
}
