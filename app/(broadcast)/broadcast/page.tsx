'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BroadcastProject } from '@/lib/broadcastTypes'

export default function BroadcastProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<BroadcastProject[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    fetchProjects()
  }, [])

  async function fetchProjects() {
    try {
      const res = await fetch('/api/broadcast/projects')
      const data = await res.json()
      setProjects(data.projects || [])
    } catch (err) {
      console.error('Failed to fetch projects:', err)
    } finally {
      setLoading(false)
    }
  }

  async function createProject() {
    setCreating(true)
    try {
      const res = await fetch('/api/broadcast/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Untitled Project' }),
      })
      const data = await res.json()
      if (data.id) {
        router.push(`/broadcast/${data.id}`)
      }
    } catch (err) {
      console.error('Failed to create project:', err)
    } finally {
      setCreating(false)
    }
  }

  async function renameProject(id: string) {
    if (!editName.trim()) return
    try {
      await fetch(`/api/broadcast/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      setProjects(prev => prev.map(p => p.id === id ? { ...p, name: editName.trim() } : p))
      setEditingId(null)
    } catch (err) {
      console.error('Failed to rename project:', err)
    }
  }

  async function deleteProject(id: string) {
    if (!confirm('Delete this broadcast project? This cannot be undone.')) return
    try {
      await fetch(`/api/broadcast/projects/${id}`, { method: 'DELETE' })
      setProjects(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      console.error('Failed to delete project:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-red-400 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-[family-name:var(--font-bebas)] text-3xl text-white tracking-wide">Broadcast Projects</h1>
          <p className="text-sm text-zinc-500 mt-1">OBS overlay graphics controller</p>
        </div>
        <button
          onClick={createProject}
          disabled={creating}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
        >
          {creating ? 'Creating...' : 'New Project'}
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <div className="text-4xl mb-3 text-zinc-600">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto">
              <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-zinc-300 mb-1">No broadcast projects yet</h3>
          <p className="text-sm text-zinc-500 mb-6">Create a project to start building OBS overlays</p>
          <button
            onClick={createProject}
            disabled={creating}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
          >
            Create First Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {projects.map(project => (
            <div
              key={project.id}
              className="group bg-zinc-900 border border-zinc-800 hover:border-red-500/40 rounded-xl p-5 transition cursor-pointer"
              onClick={() => {
                if (editingId !== project.id) router.push(`/broadcast/${project.id}`)
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {editingId === project.id ? (
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') renameProject(project.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white w-full"
                      />
                      <button onClick={() => renameProject(project.id)} className="text-xs text-emerald-400 hover:text-emerald-300">Save</button>
                    </div>
                  ) : (
                    <h3 className="text-white font-medium truncate">{project.name}</h3>
                  )}
                  <p className="text-xs text-zinc-500 mt-1">
                    {new Date(project.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => { setEditingId(project.id); setEditName(project.name) }}
                    className="p-1.5 text-zinc-500 hover:text-zinc-300 transition"
                    title="Rename"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => deleteProject(project.id)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 transition"
                    title="Delete"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
