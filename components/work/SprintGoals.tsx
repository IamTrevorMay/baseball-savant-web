'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Goal {
  id: string
  sprint_id: string
  text: string
  is_complete: boolean
  position: number
}

interface Props {
  goals: Goal[]
  sprintId: string
  onUpdate: () => void
}

export default function SprintGoals({ goals, sprintId, onUpdate }: Props) {
  const [newGoalText, setNewGoalText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  async function addGoal() {
    if (!newGoalText.trim() || goals.length >= 3) return
    const supabase = createClient()
    const { error } = await supabase.from('work_sprint_goals').insert({
      sprint_id: sprintId,
      text: newGoalText.trim(),
      position: goals.length,
    })
    if (!error) {
      setNewGoalText('')
      onUpdate()
    }
  }

  async function toggleGoal(goal: Goal) {
    const supabase = createClient()
    const { error } = await supabase
      .from('work_sprint_goals')
      .update({ is_complete: !goal.is_complete })
      .eq('id', goal.id)
    if (!error) onUpdate()
  }

  async function saveEdit(goalId: string) {
    if (!editText.trim()) return
    const supabase = createClient()
    const { error } = await supabase
      .from('work_sprint_goals')
      .update({ text: editText.trim() })
      .eq('id', goalId)
    if (!error) {
      setEditingId(null)
      onUpdate()
    }
  }

  async function deleteGoal(goalId: string) {
    const supabase = createClient()
    const { error } = await supabase.from('work_sprint_goals').delete().eq('id', goalId)
    if (!error) onUpdate()
  }

  return (
    <div>
      <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">
        Sprint Goals
      </div>
      <div className="flex flex-col gap-1.5">
        {goals.sort((a, b) => a.position - b.position).map(goal => (
          <div key={goal.id} className="flex items-center gap-2">
            <button
              onClick={() => toggleGoal(goal)}
              className={`w-[18px] h-[18px] rounded shrink-0 flex items-center justify-center border-[1.5px] transition ${
                goal.is_complete
                  ? 'bg-sky-500 border-sky-500'
                  : 'bg-transparent border-zinc-600 hover:border-zinc-400'
              }`}
            >
              {goal.is_complete && <span className="text-white text-[11px] leading-none">✓</span>}
            </button>
            {editingId === goal.id ? (
              <input
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onBlur={() => saveEdit(goal.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveEdit(goal.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                autoFocus
                className="flex-1 bg-zinc-800/50 border border-sky-500/30 rounded-md px-2 py-1 text-[13px] text-white outline-none"
              />
            ) : (
              <span
                onClick={() => { setEditingId(goal.id); setEditText(goal.text) }}
                className={`flex-1 text-[13px] cursor-pointer ${
                  goal.is_complete ? 'text-zinc-500 line-through' : 'text-zinc-200'
                }`}
              >
                {goal.text}
              </span>
            )}
            <button
              onClick={() => deleteGoal(goal.id)}
              className="text-zinc-600 hover:text-red-400 text-sm px-1 transition"
            >
              ×
            </button>
          </div>
        ))}
        {goals.length < 3 && (
          <div className="flex gap-1.5 mt-0.5">
            <input
              value={newGoalText}
              onChange={e => setNewGoalText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addGoal()}
              placeholder="Add a goal..."
              className="flex-1 bg-zinc-800/30 border border-zinc-700/50 rounded-md px-2 py-1 text-xs text-white placeholder-zinc-600 outline-none"
            />
            <button
              onClick={addGoal}
              disabled={!newGoalText.trim()}
              className="bg-sky-500/15 text-sky-400 border border-sky-500/20 rounded-md px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40 transition"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
