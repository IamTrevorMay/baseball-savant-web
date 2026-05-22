'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import MobileWorkShell from './MobileWorkShell'
import { ATHLETE_STAGES } from '@/lib/work/sprints'

type Athlete = { id: string; full_name: string; position: string|null; level: string|null; stage: string; next_touch: string|null }

export default function MobileWorkAthletes() {
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [stage, setStage] = useState<string>('active')

  const reload = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('work_athletes').select('*').is('archived_at', null).order('created_at', { ascending: false })
    setAthletes((data as Athlete[]) || [])
  }, [])

  useEffect(() => { reload() }, [reload])

  async function moveStage(id: string, s: string) {
    const supabase = createClient()
    await supabase.from('work_athletes').update({ stage: s }).eq('id', id)
    reload()
  }

  const items = athletes.filter(a => a.stage === stage)

  return (
    <MobileWorkShell title="Athletes">
      <div className="px-3 pt-3">
        <div className="flex gap-1 overflow-x-auto pb-2">
          {ATHLETE_STAGES.map(s => (
            <button
              key={s.id}
              onClick={() => setStage(s.id)}
              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${stage === s.id ? 'bg-sky-500/20 text-sky-300' : 'bg-zinc-900 border border-zinc-800 text-zinc-400'}`}
            >{s.label} <span className="text-zinc-500">{athletes.filter(a => a.stage === s.id).length}</span></button>
          ))}
        </div>
      </div>
      <div className="px-3 mt-2 space-y-2">
        {items.map(a => (
          <div key={a.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="text-sm font-medium text-zinc-100">{a.full_name}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{[a.position, a.level].filter(Boolean).join(' • ')}</div>
            {a.next_touch && <div className="text-xs text-amber-300 mt-1">Next: {a.next_touch}</div>}
            <select value={a.stage} onChange={e => moveStage(a.id, e.target.value)} className="mt-2 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 outline-none w-full">
              {ATHLETE_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        ))}
        {items.length === 0 && <div className="text-sm text-zinc-500 text-center py-8">Empty stage.</div>}
      </div>
    </MobileWorkShell>
  )
}
