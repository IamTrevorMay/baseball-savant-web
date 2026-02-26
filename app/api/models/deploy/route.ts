import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { modelId } = await req.json()
  if (!modelId) return NextResponse.json({ error: 'modelId is required' }, { status: 400 })

  const { data: model, error: fetchErr } = await supabase.from('models').select('*').eq('id', modelId).single()
  if (fetchErr || !model) return NextResponse.json({ error: 'Model not found' }, { status: 404 })

  // Set status to deploying
  await supabase.from('models').update({ status: 'deploying', deploy_error: null, updated_at: new Date().toISOString() }).eq('id', modelId)

  try {
    // Add the column if it doesn't exist
    const addColSql = `ALTER TABLE pitches ADD COLUMN IF NOT EXISTS ${model.column_name} REAL`
    const { error: alterErr } = await supabase.rpc('run_query', { query_text: addColSql })
    if (alterErr) throw new Error(`ALTER TABLE failed: ${alterErr.message}`)

    // First batch: update 50K rows
    const updateSql = `UPDATE pitches SET ${model.column_name} = (${model.formula}) WHERE ${model.column_name} IS NULL LIMIT 50000`
    // Postgres doesn't support LIMIT in UPDATE, use subquery
    const batchSql = `UPDATE pitches SET ${model.column_name} = (${model.formula}) WHERE ctid IN (SELECT ctid FROM pitches WHERE ${model.column_name} IS NULL LIMIT 50000)`
    const { error: updateErr } = await supabase.rpc('run_query', { query_text: batchSql })
    if (updateErr) throw new Error(`Initial batch failed: ${updateErr.message}`)

    // Check remaining
    const countSql = `SELECT COUNT(*) AS remaining FROM pitches WHERE ${model.column_name} IS NULL`
    const { data: countData } = await supabase.rpc('run_query', { query_text: countSql })
    const remaining = countData?.[0]?.remaining || 0

    if (remaining === 0 || remaining === '0') {
      await supabase.from('models').update({
        status: 'deployed',
        deployed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', modelId)
      return NextResponse.json({ status: 'deployed', remaining: 0 })
    }

    return NextResponse.json({ status: 'deploying', remaining: Number(remaining) })
  } catch (e: any) {
    await supabase.from('models').update({
      status: 'failed',
      deploy_error: e.message,
      updated_at: new Date().toISOString(),
    }).eq('id', modelId)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
