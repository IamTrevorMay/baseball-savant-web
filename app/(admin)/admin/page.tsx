'use client'
import { useState, useEffect, useCallback } from 'react'

const ALL_TOOLS = ['research', 'mechanics', 'models', 'compete', 'visualize'] as const

interface Invitation {
  id: string
  email: string
  role: string
  tools: string[]
  created_at: string
}

interface UserRow {
  id: string
  email: string
  full_name: string | null
  display_name: string | null
  role: string
  created_at: string
  last_sign_in_at: string | null
  tools: string[]
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingInvites, setLoadingInvites] = useState(true)

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('user')
  const [inviteTools, setInviteTools] = useState<string[]>([])
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRole, setEditRole] = useState('')
  const [editTools, setEditTools] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true)
    const res = await fetch('/api/admin/users')
    const data = await res.json()
    setUsers(data.users ?? [])
    setLoadingUsers(false)
  }, [])

  const fetchInvitations = useCallback(async () => {
    setLoadingInvites(true)
    const res = await fetch('/api/admin/invitations')
    const data = await res.json()
    setInvitations(data.invitations ?? [])
    setLoadingInvites(false)
  }, [])

  useEffect(() => {
    fetchUsers()
    fetchInvitations()
  }, [fetchUsers, fetchInvitations])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    setInviteMsg(null)
    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole, tools: inviteTools }),
    })
    const data = await res.json()
    if (res.ok) {
      setInviteMsg({ type: 'ok', text: `Invite sent to ${inviteEmail}` })
      setInviteEmail('')
      setInviteRole('user')
      setInviteTools([])
      fetchInvitations()
      fetchUsers()
    } else {
      setInviteMsg({ type: 'err', text: data.error || 'Failed to send invite' })
    }
    setInviting(false)
  }

  async function handleRevokeInvite(id: string) {
    await fetch('/api/admin/invitations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchInvitations()
    fetchUsers()
  }

  async function handleResetPassword(email: string) {
    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) {
      alert(`Password reset email sent to ${email}`)
    } else {
      const data = await res.json()
      alert(data.error || 'Failed to send reset email')
    }
  }

  function startEdit(u: UserRow) {
    setEditingId(u.id)
    setEditRole(u.role)
    setEditTools(u.role === 'owner' || u.role === 'admin' ? [] : [...u.tools])
  }

  async function handleSaveEdit(id: string) {
    setSaving(true)
    await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: editRole, tools: editTools }),
    })
    setEditingId(null)
    setSaving(false)
    fetchUsers()
  }

  async function handleDeleteUser(id: string) {
    await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    setDeletingId(null)
    fetchUsers()
  }

  function toggleTool(tool: string, list: string[], setList: (t: string[]) => void) {
    setList(list.includes(tool) ? list.filter(t => t !== tool) : [...list, tool])
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-10">
      {/* Section A: Invite Users */}
      <section>
        <h2 className="font-[family-name:var(--font-bebas)] text-2xl uppercase tracking-wider text-white mb-4">
          Invite User
        </h2>
        <form onSubmit={handleInvite} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          {inviteMsg && (
            <div className={`rounded-lg px-4 py-3 text-sm ${
              inviteMsg.type === 'ok'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}>
              {inviteMsg.text}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Email</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                required
                placeholder="user@example.com"
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:border-red-500 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Role</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:border-red-500 focus:outline-none transition"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          {inviteRole === 'user' && (
            <div>
              <label className="block text-xs text-zinc-500 mb-2">Tool Access</label>
              <div className="flex flex-wrap gap-2">
                {ALL_TOOLS.map(tool => (
                  <button
                    key={tool}
                    type="button"
                    onClick={() => toggleTool(tool, inviteTools, setInviteTools)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      inviteTools.includes(tool)
                        ? 'bg-red-500/15 border-red-500/40 text-red-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600'
                    }`}
                  >
                    {tool}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={inviting}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition"
          >
            {inviting ? 'Sending...' : 'Send Invite'}
          </button>
        </form>
      </section>

      {/* Section B: Pending Invitations */}
      <section>
        <h2 className="font-[family-name:var(--font-bebas)] text-2xl uppercase tracking-wider text-white mb-4">
          Pending Invitations
        </h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {loadingInvites ? (
            <div className="p-6 text-center text-zinc-500 text-sm">Loading...</div>
          ) : invitations.length === 0 ? (
            <div className="p-6 text-center text-zinc-600 text-sm">No pending invitations</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase">
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Tools</th>
                  <th className="text-left px-4 py-3 font-medium">Invited</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map(inv => (
                  <tr key={inv.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-3 text-white">{inv.email}</td>
                    <td className="px-4 py-3">
                      <RoleBadge role={inv.role} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {inv.tools.map(t => (
                          <span key={t} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px]">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRevokeInvite(inv.id)}
                        className="text-xs text-red-400 hover:text-red-300 transition"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Section C: Active Users */}
      <section>
        <h2 className="font-[family-name:var(--font-bebas)] text-2xl uppercase tracking-wider text-white mb-4">
          Active Users
        </h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {loadingUsers ? (
            <div className="p-6 text-center text-zinc-500 text-sm">Loading...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase">
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Tools</th>
                  <th className="text-left px-4 py-3 font-medium">Last Sign-In</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-3">
                      <div className="text-white">{u.display_name || u.full_name || u.email}</div>
                      {(u.display_name || u.full_name) && (
                        <div className="text-xs text-zinc-500">{u.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === u.id ? (
                        <select
                          value={editRole}
                          onChange={e => setEditRole(e.target.value)}
                          className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-white focus:border-red-500 focus:outline-none"
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                          <option value="owner">owner</option>
                        </select>
                      ) : (
                        <RoleBadge role={u.role} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === u.id && editRole === 'user' ? (
                        <div className="flex flex-wrap gap-1">
                          {ALL_TOOLS.map(tool => (
                            <button
                              key={tool}
                              type="button"
                              onClick={() => toggleTool(tool, editTools, setEditTools)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition ${
                                editTools.includes(tool)
                                  ? 'bg-red-500/15 border-red-500/40 text-red-400'
                                  : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                              }`}
                            >
                              {tool}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.tools.map(t => (
                            <span key={t} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px]">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {u.last_sign_in_at
                        ? new Date(u.last_sign_in_at).toLocaleDateString()
                        : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingId === u.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleSaveEdit(u.id)}
                            disabled={saving}
                            className="text-xs text-emerald-400 hover:text-emerald-300 transition"
                          >
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-zinc-500 hover:text-zinc-300 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : deletingId === u.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-red-400">Delete?</span>
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="text-xs text-red-400 hover:text-red-300 font-medium transition"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="text-xs text-zinc-500 hover:text-zinc-300 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => handleResetPassword(u.email!)}
                            className="text-xs text-zinc-400 hover:text-zinc-200 transition"
                          >
                            Reset PW
                          </button>
                          <button
                            onClick={() => startEdit(u)}
                            className="text-xs text-zinc-400 hover:text-zinc-200 transition"
                          >
                            Edit
                          </button>
                          {u.role !== 'owner' && (
                            <button
                              onClick={() => setDeletingId(u.id)}
                              className="text-xs text-red-400 hover:text-red-300 transition"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    owner: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    admin: 'bg-red-500/15 text-red-400 border-red-500/30',
    user: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${colors[role] || colors.user}`}>
      {role}
    </span>
  )
}
