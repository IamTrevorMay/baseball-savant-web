import type { BroadcastAsset } from './broadcastTypes'

type DeviceModel = 'sd' | 'sd-xl' | 'sd-mini' | 'sd-plus'

const DEVICE_DIMS: Record<DeviceModel, { cols: number; rows: number }> = {
  'sd':      { cols: 5, rows: 3 },
  'sd-xl':   { cols: 8, rows: 4 },
  'sd-mini': { cols: 3, rows: 2 },
  'sd-plus': { cols: 4, rows: 2 },
}

// JS key name → Stream Deck HID keyCode approximation
// Stream Deck profiles use virtual key codes for hotkey actions
const KEY_TO_KEYCODE: Record<string, number> = {
  '1': 49, '2': 50, '3': 51, '4': 52, '5': 53, '6': 54, '7': 55, '8': 56, '9': 57, '0': 48,
  'a': 65, 'b': 66, 'c': 67, 'd': 68, 'e': 69, 'f': 70, 'g': 71, 'h': 72, 'i': 73, 'j': 74,
  'k': 75, 'l': 76, 'm': 77, 'n': 78, 'o': 79, 'p': 80, 'q': 81, 'r': 82, 's': 83, 't': 84,
  'u': 85, 'v': 86, 'w': 87, 'x': 88, 'y': 89, 'z': 90,
  'f1': 112, 'f2': 113, 'f3': 114, 'f4': 115, 'f5': 116, 'f6': 117,
  'f7': 118, 'f8': 119, 'f9': 120, 'f10': 121, 'f11': 122, 'f12': 123,
}

export type ButtonEntry =
  | { type: 'asset'; asset: BroadcastAsset }
  | { type: 'slideshow-prev' }
  | { type: 'slideshow-next' }
  | { type: 'empty' }

export { DEVICE_DIMS }
export type { DeviceModel }

export async function generateButtonImage(
  label: string,
  color: string,
  hotkey?: string | null,
): Promise<string> {
  const size = 144
  let canvas: OffscreenCanvas | HTMLCanvasElement
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(size, size)
    ctx = canvas.getContext('2d')!
  } else {
    canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    ctx = canvas.getContext('2d')!
  }

  // Background
  ctx.fillStyle = color || '#3f3f46'
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, 12)
  ctx.fill()

  // Label text (centered, truncated)
  const displayLabel = label.length > 12 ? label.slice(0, 11) + '\u2026' : label
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 16px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(displayLabel, size / 2, size / 2)

  // Hotkey badge (bottom-right)
  if (hotkey) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    const badgeText = hotkey.toUpperCase()
    ctx.font = 'bold 11px sans-serif'
    const metrics = ctx.measureText(badgeText)
    const bw = metrics.width + 8
    const bh = 16
    const bx = size - bw - 6
    const by = size - bh - 6
    ctx.beginPath()
    ctx.roundRect(bx, by, bw, bh, 4)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(badgeText, bx + bw / 2, by + bh / 2)
  }

  // Convert to base64
  let blob: Blob
  if (canvas instanceof OffscreenCanvas) {
    blob = await canvas.convertToBlob({ type: 'image/png' })
  } else {
    blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(b => resolve(b!), 'image/png')
    })
  }
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return 'data:image/png;base64,' + btoa(binary)
}

interface ProfileOptions {
  assets: BroadcastAsset[]
  projectName: string
  deviceModel: DeviceModel
  sessionId?: string
  baseUrl?: string
  buttonLayout?: ButtonEntry[]
}

export async function generateStreamDeckProfile(opts: ProfileOptions): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  const { assets, projectName, deviceModel, sessionId, baseUrl, buttonLayout } = opts
  const dims = DEVICE_DIMS[deviceModel]
  const totalButtons = dims.cols * dims.rows

  // Use provided layout or fall back to sorted assets + nav buttons
  let buttonEntries: ButtonEntry[]
  if (buttonLayout) {
    buttonEntries = buttonLayout.slice(0, totalButtons)
    while (buttonEntries.length < totalButtons) buttonEntries.push({ type: 'empty' })
  } else {
    const sorted = [...assets].sort((a, b) => a.sort_order - b.sort_order)
    buttonEntries = []
    for (const asset of sorted) {
      buttonEntries.push({ type: 'asset', asset })
    }
    buttonEntries.push({ type: 'slideshow-prev' })
    buttonEntries.push({ type: 'slideshow-next' })
    while (buttonEntries.length < totalButtons) buttonEntries.push({ type: 'empty' })
  }

  // Build button actions array
  const actions: any[] = []

  for (let i = 0; i < totalButtons; i++) {
    const entry = buttonEntries[i]
    if (!entry || entry.type === 'empty') {
      // Empty slot
      actions.push({ Name: '', States: [{ Title: '', Image: '' }] })
      continue
    }

    if (entry.type === 'slideshow-prev' || entry.type === 'slideshow-next') {
      const isNext = entry.type === 'slideshow-next'
      const navLabel = isNext ? 'Next Slide >' : '< Prev Slide'
      const navColor = '#3f3f46'
      const image = await generateButtonImage(navLabel, navColor)
      const action: any = {
        Name: navLabel,
        States: [{ Title: navLabel, Image: image }],
      }
      if (sessionId && baseUrl) {
        const url = `${baseUrl}/api/broadcast/trigger?sid=${sessionId}&action=${isNext ? 'slideshow_visible_next' : 'slideshow_visible_prev'}`
        action.UUID = 'com.elgato.streamdeck.system.website'
        action.Settings = { openInBrowser: true, url }
      }
      actions.push(action)
      continue
    }

    const { asset } = entry

    const label = asset.hotkey_label || asset.name
    const color = asset.hotkey_color || '#3f3f46'
    const image = await generateButtonImage(label, color, asset.hotkey_key)

    const action: any = {
      Name: label,
      States: [{ Title: label, Image: image }],
    }

    // If session is live and we have a base URL, use HTTP trigger (Open URL action)
    if (sessionId && baseUrl) {
      const url = `${baseUrl}/api/broadcast/trigger?sid=${sessionId}&aid=${asset.id}&action=toggle`
      action.UUID = 'com.elgato.streamdeck.system.website'
      action.Settings = { openInBrowser: true, url }
    } else if (asset.hotkey_key) {
      // Hotkey-based action
      action.UUID = 'com.elgato.streamdeck.system.hotkey'
      action.Settings = {
        HotKey: {
          KeyCode: KEY_TO_KEYCODE[asset.hotkey_key.toLowerCase()] || 0,
          Modifiers: 0,
        },
      }
    }

    actions.push(action)
  }

  const manifest = {
    Name: projectName,
    DeviceModel: deviceModel === 'sd-xl' ? 1 : deviceModel === 'sd-mini' ? 2 : deviceModel === 'sd-plus' ? 7 : 0,
    Actions: actions,
    Columns: dims.cols,
    Rows: dims.rows,
    Version: '1.0',
  }

  const folderName = projectName.replace(/\s+/g, '-')
  zip.file(`${folderName}.sdProfile/manifest.json`, JSON.stringify(manifest, null, 2))

  return await zip.generateAsync({ type: 'blob' })
}
