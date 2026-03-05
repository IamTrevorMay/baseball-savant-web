'use client'

import { SCENE_PRESETS } from '@/lib/sceneTypes'

interface SetupData {
  name: string
  description: string
  icon: string
  width: number
  height: number
  background: string
}

interface Props {
  data: SetupData
  onChange: (updates: Partial<SetupData>) => void
}

const ICON_OPTIONS = [
  '\u26a1', '\u26be', '\ud83c\udfcf', '\ud83c\udfc6', '\ud83d\udcfa', '\ud83d\udcf1',
  '\u2605', '\u25ce', '\u2726', '\u{1F3AF}', '\u{1F4CA}', '\u{1F5BC}',
]

export default function TemplateBuilderSetup({ data, onChange }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <label className="text-[11px] text-zinc-400 uppercase tracking-wider mb-1.5 block font-medium">Template Name</label>
        <input
          value={data.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="My Custom Template"
          className="w-full h-9 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
        />
      </div>

      <div>
        <label className="text-[11px] text-zinc-400 uppercase tracking-wider mb-1.5 block font-medium">Description</label>
        <textarea
          value={data.description}
          onChange={e => onChange({ description: e.target.value })}
          placeholder="What this template is for..."
          rows={2}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50 resize-none"
        />
      </div>

      <div>
        <label className="text-[11px] text-zinc-400 uppercase tracking-wider mb-1.5 block font-medium">Icon</label>
        <div className="flex flex-wrap gap-1.5">
          {ICON_OPTIONS.map(icon => (
            <button
              key={icon}
              onClick={() => onChange({ icon })}
              className={`w-9 h-9 rounded-lg border text-lg flex items-center justify-center transition ${
                data.icon === icon
                  ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-white'
              }`}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[11px] text-zinc-400 uppercase tracking-wider mb-1.5 block font-medium">Canvas Size</label>
        <select
          value={`${data.width}x${data.height}`}
          onChange={e => {
            const [w, h] = e.target.value.split('x').map(Number)
            onChange({ width: w, height: h })
          }}
          className="w-full h-9 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
        >
          {SCENE_PRESETS.map(p => (
            <option key={`${p.w}x${p.h}`} value={`${p.w}x${p.h}`}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-[11px] text-zinc-400 uppercase tracking-wider mb-1.5 block font-medium">Background Color</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={data.background}
            onChange={e => onChange({ background: e.target.value })}
            className="w-9 h-9 rounded-lg cursor-pointer bg-transparent border border-zinc-700"
          />
          <input
            value={data.background}
            onChange={e => onChange({ background: e.target.value })}
            className="flex-1 h-9 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>
    </div>
  )
}
