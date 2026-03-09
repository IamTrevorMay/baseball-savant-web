/**
 * Property Inspector for Triton Broadcast Stream Deck plugin
 */

let websocket = null
let uuid = ''
let actionInfo = {}
let currentSettings = {}

function connectElgatoStreamDeckSocket(inPort, inPropertyInspectorUUID, inRegisterEvent, inInfo, inActionInfo) {
  uuid = inPropertyInspectorUUID
  actionInfo = JSON.parse(inActionInfo)
  currentSettings = actionInfo?.payload?.settings || {}

  // Pre-fill saved values
  if (currentSettings.sessionId) {
    document.getElementById('sessionId').value = currentSettings.sessionId
  }
  if (currentSettings.assetId) {
    // Will be set when assets load
  }

  websocket = new WebSocket(`ws://127.0.0.1:${inPort}`)

  websocket.onopen = () => {
    websocket.send(JSON.stringify({ event: inRegisterEvent, uuid }))
    // Request global settings (Supabase credentials)
    websocket.send(JSON.stringify({ event: 'getGlobalSettings', context: uuid }))
  }

  websocket.onmessage = (evt) => {
    const msg = JSON.parse(evt.data)
    if (msg.event === 'didReceiveGlobalSettings') {
      const gs = msg.payload?.settings || {}
      if (gs.supabaseUrl) document.getElementById('supabaseUrl').value = gs.supabaseUrl
      if (gs.supabaseKey) document.getElementById('supabaseKey').value = gs.supabaseKey
      if (gs.supabaseUrl && gs.supabaseKey) {
        document.getElementById('connStatus').textContent = 'Connected'
        document.getElementById('connStatus').className = 'status connected'
      }
    }
  }
}

function saveConnection() {
  const supabaseUrl = document.getElementById('supabaseUrl').value.trim()
  const supabaseKey = document.getElementById('supabaseKey').value.trim()

  if (!supabaseUrl || !supabaseKey) {
    document.getElementById('connStatus').textContent = 'Please fill both fields'
    document.getElementById('connStatus').className = 'status error'
    return
  }

  // Save as global settings (shared across all buttons)
  websocket.send(JSON.stringify({
    event: 'setGlobalSettings',
    context: uuid,
    payload: { supabaseUrl, supabaseKey },
  }))

  document.getElementById('connStatus').textContent = 'Saved'
  document.getElementById('connStatus').className = 'status connected'
}

async function loadAssets() {
  const supabaseUrl = document.getElementById('supabaseUrl').value.trim()
  const supabaseKey = document.getElementById('supabaseKey').value.trim()
  const sessionId = document.getElementById('sessionId').value.trim()

  if (!supabaseUrl || !supabaseKey || !sessionId) {
    alert('Please fill connection details and session ID first')
    return
  }

  try {
    // Fetch session to get project_id
    const sessionRes = await fetch(`${supabaseUrl}/rest/v1/broadcast_sessions?id=eq.${sessionId}&select=*`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    })
    const sessions = await sessionRes.json()
    if (!sessions.length) {
      alert('Session not found')
      return
    }

    const session = sessions[0]

    // Fetch assets
    const assetsRes = await fetch(`${supabaseUrl}/rest/v1/broadcast_assets?project_id=eq.${session.project_id}&select=id,name,asset_type,hotkey_label&order=sort_order`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    })
    const assets = await assetsRes.json()

    // Populate dropdown
    const select = document.getElementById('assetSelect')
    select.innerHTML = '<option value="">-- Select asset --</option>'
    assets.forEach(asset => {
      const opt = document.createElement('option')
      opt.value = asset.id
      opt.textContent = asset.hotkey_label || asset.name
      if (asset.id === currentSettings.assetId) opt.selected = true
      select.appendChild(opt)
    })

    // Save channel name for later
    currentSettings.channelName = session.channel_name
    currentSettings.sessionId = sessionId
  } catch (err) {
    alert('Failed to load assets: ' + err.message)
  }
}

function saveSettings() {
  const assetId = document.getElementById('assetSelect').value
  const sessionId = document.getElementById('sessionId').value.trim()

  if (!assetId) {
    alert('Please select an asset')
    return
  }

  const settings = {
    assetId,
    sessionId,
    channelName: currentSettings.channelName || '',
  }

  websocket.send(JSON.stringify({
    event: 'setSettings',
    context: uuid,
    payload: settings,
  }))

  currentSettings = settings
}

// Expose to Stream Deck
globalThis.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket
