'use client'
import { useState } from 'react'

interface ModelVersion {
  version: number
  formula: string
  created_at: string
}

interface Props {
  name: string
  formula: string
  versions: ModelVersion[]
  currentVersion: number
  onNameChange: (name: string) => void
  onVersionChange: (version: number) => void
}

// Simple syntax highlighting for SQL formulas
function highlightFormula(formula: string) {
  const tokens = formula.split(/(\b(?:COALESCE|NULLIF|CASE|WHEN|THEN|ELSE|END|ABS|SQRT|POWER|LN|LOG|EXP|GREATEST|LEAST|ROUND|CEIL|FLOOR|SIGN|AND|OR|NOT|IS|NULL|AS)\b|\b\d+\.?\d*\b|[(),+\-*/])/gi)
  return tokens.map((token, i) => {
    const upper = token.toUpperCase()
    if (/^(COALESCE|NULLIF|CASE|WHEN|THEN|ELSE|END|ABS|SQRT|POWER|LN|LOG|EXP|GREATEST|LEAST|ROUND|CEIL|FLOOR|SIGN|AND|OR|NOT|IS|NULL|AS)$/.test(upper)) {
      return <span key={i} className="text-sky-400">{token}</span>
    }
    if (/^\d+\.?\d*$/.test(token)) {
      return <span key={i} className="text-amber-400">{token}</span>
    }
    if (/^[a-z_][a-z0-9_]*$/i.test(token) && token.length > 1) {
      return <span key={i} className="text-emerald-400">{token}</span>
    }
    return <span key={i}>{token}</span>
  })
}

export default function ModelWindow({ name, formula, versions, currentVersion, onNameChange, onVersionChange }: Props) {
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(name)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-800/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          {editingName ? (
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onBlur={() => { onNameChange(nameInput); setEditingName(false) }}
              onKeyDown={e => { if (e.key === 'Enter') { onNameChange(nameInput); setEditingName(false) } }}
              autoFocus
              className="bg-zinc-900 border border-zinc-600 rounded px-2 py-0.5 text-sm text-white focus:border-emerald-600 focus:outline-none"
            />
          ) : (
            <span className="text-sm font-semibold text-white cursor-pointer hover:text-emerald-400 transition" onClick={() => { setNameInput(name); setEditingName(true) }}>
              {name || 'Untitled Model'}
            </span>
          )}
        </div>
        {versions.length > 1 && (
          <select
            value={currentVersion}
            onChange={e => onVersionChange(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded text-[11px] text-zinc-300 px-2 py-1 focus:outline-none focus:border-emerald-600"
          >
            {versions.map(v => (
              <option key={v.version} value={v.version}>v{v.version}</option>
            ))}
          </select>
        )}
      </div>
      {/* Formula Body */}
      <div className="p-4 min-h-[60px]">
        {formula ? (
          <pre className="text-[13px] font-mono leading-relaxed whitespace-pre-wrap text-zinc-300">
            {highlightFormula(formula)}
          </pre>
        ) : (
          <p className="text-zinc-600 text-sm italic">No formula yet. Chat with the agent to build one.</p>
        )}
      </div>
    </div>
  )
}
