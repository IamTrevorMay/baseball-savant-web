'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import BiomechReport from '@/components/mechanics/report/BiomechReport'
import { aggregateSession } from '@/lib/mechanics/metrics'
import { rankSession } from '@/lib/mechanics/percentile'
import { computeFlags } from '@/lib/mechanics/flags'
import { buildReportPayload } from '@/lib/mechanics/reportPayload'
import type { AthleteLevel, MetricBuckets, ThrowMetrics } from '@/lib/mechanics/types'

interface Athlete { id: string; name: string; team: string | null }
interface CaptureRow {
  id: string; athleteProfileId: string; athleteName: string; captureDate: string | null
  level: string; veloContext: string | null; status: string; throwCount: number; system: string
}
interface ThrowRow {
  id: string; throw_no: number; frame_foot_contact: number | null; frame_mer: number | null
  frame_release: number | null; event_confidence: number | null; metrics: MetricBuckets
  excluded: boolean; qc_flags: string[]
}

const LEVELS: AthleteLevel[] = ['youth', 'hs', 'college', 'pro']
const STATUS_STYLE: Record<string, string> = {
  ready: 'text-emerald-400 bg-emerald-500/10', processing: 'text-amber-400 bg-amber-500/10',
  failed: 'text-rose-400 bg-rose-500/10',
}

export default function MechanicsPage() {
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [captures, setCaptures] = useState<CaptureRow[]>([])
  const [view, setView] = useState<'browse' | 'detail'>('browse')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  const loadCaptures = useCallback(async () => {
    const r = await fetch('/api/mechanics/captures').then(r => r.json())
    setCaptures(r.captures ?? [])
  }, [])

  useEffect(() => {
    fetch('/api/compete/athletes').then(r => r.json()).then(d => {
      setAthletes((d.athletes ?? []).map((a: any) => ({
        id: a.id, name: a.profiles?.full_name ?? a.profiles?.email ?? 'Athlete', team: a.current_team ?? null,
      })))
    })
    loadCaptures()
  }, [loadCaptures])

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Mechanics Lab</h1>
          <p className="text-sm text-zinc-500">Captury / OptiTrack capture → assessment → Compete profile</p>
        </div>
        <button
          onClick={() => setShowUpload(s => !s)}
          className="text-sm px-4 py-2 rounded-lg bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 transition"
        >
          {showUpload ? 'Close' : '+ New Capture'}
        </button>
      </div>

      {showUpload && (
        <UploadPanel athletes={athletes} onDone={() => { setShowUpload(false); loadCaptures() }} />
      )}

      {view === 'browse' && (
        <SessionBrowser
          captures={captures}
          onOpen={(id) => { setSelectedId(id); setView('detail') }}
        />
      )}

      {view === 'detail' && selectedId && (
        <CaptureDetail
          captureId={selectedId}
          onBack={() => { setView('browse'); loadCaptures() }}
        />
      )}
    </div>
  )
}

