'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { ButtonEntry } from './streamDeckProfile'

export interface StreamDeckState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  error: string | null
  deviceModel: string | null
  serialNumber: string | null
  buttonCount: number
}

interface StreamDeckCallbacks {
  onToggleAsset?: (assetId: string) => void
  onSlideshowNext?: () => void
  onSlideshowPrev?: () => void
  onSwitchSegment?: (segmentId: string) => void
}

interface UseStreamDeckOptions {
  callbacks?: StreamDeckCallbacks
}

type StreamDeckDevice = {
  MODEL: string
  PRODUCT_NAME: string
  CONTROLS: readonly { type: string; index: number }[]
  on: (event: string, handler: (...args: any[]) => void) => void
  off: (event: string, handler: (...args: any[]) => void) => void
  fillKeyCanvas: (keyIndex: number, canvas: HTMLCanvasElement) => Promise<void>
  fillKeyColor: (keyIndex: number, r: number, g: number, b: number) => Promise<void>
  clearKey: (keyIndex: number) => Promise<void>
  clearPanel: () => Promise<void>
  setBrightness: (percentage: number) => Promise<void>
  getSerialNumber: () => Promise<string>
  close: () => Promise<void>
}

// Map device MODEL id → our icon pixel size
function getIconSize(model: string): number {
  if (model.includes('xl')) return 96
  if (model.includes('mini')) return 80
  if (model.includes('plus')) return 120
  return 72 // original, mk2, etc.
}

// Get button count from CONTROLS
function getButtonCount(controls: readonly { type: string }[]): number {
  return controls.filter(c => c.type === 'button').length
}

