'use client'

import { useState, useRef, useEffect } from 'react'

interface Props {
  onSelect: (type: 'throwing' | 'workout' | 'program') => void
}

export default function CreateEventMenu({ onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const items = [
    { key: 'throwing' as const, label: 'Throwing Day', color: 'text-blue-400', dot: 'bg-blue-500' },
    { key: 'workout' as const, label: 'Workout Day', color: 'text-purple-400', dot: 'bg-purple-500' },
    { key: 'program' as const, label: 'Multi-Week Program', color: 'text-amber-400', dot: 'bg-amber-500' },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded-lg text-xs font-semibold transition"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Event
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50 overflow-hidden">
          {items.map(item => (
            <button
              key={item.key}
              onClick={() => { onSelect(item.key); setOpen(false) }}
              className="w-full text-left px-3 py-2.5 hover:bg-zinc-800 transition flex items-center gap-2"
            >
              <div className={`w-2 h-2 rounded-full ${item.dot}`} />
              <span className={`text-xs font-medium ${item.color}`}>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
