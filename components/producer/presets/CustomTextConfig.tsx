'use client'

import { useState } from 'react'
import type { CustomTextConfig as CustomTextConfigType } from '@/lib/producerTypes'

interface Props {
  onChange: (config: CustomTextConfigType) => void
}

export default function CustomTextConfig({ onChange }: Props) {
  const [headline, setHeadline] = useState('')
  const [subline, setSubline] = useState('')
  const [body, setBody] = useState('')

  const handleChange = (h: string, s: string, b: string) => {
    onChange({
      headline: h,
      subline: s || undefined,
      body: b || undefined,
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Headline</label>
        <input
          value={headline}
          onChange={e => { setHeadline(e.target.value); handleChange(e.target.value, subline, body) }}
          placeholder="Breaking News..."
          className="w-full h-9 px-3 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
        />
      </div>
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Subline (optional)</label>
        <input
          value={subline}
          onChange={e => { setSubline(e.target.value); handleChange(headline, e.target.value, body) }}
          placeholder="Additional context..."
          className="w-full h-9 px-3 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
        />
      </div>
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Body (optional)</label>
        <textarea
          value={body}
          onChange={e => { setBody(e.target.value); handleChange(headline, subline, e.target.value) }}
          placeholder="Longer description..."
          rows={3}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 resize-none"
        />
      </div>
    </div>
  )
}