export function useStreamDeck(options?: UseStreamDeckOptions) {
  const [state, setState] = useState<StreamDeckState>({
    status: 'disconnected',
    error: null,
    deviceModel: null,
    serialNumber: null,
    buttonCount: 0,
  })

  const deviceRef = useRef<StreamDeckDevice | null>(null)
  const callbacksRef = useRef(options?.callbacks)
  callbacksRef.current = options?.callbacks
  const buttonOrderRef = useRef<ButtonEntry[]>([])
  const iconSizeRef = useRef(72)

  const connect = useCallback(async () => {
    setState(prev => ({ ...prev, status: 'connecting', error: null }))

    try {
      const { requestStreamDecks } = await import('@elgato-stream-deck/webhid')
      const devices = await requestStreamDecks()

      if (devices.length === 0) {
        setState(prev => ({ ...prev, status: 'disconnected', error: 'No device selected' }))
        return
      }

      const device = devices[0] as unknown as StreamDeckDevice
      const serial = await device.getSerialNumber()
      const buttonCount = getButtonCount(device.CONTROLS)
      iconSizeRef.current = getIconSize(device.MODEL)

      // Listen for button presses
      device.on('down', (control: { type: string; index: number }) => {
        if (control.type !== 'button') return
        const entry = buttonOrderRef.current[control.index]
        if (!entry) return

        switch (entry.type) {
          case 'asset':
            callbacksRef.current?.onToggleAsset?.(entry.asset.id)
            break
          case 'segment':
            callbacksRef.current?.onSwitchSegment?.(entry.segment.id)
            break
          case 'slideshow-next':
            callbacksRef.current?.onSlideshowNext?.()
            break
          case 'slideshow-prev':
            callbacksRef.current?.onSlideshowPrev?.()
            break
        }
      })

      device.on('error', (err: unknown) => {
        console.error('[StreamDeck] Device error:', err)
        setState(prev => ({
          ...prev,
          status: 'error',
          error: err instanceof Error ? err.message : 'Device error',
        }))
      })

      await device.setBrightness(80)
      deviceRef.current = device

      setState({
        status: 'connected',
        error: null,
        deviceModel: device.PRODUCT_NAME || device.MODEL,
        serialNumber: serial,
        buttonCount,
      })
    } catch (err: any) {
      // User cancelled the picker → not an error
      if (err?.name === 'NotFoundError' || err?.message?.includes('No device')) {
        setState(prev => ({ ...prev, status: 'disconnected', error: null }))
        return
      }
      setState({
        status: 'error',
        error: err?.message || 'Failed to connect',
        deviceModel: null,
        serialNumber: null,
        buttonCount: 0,
      })
    }
  }, [])

  const disconnect = useCallback(async () => {
    const device = deviceRef.current
    if (device) {
      try {
        await device.clearPanel()
        await device.close()
      } catch {}
      deviceRef.current = null
    }
    buttonOrderRef.current = []
    setState({
      status: 'disconnected',
      error: null,
      deviceModel: null,
      serialNumber: null,
      buttonCount: 0,
    })
  }, [])

  const updateButtons = useCallback(async (
    buttonOrder: ButtonEntry[],
    visibleAssetIds: Set<string>,
    activeSegmentId: string | null,
  ) => {
    const device = deviceRef.current
    if (!device) return

    buttonOrderRef.current = buttonOrder
    const iconSize = iconSizeRef.current

    for (let i = 0; i < buttonOrder.length; i++) {
      const entry = buttonOrder[i]

      if (!entry || entry.type === 'empty') {
        try { await device.fillKeyColor(i, 24, 24, 27) } catch {} // zinc-900
        continue
      }

      let label: string
      let color: string
      let hotkey: string | null = null
      let isActive = false

      switch (entry.type) {
        case 'asset': {
          label = entry.asset.hotkey_label || entry.asset.name
          color = entry.asset.hotkey_color || '#3f3f46'
          hotkey = entry.asset.hotkey_key
          isActive = visibleAssetIds.has(entry.asset.id)
          break
        }
        case 'segment': {
          label = entry.segment.name
          color = entry.segment.hotkey_color || '#6366f1'
          hotkey = entry.segment.hotkey_key
          isActive = activeSegmentId === entry.segment.id
          break
        }
        case 'slideshow-prev':
          label = '< Prev'
          color = '#3f3f46'
          break
        case 'slideshow-next':
          label = 'Next >'
          color = '#3f3f46'
          break
        default:
          continue
      }

      try {
        // Render to a canvas and push to device
        const canvas = document.createElement('canvas')
        canvas.width = iconSize
        canvas.height = iconSize
        const ctx = canvas.getContext('2d')!

        // Background
        ctx.fillStyle = color
        ctx.fillRect(0, 0, iconSize, iconSize)

        // Active border
        if (isActive) {
          const bw = Math.max(3, Math.round(iconSize * 0.05))
          ctx.strokeStyle = '#10b981'
          ctx.lineWidth = bw
          ctx.strokeRect(bw / 2, bw / 2, iconSize - bw, iconSize - bw)
        }

        // Label
        const fontSize = Math.max(8, Math.round(iconSize * 0.14))
        const maxChars = Math.max(5, Math.round(iconSize / 10))
        const displayLabel = label.length > maxChars ? label.slice(0, maxChars - 1) + '\u2026' : label
        ctx.fillStyle = '#ffffff'
        ctx.font = `bold ${fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(displayLabel, iconSize / 2, iconSize / 2)

        // Hotkey badge
        if (hotkey) {
          const badgeFs = Math.max(7, Math.round(iconSize * 0.09))
          ctx.fillStyle = 'rgba(0,0,0,0.5)'
          const badgeText = hotkey.toUpperCase()
          ctx.font = `bold ${badgeFs}px sans-serif`
          const m = ctx.measureText(badgeText)
          const bw = m.width + 6
          const bh = badgeFs + 3
          ctx.fillRect(iconSize - bw - 3, iconSize - bh - 3, bw, bh)
          ctx.fillStyle = 'rgba(255,255,255,0.8)'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(badgeText, iconSize - bw / 2 - 3, iconSize - bh / 2 - 3)
        }

        await device.fillKeyCanvas(i, canvas)
      } catch (err) {
        console.error(`[StreamDeck] Failed to update button ${i}:`, err)
      }
    }

    // Clear remaining buttons beyond the layout
    const buttonCount = getButtonCount(device.CONTROLS)
    for (let i = buttonOrder.length; i < buttonCount; i++) {
      try { await device.fillKeyColor(i, 24, 24, 27) } catch {}
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const device = deviceRef.current
      if (device) {
        device.clearPanel().catch(() => {})
        device.close().catch(() => {})
        deviceRef.current = null
      }
    }
  }, [])

  return {
    state,
    connect,
    disconnect,
    updateButtons,
    isConnected: state.status === 'connected',
  }
}
