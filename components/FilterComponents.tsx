interface SidebarCheckboxesProps {
  label: string; items: string[]; selected: string[] | null; onToggle: (value: string) => void
}
export function SidebarCheckboxes({ label, items, selected, onToggle }: SidebarCheckboxesProps) {
  return (
    <div>
      <label className="text-[11px] text-zinc-500 mb-1 block">{label}</label>
      <div className="max-h-28 overflow-y-auto bg-zinc-950 border border-zinc-700 rounded p-1 space-y-px">
        {items.map(item => (
          <label key={item} className="flex items-center gap-1.5 px-1.5 py-[3px] cursor-pointer hover:bg-zinc-800 rounded text-[11px] transition">
            <input type="checkbox" checked={selected?.includes(item) || false} onChange={() => onToggle(item)}
              className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 w-3 h-3" />
            <span className={selected?.includes(item) ? 'text-white' : 'text-zinc-400'}>{item}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

interface ChipsProps {
  label: string; items: string[]; selected: string[] | null; onToggle: (value: string) => void
}
export function Chips({ label, items, selected, onToggle }: ChipsProps) {
  return (
    <div>
      <label className="text-[11px] text-zinc-500 mb-1 block">{label}</label>
      <div className="flex flex-wrap gap-1">
        {items.map(item => (
          <button key={item} onClick={() => onToggle(item)}
            className={`px-2 py-0.5 rounded text-[11px] border transition ${
              selected?.includes(item)
                ? 'bg-emerald-700/40 border-emerald-600/50 text-emerald-300'
                : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
            }`}>
            {item}
          </button>
        ))}
      </div>
    </div>
  )
}

interface RangeInputProps {
  label: string; value: { min: string; max: string }; onChange: (field: 'min' | 'max', value: string) => void
}
export function RangeInput({ label, value, onChange }: RangeInputProps) {
  return (
    <div>
      <label className="text-[11px] text-zinc-500 mb-1 block">{label}</label>
      <div className="flex gap-1.5">
        <input type="number" value={value.min} onChange={e => onChange('min', e.target.value)} placeholder="Min"
          className="w-full p-1.5 bg-zinc-950 border border-zinc-700 rounded text-[11px] text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none" />
        <input type="number" value={value.max} onChange={e => onChange('max', e.target.value)} placeholder="Max"
          className="w-full p-1.5 bg-zinc-950 border border-zinc-700 rounded text-[11px] text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none" />
      </div>
    </div>
  )
}
