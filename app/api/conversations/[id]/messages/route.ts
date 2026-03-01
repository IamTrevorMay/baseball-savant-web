import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

function truncateTitle(text: string, maxLen = 60): string {
  if (text.length <= maxLen) return text
  const truncated = text.slice(0, maxLen)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + '...'
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { messages } = await req.json()

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array required' }, { status: 400 })
  }

  // Verify ownership
  const { data: conv, error: convErr } = await supabaseAdmin
    .from('conversations')
    .select('id, title')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (convErr || !conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Insert messages
  const rows = messages.map((m: { role: string; content: string }) => ({
    conversation_id: id,
    role: m.role,
    content: m.content,
  }))

  const { error: insertErr } = await supabaseAdmin
    .from('conversation_messages')
    .insert(rows)

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // Auto-title on first user message (if still default title)
  if (conv.title === 'New conversation') {
    const userMsg = messages.find((m: { role: string }) => m.role === 'user')
    if (userMsg) {
      const newTitle = truncateTitle(userMsg.content)
      await supabaseAdmin
        .from('conversations')
        .update({ title: newTitle, updated_at: new Date().toISOString() })
        .eq('id', id)

      return NextResponse.json({ ok: true, title: newTitle })
    }
  }

  // Update timestamp
  await supabaseAdmin
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ ok: true })
}
