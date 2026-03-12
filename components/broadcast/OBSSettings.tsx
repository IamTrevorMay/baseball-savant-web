'use client'

import { useState, useEffect } from 'react'
import { useBroadcast } from './BroadcastContext'

export default function OBSSettings({ onClose }: { onClose: () => void }) {
  const {
    project, session, assets, updateProjectSettings,
    obsState, obsConnect, obsDisconnect, obsSetupScene, isOBSConnected,
  } = useBroadcast()

  const savedConfig = project?.settings?.obsConfig
  const [host, setHost] = useState(savedConfig?.host || '127.0.0.1')
  const [port, setPort] = useState(String(savedConfig?.port || 4455))
  const [password, setPassword] = useState(savedConfig?.password || '')
  const [mediaDir, setMediaDir] = useState(project?.settings?.obsMediaDir || '')
  const [connecting, setConnecting] = useState(false)

  const overlayUrl = session
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/overlay/${session.id}`
    : null
  const [copiedUrl, setCopiedUrl] = useState(false)

  function copyOverlayUrl() {
    if (!overlayUrl) return
    navigator.clipboard.writeText(overlayUrl)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  async function handleConnect() {
    setConnecting(true)
    const config = { host, port: Number(port), password }
    await obsConnect(config)
    // Save config to project settings
    updateProjectSettings({ obsConfig: config })
    setConnecting(false)
  }

  async function handleDisconnect() {
    await obsDisconnect()
  }

  function handleSaveMediaDir() {
    updateProjectSettings({ obsMediaDir: mediaDir.trim() })
  }

  async function handleSetupScene() {
    if (!overlayUrl) return
    await obsSetupScene()
  }

  // Video/ad assets that need local files
  const mediaAssets = assets.filter(a => a.asset_type === 'video' || a.asset_type === 'advertisement')

  function resolveFilePath(asset: typeof mediaAssets[number]): string | null {
    const filename = asset.ad_config?.source_filename || asset.source_filename
    if (!filename) return null
    const dir = mediaDir.trim() || project?.settings?.obsMediaDir || ''
    if (!dir) return null
    return `${dir.replace(/\/$/, '')}/${filename}`
  }

  const statusColor =
    obsState.status === 'connected' ? '#10b981' :
    obsState.status === 'connecting' ? '#eab308' :
    obsState.status === 'error' ? '#ef4444' :
    '#71717a'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[540px] max-h-[80vh] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-white">OBS WebSocket</h2>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
              <span className="text-[10px] text-zinc-400 capitalize">{obsState.status}</span>
              {obsState.obsVersion && (
                <span className="text-[10px] text-zinc-600 ml-1">v{obsState.obsVersion}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* A) Connection */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">Connection</h3>
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Host</label>
                <input
                  value={host}
                  onChange={e => setHost(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 outline-none focus:border-zinc-600"
                  placeholder="127.0.0.1"
                  disabled={isOBSConnected}
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Port</label>
                <input
                  value={port}
                  onChange={e => setPort(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 outline-none focus:border-zinc-600"
                  placeholder="4455"
                  disabled={isOBSConnected}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 outline-none focus:border-zinc-600"
                placeholder="(optional)"
                disabled={isOBSConnected}
              />
            </div>

            {obsState.error && (
              <div className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2.5 py-1.5">
                {obsState.error}
              </div>
            )}

            <div className="flex gap-2">
              {!isOBSConnected ? (
                <button
                  onClick={handleConnect}
                  disabled={connecting || obsState.status === 'connecting'}
                  className="px-4 py-1.5 text-[11px] font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded transition"
                >
                  {connecting ? 'Connecting...' : 'Connect'}
                </button>
              ) : (
                <button
                  onClick={handleDisconnect}
                  className="px-4 py-1.5 text-[11px] font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded transition"
                >
                  Disconnect
                </button>
              )}
            </div>
          </section>

          {/* B) Scene Setup — visible when connected */}
          {isOBSConnected && (
            <section className="space-y-3">
              <h3 className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">Scene Setup</h3>
              <div className="text-[10px] text-zinc-500">
                Current scene: <span className="text-zinc-300 font-medium">{obsState.currentScene || 'None'}</span>
              </div>

              {overlayUrl ? (
                <div className="space-y-2">
                  <button
                    onClick={handleSetupScene}
                    className="px-4 py-1.5 text-[11px] font-medium bg-blue-600/80 hover:bg-blue-600 text-white rounded transition"
                  >
                    Auto-Setup Scene
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-2.5 py-1.5 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-400 font-mono truncate">
                      {overlayUrl}
                    </div>
                    <button
                      onClick={copyOverlayUrl}
                      className="px-2 py-1.5 text-[10px] font-medium bg-zinc-800 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-700 transition shrink-0"
                    >
                      {copiedUrl ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-zinc-600">Go live first to set up the OBS scene with your overlay URL.</div>
              )}
            </section>
          )}

          {/* C) Media Directory */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">Media Directory</h3>
            <p className="text-[10px] text-zinc-500">
              Local folder where your video and ad files are stored. OBS will play these natively.
            </p>
            <div className="flex gap-2">
              <input
                value={mediaDir}
                onChange={e => setMediaDir(e.target.value)}
                onBlur={handleSaveMediaDir}
                className="flex-1 px-2.5 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 outline-none focus:border-zinc-600 font-mono"
                placeholder="/Users/you/broadcast-media/"
              />
              <button
                onClick={handleSaveMediaDir}
                className="px-3 py-1.5 text-[10px] font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded transition shrink-0"
              >
                Save
              </button>
            </div>

            {/* Media asset file mapping */}
            {mediaAssets.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] text-zinc-500 font-medium">Asset File Mapping</div>
                {mediaAssets.map(asset => {
                  const filename = asset.ad_config?.source_filename || asset.source_filename
                  const resolved = resolveFilePath(asset)
                  return (
                    <div key={asset.id} className="flex items-center gap-2 text-[10px] py-1 px-2 bg-zinc-800/50 rounded">
                      <span className={`w-4 text-center ${asset.asset_type === 'advertisement' ? 'text-emerald-400' : 'text-blue-400'}`}>
                        {asset.asset_type === 'advertisement' ? 'A' : 'V'}
                      </span>
                      <span className="text-zinc-300 truncate flex-1">{asset.name}</span>
                      {filename ? (
                        <>
                          <span className="text-zinc-600 font-mono truncate max-w-[200px]">{filename}</span>
                          <span className="text-emerald-400 shrink-0" title={resolved || ''}>&#10003;</span>
                        </>
                      ) : (
                        <span className="text-amber-400 shrink-0" title="No source_filename set">&#9888;</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
