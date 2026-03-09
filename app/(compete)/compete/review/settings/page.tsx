'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { DEFAULT_CONFIG, ScoringConfig } from '@/lib/compete/cqrScoring'

const STORAGE_KEY = 'cqr-scoring-config'

function loadConfig(): ScoringConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CONFIG
    return JSON.parse(raw) as ScoringConfig
  } catch {
    return DEFAULT_CONFIG
  }
}

export default function CQRSettingsPage() {
  const [config, setConfig] = useState<ScoringConfig>(DEFAULT_CONFIG)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setConfig(loadConfig())
  }, [])

  const isDefault = JSON.stringify(config) === JSON.stringify(DEFAULT_CONFIG)

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG)
    localStorage.removeItem(STORAGE_KEY)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const updateTier = (index: number, field: 'maxEdge' | 'score', value: number) => {
    const tiers = [...config.tiers]
    tiers[index] = { ...tiers[index], [field]: value }
    setConfig({ ...config, tiers })
  }

  const addTier = () => {
    const last = config.tiers[config.tiers.length - 1]
    setConfig({
      ...config,
      tiers: [...config.tiers, { maxEdge: (last?.maxEdge ?? 9) + 2, score: 0 }],
    })
  }

  const removeTier = (index: number) => {
    if (config.tiers.length <= 1) return
    setConfig({ ...config, tiers: config.tiers.filter((_, i) => i !== index) })
  }

  return (
    <div className="max-w-2xl mx-auto p-6 mt-6 space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-4 border-b border-zinc-800 pb-2">
        <Link href="/compete/review" className="text-zinc-500 hover:text-zinc-300 pb-2">Review</Link>
        <Link href="/compete/review/stats" className="text-zinc-500 hover:text-zinc-300 pb-2">Stats</Link>
        <span className="text-white font-medium border-b-2 border-amber-500 pb-2">Settings</span>
      </div>

      <h1 className="text-xl font-bold text-white">CQR Scoring Settings</h1>
      <p className="text-sm text-zinc-400">
        Configure scoring thresholds and zone rules. Settings are saved to your browser.
      </p>

      {/* Scoring Tiers */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-medium text-zinc-400">Scoring Tiers</h2>
        <p className="text-xs text-zinc-500">Edge distance thresholds (in inches) and their scores. Pitches are evaluated against tiers in ascending order.</p>

        <div className="space-y-2">
          {config.tiers.map((tier, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-2">
                <label className="text-xs text-zinc-500 w-20">Edge &lt;</label>
                <input
                  type="number"
                  value={tier.maxEdge}
                  onChange={e => updateTier(i, 'maxEdge', Number(e.target.value))}
                  step={0.5}
                  min={0}
                  className="w-20 bg-zinc-800 border border-zinc-700 text-white rounded px-2 py-1.5 text-sm font-mono"
                />
                <span className="text-xs text-zinc-500">&quot;</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-500">Score</label>
                <input
                  type="number"
                  value={tier.score}
                  onChange={e => updateTier(i, 'score', Number(e.target.value))}
                  step={5}
                  min={0}
                  max={100}
                  className="w-20 bg-zinc-800 border border-zinc-700 text-white rounded px-2 py-1.5 text-sm font-mono"
                />
              </div>
              <button
                onClick={() => removeTier(i)}
                disabled={config.tiers.length <= 1}
                className="text-zinc-600 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed text-sm px-1 transition"
                title="Remove tier"
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={addTier}
          className="text-xs text-amber-500 hover:text-amber-400 transition"
        >
          + Add tier
        </button>
      </div>

      {/* Zone Rules */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-medium text-zinc-400">Zone Rules</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Baseball Radius (inches)</label>
            <input
              type="number"
              value={config.baseballRadius}
              onChange={e => setConfig({ ...config, baseballRadius: Number(e.target.value) })}
              step={0.05}
              min={0}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-2 text-sm font-mono"
            />
            <p className="text-xs text-zinc-600 mt-1">Subtracted from center distance to get edge distance</p>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Center Box Half-Width (inches)</label>
            <input
              type="number"
              value={config.centerBoxHalf}
              onChange={e => setConfig({ ...config, centerBoxHalf: Number(e.target.value) })}
              step={0.5}
              min={0}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-2 text-sm font-mono"
            />
            <p className="text-xs text-zinc-600 mt-1">Pitches in center box ({config.centerBoxHalf * 2}&quot;&times;{config.centerBoxHalf * 2}&quot;) score 0</p>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Outside Zone Penalty (inches)</label>
            <input
              type="number"
              value={config.outsideZoneMax}
              onChange={e => setConfig({ ...config, outsideZoneMax: Number(e.target.value) })}
              step={0.5}
              min={0}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-2 text-sm font-mono"
            />
            <p className="text-xs text-zinc-600 mt-1">Pitches &gt;{config.outsideZoneMax}&quot; outside zone score 0</p>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">High + Swung At Exemption</label>
            <button
              onClick={() => setConfig({ ...config, highSwingExempt: !config.highSwingExempt })}
              className={`mt-1 px-4 py-2 rounded text-sm font-medium transition ${
                config.highSwingExempt
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                  : 'bg-zinc-800 border border-zinc-700 text-zinc-400'
              }`}
            >
              {config.highSwingExempt ? 'Enabled' : 'Disabled'}
            </button>
            <p className="text-xs text-zinc-600 mt-1">Bypass outside-zone penalty if pitch is above zone and swung at</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition"
        >
          Save
        </button>
        <button
          onClick={handleReset}
          disabled={isDefault}
          className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 rounded-lg text-sm transition"
        >
          Reset to Defaults
        </button>
        {saved && <span className="text-emerald-400 text-sm">Saved</span>}
        {!isDefault && !saved && <span className="text-amber-400 text-xs">Custom config active</span>}
      </div>
    </div>
  )
}
