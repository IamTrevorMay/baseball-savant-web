'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import MobileWorkShell from './MobileWorkShell'

type Goal = { id: string; title: string; target_value: number|null; current_value: number|null; unit: string|null; target_date: string|null; completed_at: string|null; scope: 'personal'|'team' }

export default function MobileWorkGoals() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [tab, setTab] = useState<'personal'|'team'>('personal')

  const reload = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const q = supabase.from('work_goals').select('*').eq('scope', tab).order('created_at', { ascending: false })
    if (tab === 'personal') q.eq('owner_id', user.id)
    const { data } = await q
    setGoals((data as Goal[]) || [])
  }, [tab])

  useEffect(() => { reload() }, [reload])

  return (
    <MobileWorkShell title="Goals">
      <div className="px-3 pt-3">
        <div className="flex gap-1">
          {(['personal','team'] as const).map(s => (
            <button
              key={s}
              onClick={() => setTab(s)}
              className={`px-3 py-1.5 text-xs rounded-full ${tab === s ? 'bg-sky-500/20 text-sky-300' : 'bg-zinc-900 border border-zinc-800 text-zinc-400'}`}
            >{s === 'personal' ? 'Personal' : 'Team'}</button>
          ))}
        </div>
      </div>
      <div className="p-3 space-y-2">
        {goals.length === 0 && <div className="text-sm text-zinc-500 text-center py-8">No goals yet.</div>}
        {goals.map(g => {
          const target = g.target_value || 0
          const current = g.current_value || 0
          const pct = target ? Math.min(100, Math.round((current / target) * 100)) : 0
          return (
            <div key={g.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="text-sm text-zinc-100 font-medium">{g.title}</div>
              <div className="text-xs text-zinc-500 mt-0.5">
                {target ? `${current}${g.unit ? ` ${g.unit}` : ''} / ${target}${g.unit ? ` ${g.unit}` : ''}` : ''}
                {g.target_date && <span className="ml-2">by {g.target_date}</span>}
              </div>
              {target ? (
                <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </MobileWorkShell>
  )
}
