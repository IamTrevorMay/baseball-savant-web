'use client'

import { DataSchemaType } from '@/lib/sceneTypes'
import { SCHEMA_LABELS } from '@/lib/templateBindingSchemas'

interface Props {
  value: DataSchemaType
  onChange: (schema: DataSchemaType) => void
}

const SCHEMA_OPTIONS: DataSchemaType[] = ['leaderboard', 'outing', 'starter-card', 'percentile', 'generic']

export default function DataSchemaSelector({ value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as DataSchemaType)}
      className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-emerald-600 outline-none"
    >
      {SCHEMA_OPTIONS.map(s => (
        <option key={s} value={s}>{SCHEMA_LABELS[s]}</option>
      ))}
    </select>
  )
}
