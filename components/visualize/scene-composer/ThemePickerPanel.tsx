'use client'

import { THEME_PRESETS, ThemePreset } from '@/lib/themePresets'

interface Props {
  selectedThemeId: string
  onApply: (themeId: string) => void
}

export default function ThemePickerPanel({ selectedThemeId, onApply }: Props) {
  return (
    <div className="p-2 space-y-1.5">
      <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-medium px-1 mb-2">
        Themes
      </div>

      {/* None / Clear */}
      <button
        onClick={() => onApply('')}
        className={`w-full text-left rounded-lg border p-2 transition ${
          !selectedThemeId
            ? 'border-amber-500/50 bg-amber-500/10'
            : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
        }`}
      >
        <div className="text-[11px] font-medium text-zinc-300">None</div>
        <div className="text-[9px] text-zinc-600">No theme applied</div>
      </button>

      {/* Theme cards */}
      {THEME_PRESETS.map(theme => (
        <ThemeCard
          key={theme.id}
          theme={theme}
          selected={selectedThemeId === theme.id}
          onApply={() => onApply(theme.id)}
        />
      ))}
    </div>
  )
}

function ThemeCard({
  theme,
  selected,
  onApply,
}: {
  theme: ThemePreset
  selected: boolean
  onApply: () => void
}) {
  return (
    <button
      onClick={onApply}
      className={`w-full text-left rounded-lg border p-2 transition ${
        selected
          ? 'border-amber-500/50 bg-amber-500/10'
          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
      }`}
    >
      <div className="text-[11px] font-medium text-zinc-300">{theme.name}</div>
      <div className="text-[9px] text-zinc-600 mb-1.5">{theme.description}</div>

      {/* Color swatches */}
      <div className="flex gap-1 mb-1.5">
        <div
          className="w-5 h-5 rounded border border-zinc-700/50"
          style={{ backgroundColor: theme.background }}
          title="Background"
        />
        <div
          className="w-5 h-5 rounded border border-zinc-700/50"
          style={{ backgroundColor: theme.primary }}
          title="Primary"
        />
        <div
          className="w-5 h-5 rounded border border-zinc-700/50"
          style={{ backgroundColor: theme.secondary }}
          title="Secondary"
        />
        <div
          className="w-5 h-5 rounded border border-zinc-700/50"
          style={{ backgroundColor: theme.accent }}
          title="Accent"
        />
      </div>

      {/* Font preview */}
      <div className="text-[8px] text-zinc-600 truncate">
        {theme.headingFont} / {theme.bodyFont} &middot; {theme.statCard.variant}
      </div>
    </button>
  )
}
