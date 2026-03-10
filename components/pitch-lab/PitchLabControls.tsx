'use client'
import { AnnotationFlags } from './PitchLabScene'
import PlayerPicker from '@/components/visualize/PlayerPicker'
import { getPitchColor } from '@/components/chartConfig'
import { PITCH_CODE_NAMES } from '@/components/chartConfig'

interface KinematicsRow {
  pitch_type: string
  pitch_name: string
  vx0: number; vy0: number; vz0: number
  ax: number; ay: number; az: number
  release_pos_x: number; release_pos_z: number
  release_extension: number
  avg_velo: number
  pitches: number
}

interface Props {
  playerName: string | null
  pitchTypes: KinematicsRow[]
  selectedPitchType: string | null
  onSelectPlayer: (id: number, name: string) => void
  onSelectPitchType: (pt: string) => void
  cameraPreset: string
  onCameraPreset: (preset: string) => void
  annotations: AnnotationFlags
  onAnnotations: (a: AnnotationFlags) => void
  speed: number
  onSpeed: (s: number) => void
  exporting: boolean
  exportProgress: number
  onExport: (format: 'webm' | 'mp4') => void
}

const CAMERA_OPTIONS = [
  { key: 'catcher', label: 'Catcher' },
  { key: 'pitcher', label: 'Pitcher' },
  { key: 'side', label: 'Side (3B)' },
  { key: 'broadcast', label: 'Broadcast' },
  { key: 'orbit', label: 'Orbit' },
]

export default function PitchLabControls({
  playerName, pitchTypes, selectedPitchType,
  onSelectPlayer, onSelectPitchType,
  cameraPreset, onCameraPreset,
  annotations, onAnnotations,
  speed, onSpeed,
  exporting, exportProgress, onExport,
}: Props) {
  return (
    <div className="w-72 shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto flex flex-col gap-4 p-4">
      {/* Player Selection */}
      <section>
        <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5 block">
          Player
        </label>
        <PlayerPicker onSelect={onSelectPlayer} />
        {playerName && (
          <p className="text-xs text-zinc-400 mt-1.5 truncate">{playerName}</p>
        )}
      </section>

      {/* Pitch Type Chips */}
      {pitchTypes.length > 0 && (
        <section>
          <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5 block">
            Pitch Type
          </label>
          <div className="flex flex-col gap-1">
            {pitchTypes.map(pt => {
              const color = getPitchColor(pt.pitch_type)
              const active = selectedPitchType === pt.pitch_type
              return (
                <button
                  key={pt.pitch_type}
                  onClick={() => onSelectPitchType(pt.pitch_type)}
                  className={`
                    flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition text-xs
                    ${active
                      ? 'bg-zinc-700 border border-zinc-600'
                      : 'bg-zinc-800/60 border border-zinc-800 hover:bg-zinc-800'
                    }
                  `}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-zinc-200 flex-1 truncate">
                    {PITCH_CODE_NAMES[pt.pitch_type] || pt.pitch_name}
                  </span>
                  <span className="text-zinc-500 text-[10px] font-mono">
                    {pt.avg_velo} mph
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Camera Presets */}
      <section>
        <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5 block">
          Camera
        </label>
        <div className="grid grid-cols-2 gap-1">
          {CAMERA_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => onCameraPreset(opt.key)}
              className={`
                px-2 py-1.5 rounded text-[11px] transition
                ${cameraPreset === opt.key
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'
                }
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Annotation Toggles */}
      <section>
        <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5 block">
          Annotations
        </label>
        <div className="flex flex-col gap-1">
          {([
            { key: 'showVAA' as const, label: 'VAA Line' },
            { key: 'showHAA' as const, label: 'HAA Line' },
            { key: 'showMovement' as const, label: 'Movement Arrows' },
            { key: 'showGhostBall' as const, label: 'Ghost Ball' },
          ]).map(opt => (
            <label key={opt.key} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={annotations[opt.key]}
                onChange={e => onAnnotations({ ...annotations, [opt.key]: e.target.checked })}
                className="
                  w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800
                  text-amber-500 focus:ring-amber-500/30 focus:ring-offset-0
                "
              />
              <span className="text-xs text-zinc-400 group-hover:text-zinc-300 transition">
                {opt.label}
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Speed */}
      <section>
        <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5 block">
          Speed: {speed}x
        </label>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={speed}
          onChange={e => onSpeed(parseFloat(e.target.value))}
          className="w-full accent-amber-500"
        />
        <div className="flex justify-between text-[9px] text-zinc-600 mt-0.5">
          <span>0.05x</span>
          <span>1x</span>
        </div>
      </section>

      {/* Export */}
      <section className="mt-auto pt-4 border-t border-zinc-800">
        <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5 block">
          Export
        </label>
        {exporting ? (
          <div>
            <div className="w-full bg-zinc-800 rounded-full h-1.5 mb-1">
              <div
                className="bg-amber-500 h-1.5 rounded-full transition-all"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
            <p className="text-[10px] text-zinc-500 text-center">{Math.round(exportProgress)}%</p>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => onExport('webm')}
              className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 hover:bg-zinc-700 transition"
            >
              WebM
            </button>
            <button
              onClick={() => onExport('mp4')}
              className="flex-1 px-3 py-1.5 bg-amber-600/20 border border-amber-500/30 rounded text-xs text-amber-300 hover:bg-amber-600/30 transition"
            >
              MP4
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
