'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowLeft, Save, Plus, Upload, Trash2, ChevronDown, ChevronRight, Users, X } from 'lucide-react'
import type { EmailProduct, EmailAudience, ProductBranding, ProductSchedule } from '@/lib/emailTypes'

/* ─── Timezone list (common US + international) ─────────────────────── */
const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu',
  'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Shanghai',
  'Australia/Sydney', 'UTC',
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface AudienceWithSubs extends EmailAudience {
  subscriber_count: number
  expanded?: boolean
  subscribers?: { subscriber_id: string; email: string; name: string | null; subscribed_at: string }[]
  loadingSubs?: boolean
}

export default function SettingsPage() {
  const { productId } = useParams<{ productId: string }>()
  const router = useRouter()

  /* ── Product state ──────────────────────────────────────────────── */
  const [product, setProduct] = useState<EmailProduct | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  // Branding fields
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#34d399')
  const [headerStyle, setHeaderStyle] = useState<'banner' | 'logo' | 'text'>('banner')
  const [logoUrl, setLogoUrl] = useState('')

  // Schedule fields
  const [cron, setCron] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')
  const [skipMonths, setSkipMonths] = useState<number[]>([])

  /* ── Audience state ─────────────────────────────────────────────── */
  const [audiences, setAudiences] = useState<AudienceWithSubs[]>([])
  const [loadingAudiences, setLoadingAudiences] = useState(true)
  const [newAudienceName, setNewAudienceName] = useState('')
  const [creatingAudience, setCreatingAudience] = useState(false)

  // Add single subscriber
  const [addSubAudienceId, setAddSubAudienceId] = useState<string | null>(null)
  const [addSubEmail, setAddSubEmail] = useState('')
  const [addSubName, setAddSubName] = useState('')
  const [addingSub, setAddingSub] = useState(false)

  // CSV import
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importAudienceId, setImportAudienceId] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; total: number } | null>(null)

  /* ── Fetch product ──────────────────────────────────────────────── */
  const loadProduct = useCallback(async () => {
    try {
      const res = await fetch(`/api/emails/products/${productId}`)
      if (!res.ok) return
      const json = await res.json()
      const p: EmailProduct = json.product
      setProduct(p)
      setName(p.name)
      setSlug(p.slug)
      setFromName(p.branding?.fromName || '')
      setFromEmail(p.branding?.fromEmail || '')
      setReplyTo(p.branding?.replyTo || '')
      setPrimaryColor(p.branding?.primaryColor || '#34d399')
      setHeaderStyle(p.branding?.headerStyle || 'banner')
      setLogoUrl(p.branding?.logoUrl || '')
      setCron(p.schedule?.cron || '')
      setTimezone(p.schedule?.timezone || 'America/New_York')
      setSkipMonths(p.schedule?.skipMonths || [])
    } finally {
      setLoading(false)
    }
  }, [productId])

  /* ── Fetch audiences ────────────────────────────────────────────── */
  const loadAudiences = useCallback(async () => {
    try {
      const res = await fetch(`/api/emails/audiences?product_id=${productId}`)
      if (!res.ok) return
      const json = await res.json()

      // Fetch subscriber counts in parallel
      const withCounts: AudienceWithSubs[] = await Promise.all(
        (json.audiences || []).map(async (a: EmailAudience) => {
          const cRes = await fetch(`/api/emails/audiences/${a.id}`)
          const cJson = cRes.ok ? await cRes.json() : {}
          return {
            ...a,
            subscriber_count: cJson.audience?.subscriber_count ?? 0,
          }
        })
      )
      setAudiences(withCounts)
    } finally {
      setLoadingAudiences(false)
    }
  }, [productId])

  useEffect(() => { loadProduct() }, [loadProduct])
  useEffect(() => { loadAudiences() }, [loadAudiences])

  /* ── Save product ───────────────────────────────────────────────── */
  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)

    const branding: ProductBranding = {
      primaryColor,
      headerStyle,
      fromName: fromName.trim(),
      fromEmail: fromEmail.trim(),
      replyTo: replyTo.trim() || undefined,
      logoUrl: logoUrl.trim() || undefined,
    }

    const schedule: ProductSchedule | null =
      product?.product_type === 'recurring' && cron.trim()
        ? { cron: cron.trim(), timezone, skipMonths: skipMonths.length > 0 ? skipMonths : undefined }
        : null

    const body: Record<string, unknown> = {
      name: name.trim(),
      slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      branding,
    }
    if (schedule !== null) body.schedule = schedule

    try {
      const res = await fetch(`/api/emails/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setSaveMsg('Saved')
        const json = await res.json()
        setProduct(json.product)
        setTimeout(() => setSaveMsg(null), 2000)
      } else {
        const json = await res.json()
        setSaveMsg(json.error || 'Save failed')
      }
    } catch {
      setSaveMsg('Network error')
    } finally {
      setSaving(false)
    }
  }

  /* ── Create audience ────────────────────────────────────────────── */
  async function handleCreateAudience() {
    if (!newAudienceName.trim()) return
    setCreatingAudience(true)
    try {
      const res = await fetch('/api/emails/audiences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAudienceName.trim(), product_id: productId }),
      })
      if (res.ok) {
        setNewAudienceName('')
        loadAudiences()
      }
    } finally {
      setCreatingAudience(false)
    }
  }

  /* ── Delete audience ────────────────────────────────────────────── */
  async function handleDeleteAudience(id: string) {
    if (!confirm('Delete this audience and all its subscribers?')) return
    await fetch(`/api/emails/audiences/${id}`, { method: 'DELETE' })
    loadAudiences()
  }

  /* ── Expand audience to show subscribers ────────────────────────── */
  async function toggleAudienceExpand(audienceId: string) {
    setAudiences(prev =>
      prev.map(a => {
        if (a.id !== audienceId) return a
        if (a.expanded) return { ...a, expanded: false }
        return { ...a, expanded: true, loadingSubs: true }
      })
    )

    // Fetch subscribers
    const res = await fetch(`/api/emails/audiences/${audienceId}/subscribers?limit=100`)
    if (res.ok) {
      const json = await res.json()
      setAudiences(prev =>
        prev.map(a =>
          a.id === audienceId
            ? { ...a, subscribers: json.subscribers || [], loadingSubs: false }
            : a
        )
      )
    } else {
      setAudiences(prev =>
        prev.map(a =>
          a.id === audienceId ? { ...a, loadingSubs: false } : a
        )
      )
    }
  }

  /* ── Add single subscriber ──────────────────────────────────────── */
  async function handleAddSubscriber(audienceId: string) {
    if (!addSubEmail.trim()) return
    setAddingSub(true)
    try {
      const res = await fetch(`/api/emails/audiences/${audienceId}/subscribers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addSubEmail.trim(), name: addSubName.trim() || undefined }),
      })
      if (res.ok) {
        setAddSubEmail('')
        setAddSubName('')
        setAddSubAudienceId(null)
        // Refresh audiences and expanded list
        loadAudiences()
        toggleAudienceExpand(audienceId)
      }
    } finally {
      setAddingSub(false)
    }
  }

  /* ── CSV import ─────────────────────────────────────────────────── */
  function startImport(audienceId: string) {
    setImportAudienceId(audienceId)
    setImportResult(null)
    fileInputRef.current?.click()
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !importAudienceId) return

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`/api/emails/audiences/${importAudienceId}/import`, {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        const json = await res.json()
        setImportResult({ imported: json.imported, skipped: json.skipped, total: json.total })
        loadAudiences()
      }
    } finally {
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /* ── Skip months toggle ─────────────────────────────────────────── */
  function toggleSkipMonth(month: number) {
    setSkipMonths(prev =>
      prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]
    )
  }

  /* ── Loading / Not found ────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12 text-center text-zinc-500 text-sm">
        Product not found.
      </div>
    )
  }

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Hidden file input for CSV import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.push(`/design/emails/${productId}`)}
          className="p-1.5 text-zinc-500 hover:text-zinc-200 transition rounded"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Settings</h1>
          <p className="text-xs text-zinc-500 mt-0.5">{product.name}</p>
        </div>
      </div>

      {/* ─── Branding Section ─────────────────────────────────────── */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-zinc-200 mb-5">Branding</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Product Name */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Product Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Slug</label>
            <input
              value={slug}
              onChange={e => setSlug(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* From Name */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">From Name</label>
            <input
              value={fromName}
              onChange={e => setFromName(e.target.value)}
              placeholder="Triton Baseball"
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* From Email */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">From Email</label>
            <input
              value={fromEmail}
              onChange={e => setFromEmail(e.target.value)}
              placeholder="hello@tritonapex.io"
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* Reply-To */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Reply-To</label>
            <input
              value={replyTo}
              onChange={e => setReplyTo(e.target.value)}
              placeholder="reply@tritonapex.io"
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* Primary Color */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Primary Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={e => setPrimaryColor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-zinc-700 bg-zinc-800 cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded"
              />
              <input
                value={primaryColor}
                onChange={e => setPrimaryColor(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 font-mono focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          {/* Header Style */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Header Style</label>
            <select
              value={headerStyle}
              onChange={e => setHeaderStyle(e.target.value as 'banner' | 'logo' | 'text')}
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:border-emerald-500/50"
            >
              <option value="banner">Banner</option>
              <option value="logo">Logo</option>
              <option value="text">Text</option>
            </select>
          </div>

          {/* Logo URL */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Logo URL</label>
            <input
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
            />
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-zinc-900 bg-emerald-400 rounded-lg hover:bg-emerald-300 transition disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save'}
          </button>
          {saveMsg && (
            <span className={`text-xs ${saveMsg === 'Saved' ? 'text-emerald-400' : 'text-red-400'}`}>
              {saveMsg}
            </span>
          )}
        </div>
      </section>

      {/* ─── Schedule Section (recurring only) ────────────────────── */}
      {product.product_type === 'recurring' && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-zinc-200 mb-5">Schedule</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {/* Cron expression */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Cron Expression</label>
              <input
                value={cron}
                onChange={e => setCron(e.target.value)}
                placeholder="0 15 * * *"
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
              />
              <p className="text-[10px] text-zinc-600 mt-1">
                Standard cron format: minute hour day-of-month month day-of-week. Example: &quot;0 15 * * *&quot; = daily at 3 PM.
              </p>
            </div>

            {/* Timezone */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Timezone</label>
              <select
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:border-emerald-500/50"
              >
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Skip months */}
          <div>
            <label className="block text-xs text-zinc-500 mb-2">Skip Months</label>
            <div className="flex flex-wrap gap-2">
              {MONTHS.map((m, i) => {
                const monthNum = i + 1
                const isSkipped = skipMonths.includes(monthNum)
                return (
                  <button
                    key={m}
                    onClick={() => toggleSkipMonth(monthNum)}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition ${
                      isSkipped
                        ? 'bg-red-500/15 text-red-400 border-red-500/30'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                    }`}
                  >
                    {m.slice(0, 3)}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-zinc-600 mt-1.5">
              Selected months will be skipped (no sends). Useful for off-season.
            </p>
          </div>
        </section>
      )}

      {/* ─── Audience Management Section ──────────────────────────── */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-zinc-200">Audiences</h2>
          <span className="text-xs text-zinc-600">{audiences.length} audience{audiences.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Import result banner */}
        {importResult && (
          <div className="mb-4 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-between">
            <span className="text-xs text-emerald-400">
              Imported {importResult.imported} of {importResult.total} rows ({importResult.skipped} skipped)
            </span>
            <button onClick={() => setImportResult(null)} className="text-zinc-500 hover:text-zinc-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Create audience form */}
        <div className="flex items-center gap-2 mb-5">
          <input
            value={newAudienceName}
            onChange={e => setNewAudienceName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateAudience() }}
            placeholder="New audience name..."
            className="flex-1 px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
          />
          <button
            onClick={handleCreateAudience}
            disabled={creatingAudience || !newAudienceName.trim()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
            Create
          </button>
        </div>

        {/* Audience list */}
        {loadingAudiences ? (
          <div className="text-center py-8">
            <div className="w-5 h-5 border-2 border-zinc-700 border-t-emerald-400 rounded-full animate-spin mx-auto" />
          </div>
        ) : audiences.length === 0 ? (
          <div className="text-center py-8 text-zinc-600 text-xs">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No audiences yet. Create one above.
          </div>
        ) : (
          <div className="space-y-2">
            {audiences.map(audience => (
              <div key={audience.id} className="border border-zinc-800 rounded-lg overflow-hidden">
                {/* Audience row */}
                <div className="flex items-center gap-3 px-4 py-3 bg-zinc-800/40 hover:bg-zinc-800/70 transition">
                  <button
                    onClick={() => toggleAudienceExpand(audience.id)}
                    className="text-zinc-500 hover:text-zinc-300 transition"
                  >
                    {audience.expanded
                      ? <ChevronDown className="w-4 h-4" />
                      : <ChevronRight className="w-4 h-4" />
                    }
                  </button>

                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-zinc-200 font-medium">{audience.name}</span>
                    <span className="ml-2 text-xs text-zinc-500">
                      {audience.subscriber_count} subscriber{audience.subscriber_count !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => startImport(audience.id)}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-zinc-400 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700 transition"
                    >
                      <Upload className="w-3 h-3" />
                      Import CSV
                    </button>
                    <button
                      onClick={() => setAddSubAudienceId(addSubAudienceId === audience.id ? null : audience.id)}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-zinc-400 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700 transition"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                    <button
                      onClick={() => handleDeleteAudience(audience.id)}
                      className="p-1 text-zinc-600 hover:text-red-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Add single subscriber form */}
                {addSubAudienceId === audience.id && (
                  <div className="px-4 py-3 bg-zinc-900 border-t border-zinc-800 flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] text-zinc-500 mb-1">Email</label>
                      <input
                        value={addSubEmail}
                        onChange={e => setAddSubEmail(e.target.value)}
                        placeholder="subscriber@example.com"
                        className="w-full px-2.5 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] text-zinc-500 mb-1">Name (optional)</label>
                      <input
                        value={addSubName}
                        onChange={e => setAddSubName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full px-2.5 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>
                    <button
                      onClick={() => handleAddSubscriber(audience.id)}
                      disabled={addingSub || !addSubEmail.trim()}
                      className="px-3 py-1.5 text-xs font-medium text-zinc-900 bg-emerald-400 rounded hover:bg-emerald-300 transition disabled:opacity-40"
                    >
                      {addingSub ? '...' : 'Add'}
                    </button>
                    <button
                      onClick={() => setAddSubAudienceId(null)}
                      className="p-1.5 text-zinc-500 hover:text-zinc-300 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Expanded subscriber list */}
                {audience.expanded && (
                  <div className="border-t border-zinc-800">
                    {audience.loadingSubs ? (
                      <div className="px-4 py-4 text-center">
                        <div className="w-4 h-4 border-2 border-zinc-700 border-t-emerald-400 rounded-full animate-spin mx-auto" />
                      </div>
                    ) : !audience.subscribers || audience.subscribers.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-zinc-600 text-center">
                        No subscribers yet.
                      </div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-zinc-800">
                              <th className="px-4 py-2 text-left text-zinc-500 font-medium">Email</th>
                              <th className="px-4 py-2 text-left text-zinc-500 font-medium">Name</th>
                              <th className="px-4 py-2 text-left text-zinc-500 font-medium">Subscribed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {audience.subscribers.map(sub => (
                              <tr key={sub.subscriber_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                                <td className="px-4 py-2 text-zinc-300 font-mono">{sub.email}</td>
                                <td className="px-4 py-2 text-zinc-400">{sub.name || '-'}</td>
                                <td className="px-4 py-2 text-zinc-500">
                                  {new Date(sub.subscribed_at).toLocaleDateString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
