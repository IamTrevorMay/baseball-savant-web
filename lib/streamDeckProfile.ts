import type { BroadcastAsset, BroadcastSegment } from './broadcastTypes'

type DeviceModel = 'sd' | 'sd-xl' | 'sd-mini' | 'sd-plus'

const DEVICE_DIMS: Record<DeviceModel, { cols: number; rows: number }> = {
  'sd':      { cols: 5, rows: 3 },
  'sd-xl':   { cols: 8, rows: 4 },
  'sd-mini': { cols: 3, rows: 2 },
  'sd-plus': { cols: 4, rows: 2 },
}

// Physical button icon sizes per device model (pixels)
const DEVICE_ICON_SIZES: Record<DeviceModel, number> = {
  'sd':      72,
  'sd-xl':   96,
  'sd-mini': 80,
  'sd-plus': 120,
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
  | { type: 'segment'; segment: BroadcastSegment }
  | { type: 'slideshow-prev' }
  | { type: 'slideshow-next' }
  | { type: 'empty' }

export { DEVICE_DIMS, DEVICE_ICON_SIZES }
export type { DeviceModel }

export async function generateButtonImage(
  label: string,
  color: string,
  hotkey?: string | null,
  isActive?: boolean,
  pixelSize?: number,
): Promise<string> {
  const size = pixelSize || 144
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
  ctx.roundRect(0, 0, size, size, Math.round(size * 0.08))
  ctx.fill()

  // Active state: green border ring
  if (isActive) {
    const borderWidth = Math.max(3, Math.round(size * 0.04))
    ctx.strokeStyle = '#10b981'
    ctx.lineWidth = borderWidth
    const inset = borderWidth / 2
    ctx.beginPath()
    ctx.roundRect(inset, inset, size - borderWidth, size - borderWidth, Math.round(size * 0.08))
    ctx.stroke()
  }

  // Label text (centered, truncated)
  const fontSize = Math.max(10, Math.round(size * 0.11))
  const maxChars = Math.max(6, Math.round(size / 12))
  const displayLabel = label.length > maxChars ? label.slice(0, maxChars - 1) + '\u2026' : label
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(displayLabel, size / 2, size / 2)

  // Hotkey badge (bottom-right)
  if (hotkey) {
    const badgeFontSize = Math.max(8, Math.round(size * 0.075))
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    const badgeText = hotkey.toUpperCase()
    ctx.font = `bold ${badgeFontSize}px sans-serif`
    const metrics = ctx.measureText(badgeText)
    const bw = metrics.width + 8
    const bh = badgeFontSize + 4
    const bx = size - bw - 4
    const by = size - bh - 4
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

/** Render a button image and return raw RGBA pixel buffer for device fillKeyBuffer */
export async function generateButtonBuffer(
  label: string,
  color: string,
  pixelSize: number,
  hotkey?: string | null,
  isActive?: boolean,
): Promise<Uint8Array> {
  let canvas: OffscreenCanvas | HTMLCanvasElement
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(pixelSize, pixelSize)
    ctx = canvas.getContext('2d')!
  } else {
    canvas = document.createElement('canvas')
    canvas.width = pixelSize
    canvas.height = pixelSize
    ctx = canvas.getContext('2d')!
  }

  // Background
  ctx.fillStyle = color || '#3f3f46'
  ctx.fillRect(0, 0, pixelSize, pixelSize)

  // Active: green border
  if (isActive) {
    const bw = Math.max(3, Math.round(pixelSize * 0.05))
    ctx.strokeStyle = '#10b981'
    ctx.lineWidth = bw
    ctx.strokeRect(bw / 2, bw / 2, pixelSize - bw, pixelSize - bw)
  }

  // Label
  const fontSize = Math.max(8, Math.round(pixelSize * 0.14))
  const maxChars = Math.max(5, Math.round(pixelSize / 10))
  const displayLabel = label.length > maxChars ? label.slice(0, maxChars - 1) + '\u2026' : label
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(displayLabel, pixelSize / 2, pixelSize / 2)

  // Hotkey badge
  if (hotkey) {
    const badgeFs = Math.max(7, Math.round(pixelSize * 0.09))
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    const badgeText = hotkey.toUpperCase()
    ctx.font = `bold ${badgeFs}px sans-serif`
    const m = ctx.measureText(badgeText)
    const bw = m.width + 6
    const bh = badgeFs + 3
    ctx.fillRect(pixelSize - bw - 3, pixelSize - bh - 3, bw, bh)
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(badgeText, pixelSize - bw / 2 - 3, pixelSize - bh / 2 - 3)
  }

  const imageData = ctx.getImageData(0, 0, pixelSize, pixelSize)
  return new Uint8Array(imageData.data.buffer)
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

    if (entry.type === 'segment') {
      const { segment } = entry
      const segLabel = segment.name
      const segColor = segment.hotkey_color || '#6366f1'
      const image = await generateButtonImage(segLabel, segColor, segment.hotkey_key)
      actions.push({ Name: segLabel, States: [{ Title: segLabel, Image: image }] })
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
