/**
 * Triton Broadcast — Stream Deck Plugin
 *
 * Connects to Supabase Realtime to control broadcast assets.
 * Each button maps to one broadcast asset and toggles show/hide.
 */

let websocket = null
let supabaseUrl = ''
let supabaseKey = ''
let channel = null
let supabase = null

// Track state per context (button)
const buttonState = {} // context -> { assetId, sessionId, channelName, visible }
const globalSettings = {} // { supabaseUrl, supabaseKey, sessionId }

// ── WebSocket to Stream Deck ────────────────────────────────────────────────

function connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, inInfo) {
  websocket = new WebSocket(`ws://127.0.0.1:${inPort}`)

  websocket.onopen = () => {
    // Register plugin
    websocket.send(JSON.stringify({ event: inRegisterEvent, uuid: inPluginUUID }))
  }

  websocket.onmessage = (evt) => {
    const msg = JSON.parse(evt.data)
    handleMessage(msg)
  }

  websocket.onclose = () => {
    console.log('[Triton] WebSocket closed, reconnecting...')
    setTimeout(() => connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, inInfo), 5000)
  }
}

function handleMessage(msg) {
  const { event, context, payload, action } = msg

  switch (event) {
    case 'keyDown':
      handleKeyPress(context, payload, action)
      break

    case 'willAppear':
      // Button appeared — restore settings
      if (payload?.settings) {
        buttonState[context] = {
          assetId: payload.settings.assetId || '',
          sessionId: payload.settings.sessionId || '',
          channelName: payload.settings.channelName || '',
          visible: false,
        }
      }
      break

    case 'willDisappear':
      delete buttonState[context]
      break

    case 'didReceiveSettings':
      if (payload?.settings) {
        buttonState[context] = {
          ...buttonState[context],
          assetId: payload.settings.assetId || '',
          sessionId: payload.settings.sessionId || '',
          channelName: payload.settings.channelName || '',
        }
        // Reconnect channel if needed
        ensureChannel(payload.settings.channelName)
      }
      break

    case 'didReceiveGlobalSettings':
      if (payload?.settings) {
        Object.assign(globalSettings, payload.settings)
        if (globalSettings.supabaseUrl && globalSettings.supabaseKey) {
          initSupabase(globalSettings.supabaseUrl, globalSettings.supabaseKey)
        }
      }
      break
  }
}

// ── Key Press Handler ────────────────────────────────────────────────────────

function handleKeyPress(context, payload, action) {
  const state = buttonState[context]
  if (!state?.assetId || !channel) return

  const isToggle = action === 'com.triton.broadcast.toggle-asset'
  const isVideo = action === 'com.triton.broadcast.play-video'

  if (isToggle) {
    state.visible = !state.visible
    const event = state.visible ? 'asset:show' : 'asset:hide'
    channel.send({
      type: 'broadcast',
      event,
      payload: { assetId: state.assetId, timestamp: Date.now() },
    })
    // Update button state (0 = off, 1 = on)
    websocket.send(JSON.stringify({
      event: 'setState',
      context,
      payload: { state: state.visible ? 1 : 0 },
    }))
  }

  if (isVideo) {
    state.visible = !state.visible
    const event = state.visible ? 'video:play' : 'video:stop'
    channel.send({
      type: 'broadcast',
      event,
      payload: { assetId: state.assetId, timestamp: Date.now() },
    })
    websocket.send(JSON.stringify({
      event: 'setState',
      context,
      payload: { state: state.visible ? 1 : 0 },
    }))
  }
}

// ── Supabase Connection ─────────────────────────────────────────────────────

async function initSupabase(url, key) {
  supabaseUrl = url
  supabaseKey = key

  try {
    // Dynamic import for @supabase/supabase-js
    const { createClient } = await import('@supabase/supabase-js')
    supabase = createClient(url, key)
    console.log('[Triton] Supabase initialized')
  } catch (err) {
    console.error('[Triton] Failed to init Supabase:', err)
  }
}

function ensureChannel(channelName) {
  if (!supabase || !channelName) return
  if (channel) {
    supabase.removeChannel(channel)
  }
  channel = supabase.channel(channelName)
  channel.subscribe((status) => {
    console.log(`[Triton] Channel ${channelName}: ${status}`)
  })
}

// ── Entry Point ─────────────────────────────────────────────────────────────
// Stream Deck calls this global function to start the plugin
globalThis.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket
