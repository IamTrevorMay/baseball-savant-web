import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status')
  let query = supabase.from('models').select('*').neq('status', 'archived').order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ models: data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, description, formula, columnName, deployConfig } = body
  if (!name || !formula || !columnName) {
    return NextResponse.json({ error: 'name, formula, and columnName are required' }, { status: 400 })
  }
  const { data, error } = await supabase.from('models').insert({
    name,
    description: description || null,
    formula,
    column_name: columnName,
    deploy_config: deployConfig || {},
    versions: [{ version: 1, formula, created_at: new Date().toISOString() }],
    current_version: 1,
    status: 'draft',
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ model: data })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, name, description, formula, deployConfig } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // Fetch current model
  const { data: current, error: fetchErr } = await supabase.from('models').select('*').eq('id', id).single()
  if (fetchErr || !current) return NextResponse.json({ error: 'Model not found' }, { status: 404 })

  const updates: any = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name
  if (description !== undefined) updates.description = description
  if (deployConfig !== undefined) updates.deploy_config = deployConfig

  // If formula changed, push new version
  if (formula && formula !== current.formula) {
    const versions = current.versions || []
    const newVersion = versions.length + 1
    versions.push({ version: newVersion, formula, created_at: new Date().toISOString() })
    updates.formula = formula
    updates.versions = versions
    updates.current_version = newVersion
  }

  const { data, error } = await supabase.from('models').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ model: data })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const { error } = await supabase.from('models').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
