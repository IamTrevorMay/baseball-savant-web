'use client'

import { InputFieldType, INPUT_FIELD_META } from '@/lib/sceneTypes'

interface Props {
  enabledFields: InputFieldType[]
  onChange: (fields: InputFieldType[]) => void
}

export default function InputFieldsPanel({ enabledFields, onChange }: Props) {
  function toggle(type: InputFieldType) {
    if (enabledFields.includes(type)) {
      onChange(enabledFields.filter(f => f !== type))
    } else {
      onChange([...enabledFields, type])
    }
  }

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Input Fields</div>
      <p className="text-[10px] text-zinc-600 mb-3">
        Choose which config fields appear in Scene Composer when this template is loaded.
      </p>
      <div className="space-y-1">
        {INPUT_FIELD_META.map(field => {
          const on = enabledFields.includes(field.type)
          return (
            <button
              key={field.type}
              onClick={() => toggle(field.type)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border transition text-left ${
                on
                  ? 'bg-emerald-600/10 border-emerald-600/30 hover:border-emerald-500/50'
                  : 'bg-zinc-800/30 border-zinc-800/60 hover:border-zinc-700'
              }`}
            >
              <span className={`w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold shrink-0 transition ${
                on ? 'bg-emerald-600 text-white' : 'bg-zinc-700 text-zinc-500'
              }`}>
                {on ? '\u2713' : ''}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-[11px] font-medium leading-tight ${on ? 'text-emerald-300' : 'text-zinc-400'}`}>
                  {field.label}
                </div>
                <div className="text-[9px] text-zinc-600 leading-tight">{field.description}</div>
              </div>
            </button>
          )
        })}
      </div>
      {enabledFields.length > 0 && (
        <div className="mt-2 text-[10px] text-emerald-600">
          {enabledFields.length} field{enabledFields.length !== 1 ? 's' : ''} enabled
        </div>
      )}
    </div>
  )
}
