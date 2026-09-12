'use client'

// Portrait/Landscape switch for Reports PDF exports (US Letter).
export type PdfOrientation = 'portrait' | 'landscape'

export default function PdfOrientationToggle({ value, onChange, disabled }: {
  value: PdfOrientation
  onChange: (o: PdfOrientation) => void
  disabled?: boolean
}) {
  return (
    <div className="flex rounded overflow-hidden border border-zinc-700" title="PDF page orientation (US Letter)">
      {(['portrait', 'landscape'] as PdfOrientation[]).map(o => (
        <button key={o} onClick={() => onChange(o)} disabled={disabled} title={o === 'portrait' ? 'Portrait 8.5×11' : 'Landscape 11×8.5'}
          className={`w-7 h-7 md:w-6 md:h-6 flex items-center justify-center transition disabled:opacity-50 ${value === o ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            {o === 'portrait' ? <rect x="4" y="2" width="8" height="12" rx="1" /> : <rect x="2" y="4" width="12" height="8" rx="1" />}
          </svg>
        </button>
      ))}
    </div>
  )
}
