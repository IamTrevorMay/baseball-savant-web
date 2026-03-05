'use client'

import { TemplateInputField, TemplateInputType } from '@/lib/sceneTypes'

const INPUT_TYPE_OPTIONS: { value: TemplateInputType; label: string; icon: string }[] = [
  { value: 'player', label: 'Player', icon: '\u25c9' },
  { value: 'season', label: 'Season', icon: '\u{1F4C5}' },
  { value: 'game', label: 'Game', icon: '\u26be' },
  { value: 'team', label: 'Team', icon: '\ud83c\udfc6' },
  { value: 'date-range', label: 'Date Range', icon: '\u{1F4C6}' },
  { value: 'metric', label: 'Metric', icon: '#' },
  { value: 'pitch-type', label: 'Pitch Type', icon: '\u2312' },
]

const PRESETS: { label: string; fields: Omit<TemplateInputField, 'id'>[] }[] = [
  {
    label: 'Player + Season + Game',
    fields: [
      { type: 'player', label: 'Pitcher', required: true },
      { type: 'season', label: 'Season', required: true, defaultValue: 2025 },
      { type: 'game', label: 'Game', required: true, dependsOn: 'player' },
    ],
  },
  {
    label: 'Metric + Season',
    fields: [
      { type: 'metric', label: 'Metric', required: true, defaultValue: 'avg_velo' },
      { type: 'season', label: 'Season', required: true, defaultValue: 2025 },
    ],
  },
  {
    label: 'Player + Season',
    fields: [
      { type: 'player', label: 'Player', required: true },
      { type: 'season', label: 'Season', required: true, defaultValue: 2025 },
    ],
  },
]

interface Props {
  fields: TemplateInputField[]
  onChange: (fields: TemplateInputField[]) => void
}

function genId() {
  return Math.random().toString(36).slice(2, 8)
}

export default function InputFieldEditor({ fields, onChange }: Props) {
  function addField(type: TemplateInputType) {
    const opt = INPUT_TYPE_OPTIONS.find(o => o.value === type)!
    onChange([...fields, {
      id: genId(),
      type,
      label: opt.label,
      required: true,
    }])
  }

  function removeField(id: string) {
    onChange(fields.filter(f => f.id !== id))
  }

  function updateField(id: string, updates: Partial<TemplateInputField>) {
    onChange(fields.map(f => f.id === id ? { ...f, ...updates } : f))
  }

  function applyPreset(preset: typeof PRESETS[0]) {
    const newFields = preset.fields.map(f => ({
      ...f,
      id: genId(),
    }))
    onChange(newFields)
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="text-[11px] text-zinc-400 uppercase tracking-wider mb-2 block font-medium">Presets</label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(preset => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset)}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-300 hover:border-cyan-600/40 hover:text-white transition"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[11px] text-zinc-400 uppercase tracking-wider mb-2 block font-medium">
          Input Fields ({fields.length})
        </label>

        {fields.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-zinc-700 rounded-lg">
            <p className="text-[11px] text-zinc-600">No input fields defined yet</p>
            <p className="text-[10px] text-zinc-700 mt-1">Choose a preset above or add fields manually below</p>
          </div>
        ) : (
          <div className="space-y-2">
            {fields.map(field => (
              <div key={field.id} className="bg-zinc-800/60 border border-zinc-700/60 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500 uppercase font-medium w-16 shrink-0">{field.type}</span>
                  <input
                    value={field.label}
                    onChange={e => updateField(field.id, { label: e.target.value })}
                    className="flex-1 h-7 px-2 bg-zinc-700/50 border border-zinc-600/50 rounded text-[11px] text-white focus:outline-none focus:border-cyan-500/50"
                  />
                  <label className="flex items-center gap-1 text-[10px] text-zinc-500 shrink-0">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={e => updateField(field.id, { required: e.target.checked })}
                      className="accent-cyan-500"
                    />
                    Req
                  </label>
                  <button
                    onClick={() => removeField(field.id)}
                    className="text-zinc-600 hover:text-red-400 transition text-xs shrink-0"
                  >
                    {'\u2715'}
                  </button>
                </div>
                {field.dependsOn && (
                  <div className="text-[9px] text-zinc-600">
                    Depends on: <span className="text-zinc-400">{fields.find(f => f.id === field.dependsOn)?.label || field.dependsOn}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="text-[11px] text-zinc-400 uppercase tracking-wider mb-2 block font-medium">Add Field</label>
        <div className="flex flex-wrap gap-1.5">
          {INPUT_TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => addField(opt.value)}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-400 hover:border-cyan-600/40 hover:text-white transition flex items-center gap-1.5"
            >
              <span className="text-[10px]">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {fields.length > 0 && (
        <div className="mt-3 p-3 bg-zinc-800/30 border border-zinc-700/40 rounded-lg">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-1.5">Available Tokens</div>
          <div className="flex flex-wrap gap-1">
            {fields.map(f => (
              <code key={f.id} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/60 text-cyan-400 border border-zinc-600/40">
                {`{${f.id}}`}
              </code>
            ))}
            {fields.some(f => f.type === 'player') && (
              <code className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/60 text-emerald-400 border border-zinc-600/40">
                {'{player_name}'}
              </code>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
