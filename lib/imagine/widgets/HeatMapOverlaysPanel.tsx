'use client'

/**
 * HeatMapOverlaysPanel — right-panel UI for the Heat Map Overlays widget.
 *
 * Tab strip across the top: Overlay 1 / 2 / 3. Overlay 1 is always on;
 * 2 and 3 are togglable. Each tab edits its own OverlayConfig:
 *   - Player A: search + role (pitcher | hitter) + metric
 *   - Player B: search + role + metric
 *   - Color mode (rainbow | hot/cold)
 *   - Custom caption title/subtitle
 *   - Shared filter set (full Reports catalog)
 */
import { useState } from 'react'
import FilterEngine from '@/components/FilterEngine'
import PlayerSearchField from '@/components/imagine/PlayerSearchField'
import type { WidgetPanelProps } from '@/lib/imagine/types'
import type {
  HeatMapOverlaysFilters, OverlayConfig, OverlayPlayer, OverlayRole, OverlayColorMode,
} from '@/lib/imagine/widgets/heatMapOverlays'
import { HEATMAP_OVERLAY_METRIC_OPTIONS } from '@/lib/imagine/widgets/heatMapOverlays'
import type { HeatmapMetricKey } from '@/lib/imagine/heatmapMetrics'

const TEAMS = ['AZ','ATL','BAL','BOS','CHC','CWS','CIN','CLE','COL','DET','HOU','KC','LAA','LAD','MIA','MIL','MIN','NYM','NYY','OAK','PHI','PIT','SD','SF','SEA','STL','TB','TEX','TOR','WSH']

const STATIC_OPTIONS: Record<string, string[]> = {
  game_year: ['2026','2025','2024','2023','2022','2021','2020','2019','2018','2017','2016','2015'],
  pitch_name: ['4-Seam Fastball','Sinker','Cutter','Changeup','Slider','Sweeper','Curveball','Knuckle Curve','Split-Finger','Slurve','Knuckeball','Eephus','Slow Curve'],
  pitch_type: ['FF','SI','FC','CH','SL','ST','CU','KC','FS','SV','KN','EP','CS'],
  stand: ['L','R'], p_throws: ['L','R'],
  balls: ['0','1','2','3'], strikes: ['0','1','2'],
  outs_when_up: ['0','1','2'], inning: Array.from({ length: 18 }, (_, i) => String(i + 1)),
  bb_type: ['ground_ball','fly_ball','line_drive','popup'],
  home_team: TEAMS, away_team: TEAMS, vs_team: TEAMS,
  zone: Array.from({ length: 14 }, (_, i) => String(i + 1)),
  game_type: ['R','F','D','L','W','S','E','A'],
  type: ['B','S','X'],
  inning_topbot: ['Top','Bot'],
}

const labelCls = 'block text-[10px] text-zinc-500 uppercase tracking-wider mb-1'
const inputCls = 'w-full bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200 px-2 py-1.5 focus:outline-none focus:border-emerald-500'

