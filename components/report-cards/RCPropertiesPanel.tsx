'use client'

import { useEffect } from 'react'
import { SceneElement, ReportCardBinding, ReportCardObjectType } from '@/lib/sceneTypes'
import { RC_STAT_METRICS, RC_TABLE_COLUMNS, RC_BAR_METRICS, defaultReportCardBinding } from '@/lib/reportCardDefaults'
import { TEAM_COLOR_OPTIONS, TEAM_COLORS } from '@/lib/teamColors'

// ── Google Font Loader (shared with DesignerPropertiesPanel) ──────────────

const GOOGLE_FONTS = [
  { value: '', label: 'System Default' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Oswald', label: 'Oswald' },
  { value: 'Bebas Neue', label: 'Bebas Neue' },
  { value: 'Roboto Condensed', label: 'Roboto Condensed' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'Source Code Pro', label: 'Source Code Pro' },
  { value: 'Righteous', label: 'Righteous' },
  { value: 'Anton', label: 'Anton' },
]

const _loadedFontLinks = new Set<string>()

function useGoogleFont(family: string) {
  useEffect(() => {
    if (!family || _loadedFontLinks.has(family)) return
    _loadedFontLinks.add(family)
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;500;600;700;800;900&display=swap`
    document.head.appendChild(link)
  }, [family])
}

// ── Field Helpers ─────────────────────────────────────────────────────────

interface Props {
  element: SceneElement | null
  onUpdate: (id: string, updates: Partial<SceneElement>) => void
  teamTheme: string
  onTeamThemeChange: (abbrev: string) => void
  selectedIds: Set<string>
  elements: SceneElement[]
}

function LabeledInput({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] text-zinc-500 w-16 shrink-0 text-right">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function NumberInput({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <input
      type="number"
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      min={min}
      max={max}
      step={step}
      className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:border-cyan-500/50"
    />
  )
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:border-cyan-500/50"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

// ── Title Presets & Placeholder Chips ─────────────────────────────────────

const TITLE_PRESETS = [
  { value: '', label: 'Custom' },
  { value: '{player_name} — Outing Report', label: 'Outing Report' },
  { value: '{player_name} vs {opponent}', label: 'vs Opponent' },
  { value: '{game_date} — {player_name}', label: 'Date — Player' },
  { value: '{team} Starter Card', label: 'Starter Card' },
]

const PLACEHOLDER_VARS = [
  '{player_name}', '{opponent}', '{game_date}', '{team}', '{title}',
]

// ── Main Component ─────────────────────────────────────────────────────────

export default function RCPropertiesPanel({ element, onUpdate, teamTheme, onTeamThemeChange, selectedIds, elements }: Props) {
  // Load Google Font for selected element
  useGoogleFont(element?.props?.fontFamily || '')

  if (!element) {
    return (
      <div className="w-64 shrink-0 bg-zinc-900 border-l border-zinc-800 overflow-y-auto">
        {/* Team Theme — scene-level, always visible */}
        <div className="p-3 border-b border-zinc-800 space-y-2">
          <h4 className="text-[10px] font-semibold uppercase text-zinc-500 tracking-wider">Team Theme</h4>
          <SelectInput
            value={teamTheme}
            onChange={onTeamThemeChange}
            options={TEAM_COLOR_OPTIONS}
          />
          {teamTheme && TEAM_COLORS[teamTheme] && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-4 h-4 rounded" style={{ background: TEAM_COLORS[teamTheme].primary }} />
              <span className="w-4 h-4 rounded" style={{ background: TEAM_COLORS[teamTheme].secondary }} />
              <span className="w-4 h-4 rounded" style={{ background: TEAM_COLORS[teamTheme].accent }} />
              <span className="text-[10px] text-zinc-500 ml-1">{TEAM_COLORS[teamTheme].name}</span>
            </div>
          )}
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-xs text-zinc-600">Select an element</p>
        </div>
      </div>
    )
  }

  const binding = element.reportCardBinding
  const isRC = element.type.startsWith('rc-')

  function updateProp(key: string, val: any) {
    onUpdate(element!.id, { props: { ...element!.props, [key]: val } })
  }

  function updateBinding(updates: Partial<ReportCardBinding>) {
    const current = element!.reportCardBinding || defaultReportCardBinding(element!.type as ReportCardObjectType)
    onUpdate(element!.id, { reportCardBinding: { ...current, ...updates } })
  }

  // Check if this element type supports font controls
  const supportsFonts = element.type === 'text' || element.type === 'rc-stat-box' || element.type === 'rc-table'

  return (
    <div className="w-64 shrink-0 bg-zinc-900 border-l border-zinc-800 overflow-y-auto">
      {/* Team Theme — scene-level, always at top */}
      <div className="p-3 border-b border-zinc-800 space-y-2">
        <h4 className="text-[10px] font-semibold uppercase text-zinc-500 tracking-wider">Team Theme</h4>
        <SelectInput
          value={teamTheme}
          onChange={onTeamThemeChange}
          options={TEAM_COLOR_OPTIONS}
        />
        {teamTheme && TEAM_COLORS[teamTheme] && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-4 h-4 rounded" style={{ background: TEAM_COLORS[teamTheme].primary }} />
            <span className="w-4 h-4 rounded" style={{ background: TEAM_COLORS[teamTheme].secondary }} />
            <span className="w-4 h-4 rounded" style={{ background: TEAM_COLORS[teamTheme].accent }} />
            <span className="text-[10px] text-zinc-500 ml-1">{TEAM_COLORS[teamTheme].name}</span>
          </div>
        )}
      </div>

      <div className="p-3 border-b border-zinc-800">
        <h3 className="text-xs font-semibold text-zinc-300 capitalize">{element.type.replace(/-/g, ' ')}</h3>
      </div>

      {/* Position & Size */}
      <div className="p-3 border-b border-zinc-800 space-y-2">
        <h4 className="text-[10px] font-semibold uppercase text-zinc-500 tracking-wider">Position</h4>
        <div className="grid grid-cols-2 gap-2">
          <LabeledInput label="X"><NumberInput value={element.x} onChange={v => onUpdate(element.id, { x: v })} /></LabeledInput>
          <LabeledInput label="Y"><NumberInput value={element.y} onChange={v => onUpdate(element.id, { y: v })} /></LabeledInput>
          <LabeledInput label="W"><NumberInput value={element.width} onChange={v => onUpdate(element.id, { width: Math.max(20, v) })} min={20} /></LabeledInput>
          <LabeledInput label="H"><NumberInput value={element.height} onChange={v => onUpdate(element.id, { height: Math.max(20, v) })} min={20} /></LabeledInput>
        </div>
      </div>

      {/* RC Binding Config */}
      {isRC && (
        <div className="p-3 border-b border-zinc-800 space-y-2">
          <h4 className="text-[10px] font-semibold uppercase text-zinc-500 tracking-wider">Data Binding</h4>

          {/* Stat Box: metric + format */}
          {element.type === 'rc-stat-box' && (
            <>
              <LabeledInput label="Metric">
                <SelectInput
                  value={binding?.metric || 'k'}
                  onChange={v => updateBinding({ metric: v })}
                  options={RC_STAT_METRICS.map(m => ({ value: m.key, label: m.label }))}
                />
              </LabeledInput>
              <LabeledInput label="Format">
                <SelectInput
                  value={binding?.format || '1f'}
                  onChange={v => updateBinding({ format: v })}
                  options={[
                    { value: 'raw', label: 'Raw' },
                    { value: '1f', label: '1 decimal' },
                    { value: '2f', label: '2 decimals' },
                    { value: 'integer', label: 'Integer' },
                    { value: 'percent', label: 'Percent' },
                  ]}
                />
              </LabeledInput>
              <LabeledInput label="Color">
                <input
                  type="color"
                  value={element.props.color || '#06b6d4'}
                  onChange={e => updateProp('color', e.target.value)}
                  className="w-8 h-6 cursor-pointer bg-transparent border-0"
                />
              </LabeledInput>
              <LabeledInput label="Size">
                <NumberInput value={element.props.fontSize || 44} onChange={v => updateProp('fontSize', v)} min={12} max={120} />
              </LabeledInput>
            </>
          )}

          {/* Table: column picker */}
          {element.type === 'rc-table' && (
            <div className="space-y-1">
              <p className="text-[10px] text-zinc-500">Columns (toggle to include):</p>
              {RC_TABLE_COLUMNS.map(col => {
                const currentCols: { key: string; label: string; format?: string }[] = binding?.columns || element.props.columns || []
                const active = currentCols.some(c => c.key === col.key)
                return (
                  <label key={col.key} className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer hover:text-zinc-200">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => {
                        const newCols = active
                          ? currentCols.filter(c => c.key !== col.key)
                          : [...currentCols, col]
                        updateBinding({ columns: newCols })
                        updateProp('columns', newCols)
                      }}
                      className="accent-cyan-500"
                    />
                    {col.label}
                  </label>
                )
              })}
            </div>
          )}

          {/* Bar Chart: metric picker */}
          {element.type === 'rc-bar-chart' && (
            <>
              <LabeledInput label="Metric">
                <SelectInput
                  value={binding?.metric || 'avg_velo'}
                  onChange={v => {
                    updateBinding({ metric: v })
                    updateProp('metric', v)
                  }}
                  options={RC_BAR_METRICS.map(m => ({ value: m.key, label: m.label }))}
                />
              </LabeledInput>
              <LabeledInput label="Layout">
                <SelectInput
                  value={element.props.orientation || 'horizontal'}
                  onChange={v => updateProp('orientation', v)}
                  options={[
                    { value: 'horizontal', label: 'Horizontal' },
                    { value: 'vertical', label: 'Vertical' },
                  ]}
                />
              </LabeledInput>
            </>
          )}

          {/* Zone Plot: color mode */}
          {element.type === 'rc-zone-plot' && (
            <LabeledInput label="Color">
              <SelectInput
                value={binding?.colorBy || 'pitch_type'}
                onChange={v => updateBinding({ colorBy: v as 'pitch_type' | 'metric' })}
                options={[
                  { value: 'pitch_type', label: 'By Pitch Type' },
                  { value: 'metric', label: 'By Metric' },
                ]}
              />
            </LabeledInput>
          )}

          {/* Heatmap */}
          {element.type === 'rc-heatmap' && (
            <>
              <LabeledInput label="Bins X">
                <NumberInput value={element.props.binsX || 5} onChange={v => updateProp('binsX', v)} min={3} max={10} />
              </LabeledInput>
              <LabeledInput label="Bins Y">
                <NumberInput value={element.props.binsY || 5} onChange={v => updateProp('binsY', v)} min={3} max={10} />
              </LabeledInput>
              <LabeledInput label="Low">
                <input type="color" value={element.props.colorLow || '#18181b'} onChange={e => updateProp('colorLow', e.target.value)} className="w-8 h-6 cursor-pointer bg-transparent border-0" />
              </LabeledInput>
              <LabeledInput label="High">
                <input type="color" value={element.props.colorHigh || '#ef4444'} onChange={e => updateProp('colorHigh', e.target.value)} className="w-8 h-6 cursor-pointer bg-transparent border-0" />
              </LabeledInput>
            </>
          )}

          {/* Donut */}
          {element.type === 'rc-donut-chart' && (
            <>
              <LabeledInput label="Hole">
                <NumberInput value={element.props.innerRadius ?? 0.55} onChange={v => updateProp('innerRadius', v)} min={0} max={0.9} step={0.05} />
              </LabeledInput>
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={element.props.showLabels !== false} onChange={e => updateProp('showLabels', e.target.checked)} className="accent-cyan-500" />
                Show labels
              </label>
            </>
          )}

          {/* Movement Plot */}
          {element.type === 'rc-movement-plot' && (
            <>
              <LabeledInput label="Range">
                <NumberInput value={element.props.maxRange || 24} onChange={v => updateProp('maxRange', v)} min={12} max={36} />
              </LabeledInput>
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={element.props.showSeasonShapes !== false} onChange={e => updateProp('showSeasonShapes', e.target.checked)} className="accent-cyan-500" />
                Season shapes
              </label>
            </>
          )}
        </div>
      )}

      {/* Style */}
      <div className="p-3 border-b border-zinc-800 space-y-2">
        <h4 className="text-[10px] font-semibold uppercase text-zinc-500 tracking-wider">Style</h4>
        <LabeledInput label="BG">
          <input type="color" value={element.props.bgColor || '#09090b'} onChange={e => updateProp('bgColor', e.target.value)} className="w-8 h-6 cursor-pointer bg-transparent border-0" />
        </LabeledInput>
        <LabeledInput label="Radius">
          <NumberInput value={element.props.borderRadius ?? 12} onChange={v => updateProp('borderRadius', v)} min={0} max={50} />
        </LabeledInput>
        <LabeledInput label="Opacity">
          <input
            type="range"
            min={0} max={1} step={0.05}
            value={element.opacity}
            onChange={e => onUpdate(element.id, { opacity: Number(e.target.value) })}
            className="w-full accent-cyan-500"
          />
        </LabeledInput>
      </div>

      {/* Text props for text elements */}
      {element.type === 'text' && (
        <div className="p-3 border-b border-zinc-800 space-y-2">
          <h4 className="text-[10px] font-semibold uppercase text-zinc-500 tracking-wider">Text</h4>

          {/* Title preset dropdown */}
          <LabeledInput label="Preset">
            <SelectInput
              value={TITLE_PRESETS.find(tp => tp.value === element.props.text)?.value || ''}
              onChange={v => { if (v) updateProp('text', v) }}
              options={TITLE_PRESETS}
            />
          </LabeledInput>

          <textarea
            value={element.props.text || ''}
            onChange={e => updateProp('text', e.target.value)}
            rows={3}
            className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:border-cyan-500/50 resize-none"
            placeholder="Use {player_name}, {opponent}, {game_date}, {team}"
          />

          {/* Placeholder variable chips */}
          <div className="flex flex-wrap gap-1">
            {PLACEHOLDER_VARS.map(v => (
              <button
                key={v}
                onClick={() => updateProp('text', (element.props.text || '') + v)}
                className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[9px] text-cyan-400 hover:border-cyan-500/50 hover:bg-zinc-700 transition"
              >
                {v}
              </button>
            ))}
          </div>

          <LabeledInput label="Size">
            <NumberInput value={element.props.fontSize || 36} onChange={v => updateProp('fontSize', v)} min={8} max={200} />
          </LabeledInput>
          <LabeledInput label="Color">
            <input type="color" value={element.props.color || '#ffffff'} onChange={e => updateProp('color', e.target.value)} className="w-8 h-6 cursor-pointer bg-transparent border-0" />
          </LabeledInput>
          <LabeledInput label="Align">
            <SelectInput
              value={element.props.textAlign || 'center'}
              onChange={v => updateProp('textAlign', v)}
              options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]}
            />
          </LabeledInput>
          <LabeledInput label="Weight">
            <SelectInput
              value={String(element.props.fontWeight || 700)}
              onChange={v => updateProp('fontWeight', Number(v))}
              options={[
                { value: '400', label: 'Regular' },
                { value: '500', label: 'Medium' },
                { value: '600', label: 'Semibold' },
                { value: '700', label: 'Bold' },
                { value: '800', label: 'Extrabold' },
              ]}
            />
          </LabeledInput>
        </div>
      )}

      {/* Typography — font controls for text + rc-stat-box + rc-table */}
      {supportsFonts && (
        <div className="p-3 border-b border-zinc-800 space-y-2">
          <h4 className="text-[10px] font-semibold uppercase text-zinc-500 tracking-wider">Typography</h4>
          <LabeledInput label="Font">
            <SelectInput
              value={element.props.fontFamily || ''}
              onChange={v => updateProp('fontFamily', v)}
              options={GOOGLE_FONTS}
            />
          </LabeledInput>
          <LabeledInput label="Spacing">
            <NumberInput value={element.props.letterSpacing || 0} onChange={v => updateProp('letterSpacing', v)} min={-5} max={30} step={0.5} />
          </LabeledInput>
          <LabeledInput label="Height">
            <NumberInput value={element.props.lineHeight || 1.2} onChange={v => updateProp('lineHeight', v)} min={0.5} max={3} step={0.1} />
          </LabeledInput>
          <LabeledInput label="Case">
            <SelectInput
              value={element.props.textTransform || 'none'}
              onChange={v => updateProp('textTransform', v)}
              options={[
                { value: 'none', label: 'None' },
                { value: 'uppercase', label: 'UPPERCASE' },
                { value: 'lowercase', label: 'lowercase' },
                { value: 'capitalize', label: 'Capitalize' },
              ]}
            />
          </LabeledInput>
        </div>
      )}
    </div>
  )
}
