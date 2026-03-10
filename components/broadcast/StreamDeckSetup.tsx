'use client'

import { useState, useCallback } from 'react'
import { useBroadcast } from './BroadcastContext'
import { generateStreamDeckProfile, DEVICE_DIMS, type DeviceModel } from '@/lib/streamDeckProfile'

const DEVICE_OPTIONS: { value: DeviceModel; label: string }[] = [
  { value: 'sd', label: 'Stream Deck (5×3)' },
  { value: 'sd-xl', label: 'Stream Deck XL (8×4)' },
  { value: 'sd-mini', label: 'Stream Deck Mini (3×2)' },
  { value: 'sd-plus', label: 'Stream Deck + (4×2)' },
]

export default function StreamDeckSetup({ onClose }: { onClose: () => void }) {
  const { project, assets, session } = useBroadcast()
  const [deviceModel, setDeviceModel] = useState<DeviceModel>('sd')
  const [downloading, setDownloading] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  const dims = DEVICE_DIMS[deviceModel]
  const totalButtons = dims.cols * dims.rows
  const sorted = [...assets].sort((a, b) => a.sort_order - b.sort_order)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  const handleDownload = useCallback(async () => {
    if (!project) return
    setDownloading(true)
    try {
      const blob = await generateStreamDeckProfile({
        assets,
        projectName: project.name,
        deviceModel,
        sessionId: session?.id,
        baseUrl,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${project.name.replace(/\s+/g, '-')}.streamDeckProfile`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }, [project, assets, deviceModel, session, baseUrl])

  function getTriggerUrl(assetId: string, action: string) {
    return `${baseUrl}/api/broadcast/trigger?sid=${session?.id}&aid=${assetId}&action=${action}`
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopiedUrl(id)
    setTimeout(() => setCopiedUrl(null), 1500)
  }

  function copyAllUrls() {
    const lines: string[] = []
    for (const asset of sorted) {
      lines.push(getTriggerUrl(asset.id, 'toggle'))
      if (asset.asset_type === 'slideshow') {
        lines.push(getTriggerUrl(asset.id, 'slideshow_next'))
        lines.push(getTriggerUrl(asset.id, 'slideshow_prev'))
      }
    }
    navigator.clipboard.writeText(lines.join('\n'))
    setCopiedUrl('all')
    setTimeout(() => setCopiedUrl(null), 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg w-[720px] max-h-[85vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-100">Stream Deck Setup</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg">&times;</button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Device selector + download */}
          <div className="flex items-center gap-3">
            <select
              value={deviceModel}
              onChange={e => setDeviceModel(e.target.value as DeviceModel)}
              className="bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
            >
              {DEVICE_OPTIONS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="px-3 py-1.5 text-xs font-medium rounded bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
            >
              {downloading ? 'Generating...' : 'Download Profile'}
            </button>
          </div>

          {/* Grid preview */}
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Button Layout</p>
            <div
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${dims.cols}, 1fr)`,
                gridTemplateRows: `repeat(${dims.rows}, 1fr)`,
              }}
            >
              {Array.from({ length: totalButtons }).map((_, i) => {
                const asset = sorted[i]
                if (!asset) {
                  return (
                    <div
                      key={i}
                      className="aspect-square rounded-lg bg-zinc-800/50 border border-zinc-800"
                    />
                  )
                }
                const label = asset.hotkey_label || asset.name
                const color = asset.hotkey_color || '#3f3f46'
                return (
                  <div
                    key={asset.id}
                    className="aspect-square rounded-lg border border-white/10 flex flex-col items-center justify-center p-1 relative"
                    style={{ backgroundColor: color }}
                  >
                    <span className="text-[10px] font-bold text-white text-center leading-tight truncate w-full px-0.5">
                      {label.length > 10 ? label.slice(0, 9) + '\u2026' : label}
                    </span>
                    {asset.hotkey_key && (
                      <span className="absolute bottom-0.5 right-1 text-[8px] text-white/60 font-mono">
                        {asset.hotkey_key.toUpperCase()}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* HTTP Trigger URLs — only when live */}
          {session && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">HTTP Trigger URLs</p>
                <button
                  onClick={copyAllUrls}
                  className="px-2 py-0.5 text-[10px] font-medium rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50 transition"
                >
                  {copiedUrl === 'all' ? 'Copied!' : 'Copy All URLs'}
                </button>
              </div>
              <div className="space-y-1">
                {sorted.map(asset => {
                  const rows: { label: string; action: string; id: string }[] = [
                    { label: asset.name, action: 'toggle', id: `${asset.id}-toggle` },
                  ]
                  if (asset.asset_type === 'slideshow') {
                    rows.push(
                      { label: `${asset.name} — Next`, action: 'slideshow_next', id: `${asset.id}-next` },
                      { label: `${asset.name} — Prev`, action: 'slideshow_prev', id: `${asset.id}-prev` },
                    )
                  }
                  return rows.map(row => {
                    const url = getTriggerUrl(asset.id, row.action)
                    return (
                      <div key={row.id} className="flex items-center gap-2 bg-zinc-800/50 rounded px-2.5 py-1.5">
                        <span className="text-[10px] text-zinc-300 font-medium w-32 truncate shrink-0">{row.label}</span>
                        <span className="text-[9px] text-zinc-500 uppercase w-20 shrink-0">{row.action}</span>
                        <span className="text-[9px] text-zinc-600 font-mono truncate flex-1 min-w-0">{url}</span>
                        <button
                          onClick={() => copyToClipboard(url, row.id)}
                          className="px-1.5 py-0.5 text-[9px] rounded bg-zinc-700 text-zinc-400 hover:text-zinc-200 shrink-0 transition"
                        >
                          {copiedUrl === row.id ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    )
                  })
                })}
              </div>
            </div>
          )}

          {!session && (
            <p className="text-[10px] text-zinc-600 italic">Go live to see HTTP trigger URLs for Stream Deck / Companion integration.</p>
          )}
        </div>
      </div>
    </div>
  )
}
