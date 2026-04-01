import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Scene } from '@/lib/sceneTypes'
import { AUTO_COMPOSE_TOOLS, handleAutoComposeTool } from '@/lib/autoComposeTools'
import { buildAutoComposeSystemPrompt } from '@/lib/autoComposePrompt'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** SSE helper — sends a JSON event to the stream */
function sendSSE(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  event: string,
  data: Record<string, any>
) {
  controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { sessionId, message, currentScene, history } = await req.json()

  if (!message || !currentScene) {
    return new Response(JSON.stringify({ error: 'message and currentScene required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Working copy of scene that tools will mutate
  let workingScene: Scene = { ...currentScene }

  // Build messages array from history + new message
  const messages: Anthropic.MessageParam[] = []
  if (history?.length) {
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content })
    }
  }
  messages.push({ role: 'user', content: message })

  // Track tools used across iterations
  const toolsUsed: string[] = []
  const MAX_ITERATIONS = 15

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let iterations = 0
        let done = false
        let finalText = ''

        while (!done && iterations <= MAX_ITERATIONS) {
          const systemPrompt = await buildAutoComposeSystemPrompt(workingScene)

          // Signal new turn so frontend resets streamed text
          sendSSE(controller, encoder, 'new_turn', { iteration: iterations })

          // Use streaming for the API call
          const streamResponse = anthropic.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 16000,
            system: systemPrompt,
            tools: AUTO_COMPOSE_TOOLS,
            messages,
            thinking: { type: 'enabled', budget_tokens: 4096 },
          })

          // Track text for this iteration only
          let turnText = ''

          // Collect the full response while streaming text deltas
          const response = await streamResponse.on('text', (text) => {
            turnText += text
            sendSSE(controller, encoder, 'text_delta', { text })
          }).finalMessage()

          // Check stop reason
          if (response.stop_reason === 'tool_use') {
            iterations++
            const assistantContent = response.content
            messages.push({ role: 'assistant', content: assistantContent })

            const toolResults: Anthropic.ToolResultBlockParam[] = []

            for (const block of assistantContent) {
              if (block.type === 'tool_use') {
                toolsUsed.push(block.name)
                sendSSE(controller, encoder, 'tool_start', { name: block.name })

                const { result, sceneUpdate } = await handleAutoComposeTool(
                  block.name,
                  block.input as Record<string, any>,
                  { scene: workingScene }
                )

                // Apply scene updates
                if (sceneUpdate) {
                  if ('id' in sceneUpdate && 'elements' in sceneUpdate && 'width' in sceneUpdate) {
                    workingScene = sceneUpdate as Scene
                  } else {
                    workingScene = { ...workingScene, ...sceneUpdate }
                  }
                }

                sendSSE(controller, encoder, 'tool_done', { name: block.name })

                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: result,
                })
              }
            }

            messages.push({ role: 'user', content: toolResults })
            // Continue loop for next iteration
          } else {
            // End turn — this iteration's text is the final response
            finalText = turnText
            done = true
          }
        }

        // Send final scene + metadata
        sendSSE(controller, encoder, 'done', {
          scene: workingScene,
          toolsUsed,
        })

        // Save to DB (fire-and-forget, don't block the stream close)
        if (sessionId) {
          saveToDb(sessionId, message, finalText || 'Done.', workingScene, toolsUsed).catch(
            err => console.error('Auto-compose DB save error:', err)
          )
        }

        controller.close()
      } catch (error: any) {
        console.error('Auto-compose stream error:', error)
        sendSSE(controller, encoder, 'error', { message: error.message || 'Something went wrong' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

/** Save user + assistant messages to DB (fire-and-forget) */
async function saveToDb(
  sessionId: string,
  userMessage: string,
  assistantText: string,
  scene: Scene,
  toolsUsed: string[]
) {
  await supabaseAdmin.from('auto_session_messages').insert({
    session_id: sessionId,
    role: 'user',
    content: userMessage,
  })

  await supabaseAdmin.from('auto_session_messages').insert({
    session_id: sessionId,
    role: 'assistant',
    content: assistantText,
    scene_snapshot: scene,
    tools_used: toolsUsed,
  })

  await supabaseAdmin
    .from('auto_sessions')
    .update({ scene, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
}
