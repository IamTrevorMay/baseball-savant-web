'use client'

import { useState, useEffect } from 'react'

interface Member {
  id: string
  user_id: string
  email: string
  role: 'viewer' | 'producer'
}

interface AvailableUser {
  user_id: string
  email: string
}

interface ShareDialogProps {
  projectId: string
  onClose: () => void
}

export default function ShareDialog({ projectId, onClose }: ShareDialogProps) {
  const [owner, setOwner] = useState<{ user_id: string; email: string } | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'viewer' | 'producer'>('viewer')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchMembers()
  }, [])

  async function fetchMembers() {
    try {
      const res = await fetch(`/api/broadcast/project-members?project_id=${projectId}`)
      const data = await res.json()
      if (data.owner) setOwner(data.owner)
      if (data.members) setMembers(data.members)
      if (data.allUsers) {
        // Filter out users who are already members
        const memberIds = new Set((data.members || []).map((m: Member) => m.user_id))
        setAvailableUsers(data.allUsers.filter((u: AvailableUser) => !memberIds.has(u.user_id)))
      }
    } catch (err) {
      console.error('Failed to fetch members:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(targetEmail: string) {
    setAdding(true)
    setError('')
    try {
      const res = await fetch('/api/broadcast/project-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, email: targetEmail, role }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to add member')
      } else if (data.member) {
        setMembers(prev => [...prev, data.member])
        setAvailableUsers(prev => prev.filter(u => u.user_id !== data.member.user_id))
        setEmail('')
      }
    } catch (err) {
      setError('Failed to add member')
    } finally {
      setAdding(false)
    }
  }

  async function handleRoleChange(memberId: string, newRole: 'viewer' | 'producer') {
    try {
      await fetch('/api/broadcast/project-members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: memberId, project_id: projectId, role: newRole }),
      })
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
    } catch (err) {
      console.error('Failed to update role:', err)
    }
  }

  async function handleRemove(member: Member) {
    try {
      await fetch('/api/broadcast/project-members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: member.id, project_id: projectId }),
      })
      setMembers(prev => prev.filter(m => m.id !== member.id))
      setAvailableUsers(prev => [...prev, { user_id: member.user_id, email: member.email }])
    } catch (err) {
      console.error('Failed to remove member:', err)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[480px] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Share Project</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">Manage who can access this project</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-zinc-700 border-t-red-400 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Owner */}
              {owner && (
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Owner</label>
                  <div className="mt-1 flex items-center gap-2 px-3 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg">
                    <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center text-[10px] font-bold text-red-400">
                      {owner.email?.[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="text-xs text-zinc-300 flex-1 truncate">{owner.email}</span>
                    <span className="text-[10px] text-zinc-500 bg-zinc-700/50 px-1.5 py-0.5 rounded">Owner</span>
                  </div>
                </div>
              )}

              {/* Current members */}
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Members</label>
                {members.length === 0 ? (
                  <div className="mt-1 text-xs text-zinc-600 py-3 text-center">No members yet</div>
                ) : (
                  <div className="mt-1 space-y-1">
                    {members.map(member => (
                      <div key={member.id} className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg">
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] font-bold text-emerald-400">
                          {member.email?.[0]?.toUpperCase() || '?'}
                        </div>
                        <span className="text-xs text-zinc-300 flex-1 truncate">{member.email}</span>
                        <select
                          value={member.role}
                          onChange={e => handleRoleChange(member.id, e.target.value as 'viewer' | 'producer')}
                          className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-zinc-300"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="producer">Producer</option>
                        </select>
                        <button
                          onClick={() => handleRemove(member)}
                          className="text-zinc-600 hover:text-red-400 transition"
                          title="Remove"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick-add existing users */}
              {availableUsers.length > 0 && (
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Add Existing User</label>
                  <div className="mt-1 space-y-1">
                    {availableUsers.map(user => (
                      <div key={user.user_id} className="flex items-center gap-2 px-3 py-2 bg-zinc-800/30 border border-zinc-700/30 rounded-lg">
                        <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                          {user.email?.[0]?.toUpperCase() || '?'}
                        </div>
                        <span className="text-xs text-zinc-400 flex-1 truncate">{user.email}</span>
                        <button
                          onClick={() => handleAdd(user.email)}
                          disabled={adding}
                          className="px-2 py-0.5 text-[10px] font-medium rounded bg-zinc-700 text-zinc-400 hover:bg-emerald-600/30 hover:text-emerald-300 border border-zinc-600/50 transition disabled:opacity-50"
                        >
                          + Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add by email */}
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Add by Email</label>
                <div className="mt-1 flex gap-2">
                  <input
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleAdd(email.trim())}
                    placeholder="Email address"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-zinc-500"
                  />
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value as 'viewer' | 'producer')}
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-[10px] text-zinc-300"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="producer">Producer</option>
                  </select>
                  <button
                    onClick={() => handleAdd(email.trim())}
                    disabled={adding || !email.trim()}
                    className="px-3 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition"
                  >
                    {adding ? '...' : 'Add'}
                  </button>
                </div>
                {error && (
                  <p className="mt-1 text-[10px] text-red-400">{error}</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
