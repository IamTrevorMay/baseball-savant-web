'use client'

import { useState } from 'react'
import { useBroadcast } from '../BroadcastContext'
import type { Topic } from '@/lib/widgetTypes'

export default function TopicControls() {
  const { widgetState, setTopics, goToTopic, nextTopic, prevTopic, setTopicVariant } = useBroadcast()
  const { topics, activeTopicIndex } = widgetState
  const [editingId, setEditingId] = useState<string | null>(null)

  function addTopic() {
    const newTopic: Topic = {
      id: crypto.randomUUID(),
      header: `Topic ${topics.length + 1}`,
      body: '',
      variant: 'default',
    }
    setTopics([...topics, newTopic])
  }

  function updateTopic(id: string, updates: Partial<Topic>) {
    setTopics(topics.map(t => t.id === id ? { ...t, ...updates } : t))
  }

  function removeTopic(id: string) {
    const idx = topics.findIndex(t => t.id === id)
    const newTopics = topics.filter(t => t.id !== id)
    setTopics(newTopics)
    if (activeTopicIndex >= newTopics.length) {
      goToTopic(Math.max(-1, newTopics.length - 1))
    }
  }

  function clearAllTopics() {
    setTopics([])
    goToTopic(-1)
  }

  return (
    <div className="space-y-2">
      {/* Navigation */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={prevTopic}
          disabled={activeTopicIndex <= -1}
          className="px-2 py-1 text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700 rounded hover:bg-zinc-700 disabled:opacity-40 transition"
        >
          Prev
        </button>
        <span className="flex-1 text-center text-[10px] text-zinc-400 font-mono">
          {activeTopicIndex >= 0 ? `${activeTopicIndex + 1} / ${topics.length}` : 'None'}
        </span>
        <button
          onClick={nextTopic}
          disabled={activeTopicIndex >= topics.length - 1}
          className="px-2 py-1 text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700 rounded hover:bg-zinc-700 disabled:opacity-40 transition"
        >
          Next
        </button>
      </div>

      {/* Topic list */}
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {topics.map((topic, idx) => {
          const isActive = idx === activeTopicIndex
          const isCrit = topic.variant === 'breakingNews'
          return (
            <div
              key={topic.id}
              className={`p-1.5 rounded border transition cursor-pointer ${
                isActive
                  ? isCrit ? 'border-orange-500/50 bg-orange-500/10' : 'border-cyan-500/50 bg-cyan-500/10'
                  : 'border-zinc-700/50 bg-zinc-800/30 hover:bg-zinc-800/60'
              }`}
              onClick={() => goToTopic(idx)}
            >
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-mono text-zinc-500 w-3">{idx + 1}</span>
                {editingId === topic.id ? (
                  <input
                    autoFocus
                    value={topic.header}
                    onChange={e => updateTopic(topic.id, { header: e.target.value })}
                    onBlur={() => setEditingId(null)}
                    onKeyDown={e => { if (e.key === 'Enter') setEditingId(null) }}
                    className="flex-1 text-[10px] bg-zinc-800 border border-zinc-600 rounded px-1 py-0.5 text-white outline-none"
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="flex-1 text-[10px] text-zinc-200 truncate"
                    onDoubleClick={e => { e.stopPropagation(); setEditingId(topic.id) }}
                  >
                    {topic.header || 'Untitled'}
                  </span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); setTopicVariant(topic.id, isCrit ? 'default' : 'breakingNews') }}
                  className={`text-[8px] px-1 py-0.5 rounded font-bold transition ${
                    isCrit ? 'bg-orange-500/30 text-orange-400' : 'bg-zinc-700 text-zinc-500 hover:text-orange-400'
                  }`}
                  title="Toggle Breaking News"
                >
                  CRIT
                </button>
                <button
                  onClick={e => { e.stopPropagation(); removeTopic(topic.id) }}
                  className="text-zinc-600 hover:text-red-400 transition"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              {editingId === topic.id && (
                <textarea
                  value={topic.body}
                  onChange={e => updateTopic(topic.id, { body: e.target.value })}
                  placeholder="Body text..."
                  className="mt-1 w-full text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-300 outline-none resize-none"
                  rows={2}
                  onClick={e => e.stopPropagation()}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-1.5">
        <button
          onClick={addTopic}
          disabled={topics.length >= 7}
          className="flex-1 px-2 py-1 text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/20 disabled:opacity-40 transition"
        >
          + Add
        </button>
        <button
          onClick={clearAllTopics}
          disabled={topics.length === 0}
          className="px-2 py-1 text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700 rounded hover:bg-zinc-700 disabled:opacity-40 transition"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