// ── Upload ──────────────────────────────────────────────────────────────────
function UploadPanel({ athletes, onDone }: { athletes: Athlete[]; onDone: () => void }) {
  const [athleteId, setAthleteId] = useState('')
  const [date, setDate] = useState('')
  const [level, setLevel] = useState<AthleteLevel>('pro')
  const [velo, setVelo] = useState('max_effort')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function submit() {
    if (!athleteId || !file) { setMsg('Select an athlete and a C3D file.'); return }
    setBusy(true); setMsg(null)
    const fd = new FormData()
    fd.append('file', file); fd.append('athlete_id', athleteId)
    fd.append('capture_date', date); fd.append('level', level); fd.append('velo_context', velo)
    const res = await fetch('/api/mechanics/upload', { method: 'POST', body: fd })
    const data = await res.json()
    setBusy(false)
    if (data.error) { setMsg(data.error); return }
    setMsg(`Processed: ${data.throwsUsed}/${data.throwsDetected} throws used.`)
    setTimeout(onDone, 900)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
      <h2 className="text-sm font-semibold text-blue-400 mb-3 uppercase tracking-wide">New Capture</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-zinc-400">Athlete
          <select value={athleteId} onChange={e => setAthleteId(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
            <option value="">Select…</option>
            {athletes.map(a => <option key={a.id} value={a.id}>{a.name}{a.team ? ` · ${a.team}` : ''}</option>)}
          </select>
        </label>
        <label className="text-xs text-zinc-400">Capture date
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-zinc-400">Level
          <select value={level} onChange={e => setLevel(e.target.value as AthleteLevel)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
            {LEVELS.map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
          </select>
        </label>
        <label className="text-xs text-zinc-400">Velo context
          <input value={velo} onChange={e => setVelo(e.target.value)} placeholder="max_effort"
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-zinc-400 md:col-span-2">C3D file (Captury export)
          <input type="file" accept=".c3d" onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-sm text-zinc-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-blue-500/20 file:text-blue-300" />
        </label>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button onClick={submit} disabled={busy}
          className="text-sm px-4 py-2 rounded-lg bg-blue-500/20 text-blue-200 hover:bg-blue-500/30 disabled:opacity-50 transition">
          {busy ? 'Processing…' : 'Upload & Process'}
        </button>
        {msg && <span className="text-xs text-zinc-400">{msg}</span>}
      </div>
    </div>
  )
}

// ── Session browser ───────────────────────────────────────────────────────────
function SessionBrowser({ captures, onOpen }: { captures: CaptureRow[]; onOpen: (id: string) => void }) {
  if (!captures.length) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center text-zinc-500">
        No captures yet. Upload a Captury C3D export to begin.
      </div>
    )
  }
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-zinc-950/50 text-zinc-500 text-[11px] uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2.5">Athlete</th>
            <th className="text-left px-4 py-2.5">Date</th>
            <th className="text-left px-4 py-2.5">Level</th>
            <th className="text-left px-4 py-2.5">Context</th>
            <th className="text-right px-4 py-2.5">Throws</th>
            <th className="text-left px-4 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {captures.map(c => (
            <tr key={c.id} onClick={() => onOpen(c.id)} className="hover:bg-zinc-800/40 cursor-pointer">
              <td className="px-4 py-3 text-white">{c.athleteName}</td>
              <td className="px-4 py-3 text-zinc-400">{c.captureDate ?? '—'}</td>
              <td className="px-4 py-3 text-zinc-400">{c.level?.toUpperCase()}</td>
              <td className="px-4 py-3 text-zinc-400">{c.veloContext ?? '—'}</td>
              <td className="px-4 py-3 text-right tabular-nums text-zinc-300">{c.throwCount}</td>
              <td className="px-4 py-3">
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_STYLE[c.status] ?? 'text-zinc-400 bg-zinc-800'}`}>{c.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Capture detail (live report preview + generate) ──────────────────────────
function CaptureDetail({ captureId, onBack }: { captureId: string; onBack: () => void }) {
  const [capture, setCapture] = useState<CaptureRow | null>(null)
  const [throws, setThrows] = useState<ThrowRow[]>([])
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    const d = await fetch(`/api/mechanics/captures/${captureId}`).then(r => r.json())
    setCapture(d.capture); setThrows(d.throws ?? [])
  }, [captureId])

  useEffect(() => { load() }, [load])

  // Live preview payload — same pure libs the server uses on generate.
  const payload = useMemo(() => {
    if (!capture || !throws.length) return null
    const level = (capture.level ?? 'pro') as AthleteLevel
    const pool: ThrowMetrics[] = throws.filter(t => !t.excluded).map(t => ({
      throwNo: t.throw_no,
      events: { footContact: t.frame_foot_contact ?? 0, maxExternalRotation: t.frame_mer ?? 0, release: t.frame_release ?? 0, confidence: t.event_confidence ?? 1 },
      metrics: t.metrics, directionalKeys: [], qcFlags: t.qc_flags ?? [],
    }))
    const usable = pool.length ? pool : throws.map(t => ({
      throwNo: t.throw_no, events: { footContact: 0, maxExternalRotation: 0, release: 0, confidence: 1 },
      metrics: t.metrics, directionalKeys: [], qcFlags: [],
    }))
    const sessionMetrics = aggregateSession(usable)
    const percentiles = rankSession(sessionMetrics, level)
    const flags = computeFlags(percentiles)
    return buildReportPayload(
      { sessionMetrics, percentiles, flags, qc: { unmappedJoints: [], throwsDetected: throws.length, throwsUsed: usable.length } },
      { captureId, captureDate: capture.captureDate, level, veloContext: capture.veloContext, system: capture.system, athleteName: capture.athleteName },
    )
  }, [capture, throws, captureId])

  async function generate() {
    setGenerating(true); setResult(null)
    const d = await fetch('/api/mechanics/report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ captureId }),
    }).then(r => r.json())
    setGenerating(false)
    setResult(d.error ? d.error : `Published to Compete · grade ${d.movementGrade}${d.pdfUrl ? '' : ''}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-sm text-zinc-400 hover:text-white">← Back to sessions</button>
        <div className="flex items-center gap-3">
          {result && <span className="text-xs text-emerald-400">{result}</span>}
          <button onClick={generate} disabled={generating || !throws.length}
            className="text-sm px-4 py-2 rounded-lg bg-blue-500/20 text-blue-200 hover:bg-blue-500/30 disabled:opacity-50 transition">
            {generating ? 'Publishing…' : 'Generate & Publish Report'}
          </button>
        </div>
      </div>

      {payload && <BiomechReport payload={payload} />}

      {/* per-throw table */}
      <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 text-[11px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800">Throws ({throws.length})</div>
        <table className="w-full text-sm">
          <thead className="text-zinc-500 text-[11px]">
            <tr>
              <th className="text-left px-4 py-2">#</th>
              <th className="text-right px-4 py-2">FC</th>
              <th className="text-right px-4 py-2">MER</th>
              <th className="text-right px-4 py-2">Rel</th>
              <th className="text-right px-4 py-2">Conf</th>
              <th className="text-right px-4 py-2">Stride %</th>
              <th className="text-right px-4 py-2">HS Sep</th>
              <th className="text-left px-4 py-2">QC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {throws.map(t => (
              <tr key={t.id} className={t.excluded ? 'opacity-40' : ''}>
                <td className="px-4 py-2 text-zinc-300">{t.throw_no}</td>
                <td className="px-4 py-2 text-right tabular-nums text-zinc-400">{t.frame_foot_contact ?? '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums text-zinc-400">{t.frame_mer ?? '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums text-zinc-400">{t.frame_release ?? '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums text-zinc-400">{t.event_confidence != null ? t.event_confidence.toFixed(2) : '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums text-zinc-400">{t.metrics?.lowerBody?.strideLengthPct != null && Number.isFinite(t.metrics.lowerBody.strideLengthPct) ? t.metrics.lowerBody.strideLengthPct.toFixed(1) : '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums text-zinc-400">{t.metrics?.hipShoulderSep?.maxSeparation != null && Number.isFinite(t.metrics.hipShoulderSep.maxSeparation) ? t.metrics.hipShoulderSep.maxSeparation.toFixed(0) : '—'}</td>
                <td className="px-4 py-2 text-[11px] text-zinc-500">{(t.qc_flags ?? []).join(', ') || (t.excluded ? 'excluded' : 'ok')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