export default function HeatMapOverlaysPanel({
  filters, onChange, size, onSizeChange, sizePresets, onExport, exportDisabled, exporting,
}: WidgetPanelProps<HeatMapOverlaysFilters>) {
  const [activeTab, setActiveTab] = useState(0)

  const updateOverlay = (i: number, partial: Partial<OverlayConfig>) => {
    onChange(prev => ({
      ...prev,
      overlays: prev.overlays.map((c, idx) => idx === i ? { ...c, ...partial } : c),
    }))
  }

  const toggleOverlay = (i: number) => {
    const willActivate = !filters.overlays[i].active
    updateOverlay(i, { active: willActivate })
    if (willActivate) setActiveTab(i)
  }

  const c = filters.overlays[activeTab]

  return (
    <div className="flex flex-col h-full">
      {/* Card title */}
      <div className="px-4 pt-4 pb-3 border-b border-zinc-800">
        <span className={labelCls}>Card Title (optional)</span>
        <input
          type="text"
          className={inputCls}
          value={filters.title || ''}
          placeholder="Auto-generated"
          onChange={(e) => onChange(prev => ({ ...prev, title: e.target.value }))}
        />
      </div>

      {/* Tab strip */}
      <div className="border-b border-zinc-800 px-3 pt-3 pb-3">
        <div className="grid grid-cols-3 gap-1">
          {filters.overlays.map((cfg, i) => {
            const isSelected = activeTab === i
            const isOn = cfg.active
            const baseCls = isOn
              ? (isSelected
                ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-200'
                : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-600')
              : 'bg-zinc-900/40 border-zinc-800 text-zinc-600 hover:bg-zinc-900 hover:text-zinc-400'
            return (
              <button
                key={i}
                onClick={() => {
                  if (i === 0) { setActiveTab(0); return }
                  if (cfg.active) setActiveTab(i)
                  else toggleOverlay(i)
                }}
                className={`relative px-2 py-2 rounded text-[11px] font-semibold transition border ${baseCls}`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  {!isOn && i > 0 && <span className="text-[14px] leading-none">+</span>}
                  <span>Overlay {i + 1}</span>
                </div>
                {isOn && i > 0 && (
                  <span
                    onClick={(e) => { e.stopPropagation(); toggleOverlay(i) }}
                    className="absolute top-0.5 right-1 text-[10px] text-zinc-500 hover:text-red-400 cursor-pointer"
                    title="Disable this overlay"
                  >&#x2715;</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Active tab editor */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        {!c.active ? (
          <div className="text-[11px] text-zinc-600 px-2 py-6 text-center">
            Click <span className="text-zinc-400">+ Overlay {activeTab + 1}</span> to enable.
          </div>
        ) : (
          <OverlayEditor
            config={c}
            onChange={partial => updateOverlay(activeTab, partial)}
          />
        )}
      </div>

      {/* Output / Export pinned bottom */}
      <div className="border-t border-zinc-800 p-3 space-y-2.5">
        <div>
          <label className={labelCls}>Size / Aspect</label>
          <select
            className={inputCls}
            value={`${size.width}x${size.height}`}
            onChange={(e) => {
              const found = sizePresets.find(p => `${p.width}x${p.height}` === e.target.value)
              if (found) onSizeChange(found)
            }}
          >
            {sizePresets.map(p => (
              <option key={`${p.width}x${p.height}`} value={`${p.width}x${p.height}`}>{p.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={onExport}
          disabled={exportDisabled}
          className="w-full px-4 py-2 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {exporting ? 'Exporting…' : 'Export PNG'}
        </button>
      </div>
    </div>
  )
}

/* ── OverlayEditor ─────────────────────────────────────────────────────── */

function OverlayEditor({ config, onChange }: { config: OverlayConfig; onChange: (partial: Partial<OverlayConfig>) => void }) {
  const setSide = (key: 'sideA' | 'sideB', partial: Partial<OverlayPlayer>) => {
    onChange({ [key]: { ...config[key], ...partial } } as Partial<OverlayConfig>)
  }

  return (
    <div className="space-y-4">
      {/* Player A */}
      <PlayerSection
        title="Player A"
        side={config.sideA}
        onChange={(partial) => setSide('sideA', partial)}
      />

      {/* Player B */}
      <PlayerSection
        title="Player B"
        side={config.sideB}
        onChange={(partial) => setSide('sideB', partial)}
      />

      {/* Color mode */}
      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Heatmap</h3>
        <div>
          <span className={labelCls}>Color Mode</span>
          <div className="grid grid-cols-2 gap-1">
            <SegBtn
              active={(config.colorMode || 'rainbow') === 'rainbow'}
              onClick={() => onChange({ colorMode: 'rainbow' as OverlayColorMode })}
            >Rainbow</SegBtn>
            <SegBtn
              active={config.colorMode === 'hotcold'}
              onClick={() => onChange({ colorMode: 'hotcold' as OverlayColorMode })}
            >Hot/Cold</SegBtn>
          </div>
        </div>
      </section>

      {/* Caption overrides */}
      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Caption</h3>
        <div className="space-y-2">
          <div>
            <span className={labelCls}>Title (optional)</span>
            <input
              type="text"
              className={inputCls}
              value={config.customTitle}
              placeholder="Auto"
              onChange={(e) => onChange({ customTitle: e.target.value })}
            />
          </div>
          <div>
            <span className={labelCls}>Subtitle (optional)</span>
            <input
              type="text"
              className={inputCls}
              value={config.customSubtitle}
              placeholder="Auto"
              onChange={(e) => onChange({ customSubtitle: e.target.value })}
            />
          </div>
        </div>
      </section>

      {/* Shared filters — applied identically to both sides */}
      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Shared Filters</h3>
        <div className="text-[10px] text-zinc-600 mb-2">Applied to both Player A and Player B before overlap is computed.</div>
        <FilterEngine
          activeFilters={config.filters}
          onFiltersChange={(filters) => onChange({ filters })}
          optionsCache={STATIC_OPTIONS}
        />
      </section>
    </div>
  )
}

function PlayerSection({
  title, side, onChange,
}: {
  title: string
  side: OverlayPlayer
  onChange: (partial: Partial<OverlayPlayer>) => void
}) {
  return (
    <section>
      <h3 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">{title}</h3>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1">
          <SegBtn
            active={side.role === 'pitcher'}
            // Switching role clears the player so we don't carry a hitter id over to the pitcher field.
            onClick={() => onChange({ role: 'pitcher' as OverlayRole, playerId: null, playerName: '' })}
          >Pitcher</SegBtn>
          <SegBtn
            active={side.role === 'hitter'}
            onClick={() => onChange({ role: 'hitter' as OverlayRole, playerId: null, playerName: '' })}
          >Hitter</SegBtn>
        </div>
        <PlayerSearchField
          value={{ playerId: side.playerId, playerName: side.playerName }}
          playerType={side.role === 'hitter' ? 'batter' : 'pitcher'}
          placeholder={`Search ${side.role}s...`}
          onChange={(v) => onChange({ playerId: v.playerId, playerName: v.playerName })}
        />
        <div>
          <span className={labelCls}>Metric</span>
          <select
            className={inputCls}
            value={side.metric}
            onChange={(e) => onChange({ metric: e.target.value as HeatmapMetricKey })}
          >
            {HEATMAP_OVERLAY_METRIC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
    </section>
  )
}

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1.5 rounded text-xs font-medium transition border ${
        active
          ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-200'
          : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
      }`}
    >{children}</button>
  )
}
