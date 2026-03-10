'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useBroadcast } from './BroadcastContext'
import { getTransitions } from '@/lib/transitions'
import TemplateDataPanel from './TemplateDataPanel'
import SlideshowEditor from './SlideshowEditor'
import Link from 'next/link'

export default function AssetProperties() {
  const { assets, selectedAssetId, updateAsset, previewAsset, previewingAssetId } = useBroadcast()
  const [recordingHotkey, setRecordingHotkey] = useState(false)
  const asset = assets.find(a => a.id === selectedAssetId)

  if (!asset) {
    return (
      <div className="w-72 bg-zinc-900 border-l border-zinc-800 flex items-center justify-center">
        <p className="text-xs text-zinc-600">Select an asset to edit properties</p>
      </div>
    )
  }

  function handleChange(field: string, value: any) {
    if (!asset) return
    updateAsset(asset.id, { [field]: value } as any)
    // Persist to DB
    fetch('/api/broadcast/assets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: asset.id, [field]: value }),
    }).catch(console.error)
  }

  function handleTransitionChange(type: 'enter_transition' | 'exit_transition', presetId: string) {
    if (!asset) return
    const config = presetId ? { presetId, durationFrames: asset[type]?.durationFrames || 15 } : null
    handleChange(type, config)
  }

  function handleTransitionDuration(type: 'enter_transition' | 'exit_transition', frames: number) {
    if (!asset) return
    const existing = asset[type]
    if (!existing) return
    handleChange(type, { ...existing, durationFrames: frames })
  }

  const enterTransitions = getTransitions('enter')
  const exitTransitions = getTransitions('exit')

  return (
    <div className="w-72 bg-zinc-900 border-l border-zinc-800 flex flex-col h-full overflow-y-auto">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Properties</h3>
        <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{asset.name}</p>
      </div>

      {/* Slideshow Editor (if this is a slideshow asset) */}
      {asset.asset_type === 'slideshow' && <SlideshowEditor asset={asset} />}

      {/* Template Data Panel (if this is a template asset) */}
      {asset.template_id && <TemplateDataPanel asset={asset} />}

      <div className="px-4 py-3 space-y-4">
        {/* Name */}
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Name</label>
          <input
            value={asset.name}
            onChange={e => handleChange('name', e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white"
          />
        </div>

        {/* Position */}
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Position</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div>
              <label className="text-[9px] text-zinc-600">X</label>
              <input
                type="number"
                value={asset.canvas_x}
                onChange={e => handleChange('canvas_x', parseInt(e.target.value) || 0)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[9px] text-zinc-600">Y</label>
              <input
                type="number"
                value={asset.canvas_y}
                onChange={e => handleChange('canvas_y', parseInt(e.target.value) || 0)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
              />
            </div>
          </div>
        </div>

        {/* Size */}
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Size</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div>
              <label className="text-[9px] text-zinc-600">W</label>
              <input
                type="number"
                value={asset.canvas_width}
                onChange={e => handleChange('canvas_width', parseInt(e.target.value) || 100)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[9px] text-zinc-600">H</label>
              <input
                type="number"
                value={asset.canvas_height}
                onChange={e => handleChange('canvas_height', parseInt(e.target.value) || 100)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
              />
            </div>
          </div>
        </div>

        {/* Layer */}
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Layer</label>
          <input
            type="number"
            value={asset.layer}
            onChange={e => handleChange('layer', parseInt(e.target.value) || 0)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white"
          />
        </div>

        {/* Opacity */}
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Opacity</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((asset.opacity ?? 1) * 100)}
              onChange={e => handleChange('opacity', parseInt(e.target.value) / 100)}
              className="flex-1 h-1.5 accent-red-400"
            />
            <span className="text-[10px] text-zinc-400 w-8 text-right">{Math.round((asset.opacity ?? 1) * 100)}%</span>
          </div>
        </div>

        {/* Enter Transition */}
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Enter Transition</label>
          <select
            value={asset.enter_transition?.presetId || ''}
            onChange={e => handleTransitionChange('enter_transition', e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white"
          >
            <option value="">None</option>
            {enterTransitions.map(t => (
              <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
            ))}
          </select>
          {asset.enter_transition && (
            <div className="mt-1.5">
              <label className="text-[9px] text-zinc-600">Duration (frames)</label>
              <input
                type="number"
                min={1}
                max={120}
                value={asset.enter_transition.durationFrames}
                onChange={e => handleTransitionDuration('enter_transition', parseInt(e.target.value) || 15)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
              />
            </div>
          )}
        </div>

        {/* Exit Transition */}
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Exit Transition</label>
          <select
            value={asset.exit_transition?.presetId || ''}
            onChange={e => handleTransitionChange('exit_transition', e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white"
          >
            <option value="">None</option>
            {exitTransitions.map(t => (
              <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
            ))}
          </select>
          {asset.exit_transition && (
            <div className="mt-1.5">
              <label className="text-[9px] text-zinc-600">Duration (frames)</label>
              <input
                type="number"
                min={1}
                max={120}
                value={asset.exit_transition.durationFrames}
                onChange={e => handleTransitionDuration('exit_transition', parseInt(e.target.value) || 15)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
              />
            </div>
          )}
        </div>

        {/* Preview Transition */}
        {(asset.enter_transition || asset.exit_transition) && (
          <button
            onClick={() => previewAsset(asset.id)}
            disabled={!!previewingAssetId}
            className="w-full px-3 py-1.5 text-[11px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded hover:bg-purple-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {previewingAssetId === asset.id || previewingAssetId === `${asset.id}:exit` ? 'Previewing...' : 'Preview Transition'}
          </button>
        )}

        {/* Trigger Mode */}
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Trigger</label>
          <select
            value={asset.trigger_mode || 'toggle'}
            onChange={e => handleChange('trigger_mode', e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white"
          >
            <option value="toggle">Toggle</option>
            <option value="flash">Flash</option>
            <option value="show">Show Only</option>
            <option value="hide">Hide Only</option>
          </select>
          {asset.trigger_mode === 'flash' && (
            <div className="mt-1.5">
              <label className="text-[9px] text-zinc-600">Duration (seconds)</label>
              <input
                type="number"
                min={0.5}
                max={60}
                step={0.5}
                value={asset.trigger_duration ?? 3}
                onChange={e => handleChange('trigger_duration', parseFloat(e.target.value) || 3)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
              />
            </div>
          )}
        </div>

        {/* Hotkey Config */}
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Hotkey</label>
          <div className="space-y-1.5 mt-1">
            <div>
              <label className="text-[9px] text-zinc-600">Key</label>
              <button
                onClick={() => setRecordingHotkey(true)}
                onKeyDown={e => {
                  if (!recordingHotkey) return
                  e.preventDefault()
                  e.stopPropagation()
                  const key = e.key.length === 1 ? e.key.toLowerCase() : null
                  if (key) handleChange('hotkey_key', key)
                  setRecordingHotkey(false)
                }}
                onBlur={() => setRecordingHotkey(false)}
                className={`w-full bg-zinc-800 border rounded px-2 py-1 text-xs text-left transition ${
                  recordingHotkey ? 'border-red-400 text-red-400' : 'border-zinc-700 text-white'
                }`}
              >
                {recordingHotkey ? 'Press a key...' : asset.hotkey_key ? asset.hotkey_key.toUpperCase() : 'None'}
              </button>
              {asset.hotkey_key && (
                <button
                  onClick={() => handleChange('hotkey_key', null)}
                  className="text-[9px] text-zinc-600 hover:text-zinc-400 mt-0.5"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-zinc-600">Label</label>
                <input
                  value={asset.hotkey_label}
                  onChange={e => handleChange('hotkey_label', e.target.value)}
                  placeholder={asset.name}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[9px] text-zinc-600">Color</label>
                <input
                  type="color"
                  value={asset.hotkey_color}
                  onChange={e => handleChange('hotkey_color', e.target.value)}
                  className="w-full h-7 bg-zinc-800 border border-zinc-700 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Edit links */}
        {asset.asset_type === 'scene' && asset.template_id && (
          <Link
            href={`/visualize/template-builder?edit=${asset.template_id}`}
            target="_blank"
            className="block text-center px-3 py-2 text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/20 transition"
          >
            Edit Template
          </Link>
        )}
        {asset.asset_type === 'scene' && !asset.template_id && (
          <Link
            href="/visualize"
            className="block text-center px-3 py-2 text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 rounded hover:bg-zinc-700 transition"
          >
            Edit in Scene Composer
          </Link>
        )}
      </div>
    </div>
  )
}
