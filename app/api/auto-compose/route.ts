import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Scene } from '@/lib/sceneTypes'
import { AUTO_COMPOSE_TOOLS, handleAutoComposeTool } from '@/lib/autoComposeTools'
import { buildAutoComposeSystemPrompt } from '@/lib/autoComposePrompt'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { sessionId, message, currentScene, history } = await req.json()

    if (!message || !currentScene) {
      return NextResponse.json({ error: 'message and currentScene required' }, { status: 400 })
    }

    // Working copy of scene that tools will mutate
    let workingScene: Scene = { ...currentScene }

    // Build messages array from history + new message
    const messages: Anthropic.MessageParam[] = []

    // Add prior conversation history (compact: just role + text content)
    if (history?.length) {
      for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    // Add new user message
    messages.push({ role: 'user', content: message })

    // Build system prompt with current scene context
    const systemPrompt = buildAutoComposeSystemPrompt(workingScene)

    // Track tools used across iterations
    const toolsUsed: string[] = []
    const MAX_ITERATIONS = 15

    // Agentic loop
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: systemPrompt,
      tools: AUTO_COMPOSE_TOOLS,
      messages,
    })

    let iterations = 0

    while (response.stop_reason === 'tool_use' && iterations < MAX_ITERATIONS) {
      iterations++
      const assistantContent = response.content
      messages.push({ role: 'assistant', content: assistantContent })

      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of assistantContent) {
        if (block.type === 'tool_use') {
          toolsUsed.push(block.name)

          const { result, sceneUpdate } = await handleAutoComposeTool(
            block.name,
            block.input as Record<string, any>,
            { scene: workingScene }
          )

          // Apply scene updates
          if (sceneUpdate) {
            // If the sceneUpdate has all Scene fields (from build_from_template), replace entirely
            if ('id' in sceneUpdate && 'elements' in sceneUpdate && 'width' in sceneUpdate) {
              workingScene = sceneUpdate as Scene
            } else {
              workingScene = { ...workingScene, ...sceneUpdate }
            }
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          })
        }
      }

      messages.push({ role: 'user', content: toolResults })

      // Re-call with updated scene context in system prompt
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: buildAutoComposeSystemPrompt(workingScene),
        tools: AUTO_COMPOSE_TOOLS,
        messages,
      })
    }

    // Extract final text response
    const textContent = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    // Save messages to DB if we have a session
    if (sessionId) {
      // Save user message
      await supabaseAdmin.from('auto_session_messages').insert({
        session_id: sessionId,
        role: 'user',
        content: message,
      })

      // Save assistant message with scene snapshot
      await supabaseAdmin.from('auto_session_messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: textContent,
        scene_snapshot: workingScene,
        tools_used: toolsUsed,
      })

      // Update session with latest scene
      await supabaseAdmin
        .from('auto_sessions')
        .update({ scene: workingScene, updated_at: new Date().toISOString() })
        .eq('id', sessionId)
    }

    return NextResponse.json({
      text: textContent,
      scene: workingScene,
      toolsUsed,
    })
  } catch (error: any) {
    console.error('Auto-compose error:', error)
    return NextResponse.json({ error: error.message || 'Something went wrong' }, { status: 500 })
  }
}
