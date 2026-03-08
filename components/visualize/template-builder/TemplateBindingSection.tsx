'use client'

import { SceneElement, DataSchemaType, TemplateBinding } from '@/lib/sceneTypes'
import {
  SCHEMA_FIELDS,
  FORMAT_OPTIONS,
  autoTargetProp,
  STAT_CARD_TARGET_OPTIONS,
  COMPARISON_BAR_TARGET_OPTIONS,
  type FormatType,
} from '@/lib/templateBindingSchemas'

interface Props {
  element: SceneElement
  schemaType: DataSchemaType
  onUpdateBinding: (binding: TemplateBinding | undefined) => void
}

export default function TemplateBindingSection({ element, schemaType, onUpdateBinding }: Props) {
  const binding = element.templateBinding
  const fields = SCHEMA_FIELDS[schemaType] || []

  const isBound = !!binding

  function handleToggle() {
    if (isBound) {
      onUpdateBinding(undefined)
    } else {
      const firstField = fields[0]
      if (!firstField) return
      onUpdateBinding({
        fieldPath: firstField.path,
        targetProp: autoTargetProp(element.type, firstField.type),
        format: 'raw',
      })
    }
  }

  function handleFieldChange(fieldPath: string) {
    const field = fields.find(f => f.path === fieldPath)
    onUpdateBinding({
      ...binding!,
      fieldPath,
      targetProp: field ? autoTargetProp(element.type, field.type) : binding!.targetProp,
    })
  }

  function handleTargetChange(targetProp: string) {
    onUpdateBinding({ ...binding!, targetProp })
  }

  function handleFormatChange(format: FormatType) {
    onUpdateBinding({ ...binding!, format })
  }

  // Determine which target prop options to show
  const targetOptions =
    element.type === 'stat-card' ? STAT_CARD_TARGET_OPTIONS :
    element.type === 'comparison-bar' ? COMPARISON_BAR_TARGET_OPTIONS :
    null

  return (
    <div className="border border-emerald-800/40 rounded-lg overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-emerald-900/20 transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
            Template Binding
          </span>
          {isBound && (
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-600/30">
              BOUND
            </span>
          )}
        </div>
        <div className={`w-8 h-4 rounded-full transition ${isBound ? 'bg-emerald-600' : 'bg-zinc-700'} relative`}>
          <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${isBound ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </div>
      </button>

      {/* Binding config */}
      {isBound && binding && (
        <div className="px-3 pb-3 space-y-2 border-t border-emerald-800/30">
          {/* Field dropdown */}
          <label className="flex flex-col gap-1 mt-2">
            <span className="text-[10px] text-zinc-500">Field</span>
            <select
              value={binding.fieldPath}
              onChange={e => handleFieldChange(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-emerald-600 outline-none"
            >
              {fields.map(f => (
                <option key={f.path} value={f.path}>{f.label}</option>
              ))}
            </select>
          </label>

          {/* Target property (only for stat-card and comparison-bar) */}
          {targetOptions && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500">Target Property</span>
              <select
                value={binding.targetProp || 'value'}
                onChange={e => handleTargetChange(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-emerald-600 outline-none"
              >
                {targetOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          )}

          {/* Format */}
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500">Format</span>
            <select
              value={binding.format || 'raw'}
              onChange={e => handleFormatChange(e.target.value as FormatType)}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-emerald-600 outline-none"
            >
              {FORMAT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  )
}
