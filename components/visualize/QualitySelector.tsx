'use client'
import { QUALITY_PRESETS, QualityPreset } from '@/lib/qualityPresets'
import { useQuality } from './QualityContext'

const PRESET_ORDER: QualityPreset['id'][] = ['draft', 'standard', 'high', 'ultra']

export default function QualitySelector() {
  const { quality, setQualityId } = useQuality()

  return (
    <div className="flex items-center gap-2">
      <label className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium select-none">
        Quality
      </label>
      <select
        value={quality.id}
        onChange={e => setQualityId(e.target.value as QualityPreset['id'])}
        className="
          bg-zinc-800 border border-zinc-700 rounded-lg
          px-2.5 py-1 text-sm text-zinc-200
          focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30
          transition cursor-pointer
          appearance-none pr-7
          bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')]
          bg-no-repeat bg-[right_0.5rem_center]
        "
      >
        {PRESET_ORDER.map(id => (
          <option key={id} value={id} className="bg-zinc-800 text-zinc-200">
            {QUALITY_PRESETS[id].label}
          </option>
        ))}
      </select>
    </div>
  )
}
