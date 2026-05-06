'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Mail, MoreVertical, Calendar, Users, BarChart3 } from 'lucide-react'
import type { EmailProduct } from '@/lib/emailTypes'

export default function EmailsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<EmailProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', product_type: 'recurring' as 'recurring' | 'campaign' })
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/emails/products')
    if (res.ok) {
      const json = await res.json()
      setProducts(json.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!form.name.trim() || !form.slug.trim()) return
    setCreating(true)
    const res = await fetch('/api/emails/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        product_type: form.product_type,
        branding: {
          primaryColor: '#34d399',
          headerStyle: 'banner',
          fromName: form.name.trim(),
          fromEmail: 'hello@tritonapex.io',
        },
      }),
    })
    if (res.ok) {
      setForm({ name: '', slug: '', product_type: 'recurring' })
      setShowCreate(false)
      load()
    }
    setCreating(false)
  }

  async function handleDelete(id: string) {
    setMenuOpen(null)
    await fetch(`/api/emails/products/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Emails</h1>
          <p className="text-sm text-zinc-500 mt-1">Create and manage email products, templates, and audiences</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition"
        >
          <Plus className="w-4 h-4" />
          New Product
        </button>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div className="mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-zinc-200 mb-4">Create Email Product</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Name</label>
              <input
                value={form.name}
                onChange={e => {
                  setForm(f => ({
                    ...f,
                    name: e.target.value,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
                  }))
                }}
                placeholder="Mayday Daily"
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Slug</label>
              <input
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                placeholder="mayday-daily"
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Type</label>
              <select
                value={form.product_type}
                onChange={e => setForm(f => ({ ...f, product_type: e.target.value as 'recurring' | 'campaign' }))}
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="recurring">Recurring</option>
                <option value="campaign">Campaign</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !form.name.trim()}
              className="px-4 py-1.5 text-sm font-medium text-zinc-900 bg-emerald-400 rounded-lg hover:bg-emerald-300 transition disabled:opacity-40"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Product grid */}
      {loading ? (
        <div className="text-center py-16">
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-emerald-400 rounded-full animate-spin mx-auto" />
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <Mail className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No email products yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map(p => (
            <div
              key={p.id}
              className="group relative bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-indigo-600/50 hover:bg-zinc-800/60 transition cursor-pointer"
              onClick={() => router.push(`/design/emails/${p.id}`)}
            >
              {/* Menu */}
              <div className="absolute top-3 right-3" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setMenuOpen(menuOpen === p.id ? null : p.id)}
                  className="p-1 text-zinc-600 hover:text-zinc-300 transition rounded"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {menuOpen === p.id && (
                  <div className="absolute right-0 mt-1 w-36 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-10 py-1">
                    <button
                      onClick={() => { setMenuOpen(null); router.push(`/design/emails/${p.id}/settings`) }}
                      className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition"
                    >
                      Settings
                    </button>
                    <button
                      onClick={() => { setMenuOpen(null); router.push(`/design/emails/${p.id}/analytics`) }}
                      className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition"
                    >
                      Analytics
                    </button>
                    <button
                      onClick={() => { setMenuOpen(null); router.push(`/design/emails/${p.id}/sends`) }}
                      className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition"
                    >
                      Send History
                    </button>
                    <hr className="border-zinc-700 my-1" />
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-700 transition"
                    >
                      Deactivate
                    </button>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex items-start gap-3 mb-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: (p.branding?.primaryColor || '#34d399') + '20' }}
                >
                  <Mail className="w-4 h-4" style={{ color: p.branding?.primaryColor || '#34d399' }} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-indigo-300 transition truncate">
                    {p.name}
                  </h3>
                  <p className="text-[10px] text-zinc-600 mt-0.5">/{p.slug}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-[10px] text-zinc-500 mt-auto">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {p.product_type === 'recurring' ? 'Recurring' : 'Campaign'}
                </span>
                {p.schedule?.cron && (
                  <span className="flex items-center gap-1">
                    <BarChart3 className="w-3 h-3" />
                    Scheduled
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  Active
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide ${
                  p.product_type === 'recurring'
                    ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'
                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                }`}>
                  {p.product_type}
                </span>
                <span className="text-[10px] text-zinc-600 group-hover:text-indigo-500/60 transition">
                  Open &rarr;
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
