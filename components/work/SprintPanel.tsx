'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import VelocityChart from './VelocityChart'
import SprintGoals from './SprintGoals'

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface Sprint {
  id: string
  start_date: string
  end_date: string
  status: string
  velocity: number | null
}

interface Goal {
  id: string
  sprint_id: string
  text: string
  is_complete: boolean
  position: number
}

interface Props {
  boardVersion: number
}

export default function SprintPanel({ boardVersion }: Props) {
  const [activeSprint, setActiveSprint] = useState<Sprint | null>(null)
  const [sprintTasks, setSprintTasks] = useState({ total: 0, completed: 0 })
  const [pastSprints, setPastSprints] = useState<Sprint[]>([])
  const [sprintGoals, setSprintGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)

  const fetchActiveSprint = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('work_sprints')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
    setActiveSprint(data)
    setLoading(false)
  }, [])

  const fetchSprintTasks = useCallback(async () => {
    if (!activeSprint) { setSprintTasks({ total: 0, completed: 0 }); return }
    const supabase = createClient()
    const { data } = await supabase
      .from('work_tasks')
      .select('id, status, priority')
      .eq('sprint_id', activeSprint.id)
    if (data) {
      const pts = (t: any) => parseInt(t.priority) || 0
      setSprintTasks({
        total: data.reduce((sum, t) => sum + pts(t), 0),
        completed: data.filter(t => t.status === 'done').reduce((sum, t) => sum + pts(t), 0),
      })
    }
  }, [activeSprint])

  const fetchPastSprints = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('work_sprints')
      .select('id, start_date, velocity')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .not('velocity', 'is', null)
      .order('start_date', { ascending: true })
      .limit(8)
    setPastSprints((data as Sprint[]) || [])
  }, [])

  const fetchSprintGoals = useCallback(async () => {
    if (!activeSprint) { setSprintGoals([]); return }
    const supabase = createClient()
    const { data } = await supabase
      .from('work_sprint_goals')
      .select('*')
      .eq('sprint_id', activeSprint.id)
      .order('position')
    setSprintGoals((data as Goal[]) || [])
  }, [activeSprint])

  useEffect(() => { fetchActiveSprint(); fetchPastSprints() }, [fetchActiveSprint, fetchPastSprints])
  useEffect(() => { fetchSprintTasks(); fetchSprintGoals() }, [fetchSprintTasks, fetchSprintGoals])
  useEffect(() => {
    if (boardVersion > 0) {
      fetchSprintTasks()
      fetchActiveSprint()
      fetchPastSprints()
      fetchSprintGoals()
    }
  }, [boardVersion, fetchSprintTasks, fetchActiveSprint, fetchPastSprints, fetchSprintGoals])

  if (loading) return null
  if (!activeSprint && pastSprints.length === 0) return null

  return (
    <div className="flex gap-5 mb-6">
      {/* Left: Sprint Summary */}
      <div className="flex-1 bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5 min-w-0">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
            Sprint Summary
          </span>
          {activeSprint && (
            <span className="text-xs text-zinc-500">
              {fmtDate(activeSprint.start_date)} – {fmtDate(activeSprint.end_date)}
            </span>
          )}
        </div>

        {activeSprint && (
          <div className={pastSprints.length > 0 ? 'mb-3.5' : ''}>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">
              Progress
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all duration-300"
                  style={{ width: sprintTasks.total > 0 ? `${(sprintTasks.completed / sprintTasks.total) * 100}%` : '0%' }}
                />
              </div>
              <span className="text-xs text-zinc-500 whitespace-nowrap">
                {sprintTasks.completed}/{sprintTasks.total} pts
              </span>
            </div>
          </div>
        )}

        {pastSprints.length > 0 && (
          <div className={activeSprint ? 'pt-3.5 border-t border-zinc-800' : ''}>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-2.5">
              Velocity
            </div>
            <VelocityChart sprints={pastSprints} />
          </div>
        )}
      </div>

      {/* Right: Sprint Goals */}
      {activeSprint && (
        <div className="flex-1 bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
          <SprintGoals goals={sprintGoals} sprintId={activeSprint.id} onUpdate={fetchSprintGoals} />
        </div>
      )}
    </div>
  )
}
