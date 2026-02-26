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
  if (model.status !== 'deploying') return NextResponse.json({ error: 'Model is not deploying' }, { status: 400 })

  try {
    // Update next 50K rows
    const batchSql = `UPDATE pitches SET ${model.column_name} = (${model.formula}) WHERE ctid IN (SELECT ctid FROM pitches WHERE ${model.column_name} IS NULL LIMIT 50000)`
    const { error: updateErr } = await supabase.rpc('run_query', { query_text: batchSql })
    if (updateErr) throw new Error(`Batch update failed: ${updateErr.message}`)

    // Count remaining
    const countSql = `SELECT COUNT(*) AS remaining FROM pitches WHERE ${model.column_name} IS NULL`
    const { data: countData } = await supabase.rpc('run_query', { query_text: countSql })
    const remaining = Number(countData?.[0]?.remaining || 0)

    // Get total
    const totalSql = `SELECT COUNT(*) AS total FROM pitches`
    const { data: totalData } = await supabase.rpc('run_query', { query_text: totalSql })
    const total = Number(totalData?.[0]?.total || 0)

    if (remaining === 0) {
      await supabase.from('models').update({
        status: 'deployed',
        deployed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', modelId)
      return NextResponse.json({ status: 'deployed', remaining: 0, total })
    }

    return NextResponse.json({ status: 'deploying', remaining, total })
  } catch (e: any) {
    await supabase.from('models').update({
      status: 'failed',
      deploy_error: e.message,
      updated_at: new Date().toISOString(),
    }).eq('id', modelId)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
