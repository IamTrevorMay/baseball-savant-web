'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import Papa from 'papaparse'
import { getPitchColor } from '@/components/chartConfig'
import { PitchRow, parseCsvRow } from '@/lib/compete/pitchSchema'

/* ── TrackMan pitch type colors (overrides for names not in chartConfig) ── */
const TM_COLORS: Record<string, string> = {
  Fastball: '#ef4444', Sinker: '#f97316', Cutter: '#eab308',
  Curveball: '#22c55e', Slider: '#3b82f6', Sweeper: '#8b5cf6',
  ChangeUp: '#ec4899', Knuckleball: '#6b7280', Splitter: '#14b8a6',
}

function pitchColor(name: string): string {
  return TM_COLORS[name] || getPitchColor(name) || '#71717a'
}

type SessionFilter = 'All' | 'Warmup' | 'Live'

interface SessionSummary {
  id: string
  uploaded_by: string
  uploaded_at: string
  source: string
  file_name: string | null
  session_date: string | null
  tm_session_id: string | null
  pitch_count: number
  uploader_name: string
}

/* ── Helpers ── */
function avg(vals: (number | null)[]): number | null {
  const valid = vals.filter((v): v is number => v !== null)
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null
}

function max(vals: (number | null)[]): number | null {
  const valid = vals.filter((v): v is number => v !== null)
  return valid.length ? Math.max(...valid) : null
}

function modeTilt(vals: string[]): string {
  const valid = vals.filter(v => v && v.includes(':'))
  if (!valid.length) return '—'
  const counts: Record<string, number> = {}
  for (const v of valid) counts[v] = (counts[v] || 0) + 1
  let best = valid[0], bestN = 0
  for (const [k, n] of Object.entries(counts)) {
    if (n > bestN) { best = k; bestN = n }
  }
  return best
}

function fmt(v: number | null, dec: number): string {
  if (v === null) return '—'
  return v.toFixed(dec)
}

function fmtDateShort(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/* ── Component ── */
export default function PerformancePage() {
  const [rows, setRows] = useState<PitchRow[]>([])
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [pitcher, setPitcher] = useState<string>('__all__')
  const [session, setSession] = useState<SessionFilter>('All')
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loadingPitches, setLoadingPitches] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /* ── Load sessions list on mount ── */
  const refreshSessions = useCallback(async (): Promise<SessionSummary[]> => {
    try {
      const res = await fetch('/api/compete/performance/sessions')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load sessions')
      setSessions(json.sessions || [])
      setIsAdmin(!!json.isAdmin)
      return json.sessions || []
    } catch (e: any) {
      setError(e.message)
      return []
    }
  }, [])

  useEffect(() => {
    refreshSessions()
  }, [refreshSessions])

  /* ── Load pitches for the selected session ── */
  const loadSession = useCallback(async (sessionId: string) => {
    setLoadingPitches(true)
    setError(null)
    try {
      const res = await fetch(`/api/compete/performance/pitches?session_id=${sessionId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load pitches')
      setRows(json.rows || [])
      setSelectedSessionId(sessionId)
      setPitcher('__all__')
      setSession('All')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoadingPitches(false)
    }
  }, [])

  /* ── Handle CSV upload: parse → POST → reload ── */
  const handleFile = useCallback((file: File) => {
    setUploading(true)
    setError(null)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result: any) => {
        const parsed: PitchRow[] = result.data.map((r: any) => parseCsvRow(r))
        try {
          const res = await fetch('/api/compete/performance/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name, rows: parsed }),
          })
          const json = await res.json()
          if (!res.ok) throw new Error(json.error || 'Upload failed')
          await refreshSessions()
          await loadSession(json.sessionId)
        } catch (e: any) {
          setError(e.message)
        } finally {
          setUploading(false)
        }
      },
      error: (err: any) => {
        setError(err.message)
        setUploading(false)
      },
    })
  }, [refreshSessions, loadSession])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.name.endsWith('.csv')) handleFile(file)
  }, [handleFile])

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  /* ── Derived data ── */
  const pitchers = useMemo(() => {
    const set = new Set(rows.map(r => r.Pitcher).filter(Boolean))
    return [...set].sort()
  }, [rows])

  const pitchSessions = useMemo(() => {
    const set = new Set(rows.map(r => r.PitchSession).filter(Boolean))
    return [...set]
  }, [rows])

  const filtered = useMemo(() => {
    let data = rows
    if (pitcher !== '__all__') data = data.filter(r => r.Pitcher === pitcher)
    if (session === 'Warmup') data = data.filter(r => /warmup/i.test(r.PitchSession))
    else if (session === 'Live') data = data.filter(r => !/warmup/i.test(r.PitchSession))
    return data
  }, [rows, pitcher, session])

  const selectedSession = useMemo(
    () => sessions.find(s => s.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  )

  interface TypeRow {
    name: string; count: number
    velo: number | null; maxVelo: number | null
    spin: number | null; tilt: string
    ivb: number | null; hb: number | null; vaa: number | null
    relH: number | null; relS: number | null; ext: number | null
    spinEff: number | null
  }

  const tableRows = useMemo((): TypeRow[] => {
    const byType: Record<string, PitchRow[]> = {}
    for (const r of filtered) {
      const key = r.TaggedPitchType || 'Untagged'
      ;(byType[key] ||= []).push(r)
    }
    return Object.entries(byType)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([name, pitches]) => ({
        name,
        count: pitches.length,
        velo: avg(pitches.map(p => p.RelSpeed)),
        maxVelo: max(pitches.map(p => p.RelSpeed)),
        spin: avg(pitches.map(p => p.SpinRate)),
        tilt: modeTilt(pitches.map(p => p.Tilt)),
        ivb: avg(pitches.map(p => p.InducedVertBreak)),
        hb: avg(pitches.map(p => p.HorzBreak)),
        vaa: avg(pitches.map(p => p.VertApprAngle)),
        relH: avg(pitches.map(p => p.RelHeight)),
        relS: avg(pitches.map(p => p.RelSide)),
        ext: avg(pitches.map(p => p.Extension)),
        spinEff: avg(pitches.map(p => p.SpinAxis3dSpinEfficiency)),
      }))
  }, [filtered])

  const totalsRow = useMemo((): TypeRow | null => {
    if (!tableRows.length) return null
    const allPitches = filtered
    return {
      name: 'Total',
      count: allPitches.length,
      velo: avg(allPitches.map(p => p.RelSpeed)),
      maxVelo: max(allPitches.map(p => p.RelSpeed)),
      spin: avg(allPitches.map(p => p.SpinRate)),
      tilt: '',
      ivb: avg(allPitches.map(p => p.InducedVertBreak)),
      hb: avg(allPitches.map(p => p.HorzBreak)),
      vaa: avg(allPitches.map(p => p.VertApprAngle)),
      relH: avg(allPitches.map(p => p.RelHeight)),
      relS: avg(allPitches.map(p => p.RelSide)),
      ext: avg(allPitches.map(p => p.Extension)),
      spinEff: avg(allPitches.map(p => p.SpinAxis3dSpinEfficiency)),
    }
  }, [tableRows, filtered])

  /* ── UI ── */
  const dropzone = (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`bg-zinc-900 border rounded-xl p-12 flex flex-col items-center justify-center transition ${
        uploading ? 'cursor-wait opacity-70' : 'cursor-pointer'
      } ${dragOver ? 'border-amber-500 bg-amber-500/5' : 'border-dashed border-zinc-700 hover:border-zinc-500'}`}
    >
      <svg className="w-10 h-10 text-zinc-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 16V4m0 0L8 8m4-4l4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" />
      </svg>
      <p className="text-zinc-400 text-sm font-medium">
        {uploading ? 'Uploading…' : 'Drop a TrackMan CSV'}
      </p>
      <p className="text-zinc-600 text-xs mt-1">
        {uploading ? 'Parsing and saving to the database' : 'or click to browse'}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        onChange={onFileInput}
        className="hidden"
        disabled={uploading}
      />
    </div>
  )

  /* ── Empty state (no session loaded) ── */
  if (!rows.length && !loadingPitches) {
    return (
      <div className="max-w-3xl mx-auto p-6 mt-8 space-y-6">
        {dropzone}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {sessions.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                {isAdmin ? 'All sessions' : 'Your sessions'}
              </h2>
              <span className="text-[10px] text-zinc-600">{sessions.length} total</span>
            </div>
            <ul className="divide-y divide-zinc-800/80">
              {sessions.map(s => (
                <li key={s.id}>
                  <button
                    onClick={() => loadSession(s.id)}
                    className="w-full text-left px-4 py-3 hover:bg-zinc-800/40 transition flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm text-white">
                        {s.file_name || s.tm_session_id || s.id.slice(0, 8)}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        {isAdmin && <span className="text-zinc-400">{s.uploader_name} · </span>}
                        {s.session_date || fmtDateShort(s.uploaded_at)} · {s.pitch_count} pitches
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  /* ── Data loaded ── */
  const hasSessionTypes = pitchSessions.some(s => /warmup/i.test(s))
  const sessionFilters: SessionFilter[] = hasSessionTypes ? ['All', 'Warmup', 'Live'] : ['All']

  return (
    <div className="max-w-6xl mx-auto p-6 mt-4 space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Session picker */}
        {sessions.length > 0 && (
          <select
            value={selectedSessionId || ''}
            onChange={e => e.target.value && loadSession(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-1.5 text-sm max-w-xs truncate"
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {isAdmin ? `${s.uploader_name} · ` : ''}
                {s.file_name || s.tm_session_id || s.id.slice(0, 8)}
                {' — '}
                {s.session_date || fmtDateShort(s.uploaded_at)}
                {' · '}
                {s.pitch_count}p
              </option>
            ))}
          </select>
        )}

        {/* Pitcher selector */}
        {pitchers.length > 1 && (
          <select
            value={pitcher}
            onChange={e => setPitcher(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="__all__">All Pitchers</option>
            {pitchers.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}

        {/* Warmup/Live toggle */}
        {sessionFilters.length > 1 && (
          <div className="bg-zinc-800 rounded-lg p-0.5 flex">
            {sessionFilters.map(s => (
              <button
                key={s}
                onClick={() => setSession(s)}
                className={`px-3 py-1 text-xs rounded-md transition ${
                  session === s ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
          <span>{filtered.length} pitches</span>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="text-zinc-400 hover:text-white transition disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : '+ Upload new CSV'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            onChange={onFileInput}
            className="hidden"
            disabled={uploading}
          />
          <button
            onClick={() => { setRows([]); setSelectedSessionId(null); setPitcher('__all__'); setSession('All') }}
            className="text-zinc-600 hover:text-zinc-400 transition"
          >
            Back
          </button>
        </div>
      </div>

      {selectedSession && isAdmin && (
        <div className="text-[11px] text-zinc-500">
          Uploaded by <span className="text-zinc-300">{selectedSession.uploader_name}</span>
          {selectedSession.session_date && <> · {selectedSession.session_date}</>}
          {' · '}source: {selectedSession.source}
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Arsenal Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-2 px-3 font-medium">Pitch Type</th>
                <th className="text-right py-2 px-2 font-medium">#</th>
                <th className="text-right py-2 px-2 font-medium">Velo</th>
                <th className="text-right py-2 px-2 font-medium">Max</th>
                <th className="text-right py-2 px-2 font-medium">Spin</th>
                <th className="text-right py-2 px-2 font-medium">Tilt</th>
                <th className="text-right py-2 px-2 font-medium">IVB</th>
                <th className="text-right py-2 px-2 font-medium">HB</th>
                <th className="text-right py-2 px-2 font-medium">VAA</th>
                <th className="text-right py-2 px-2 font-medium">RelH</th>
                <th className="text-right py-2 px-2 font-medium">RelS</th>
                <th className="text-right py-2 px-2 font-medium">Ext</th>
                <th className="text-right py-2 px-2 font-medium">SpinEff</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map(row => (
                <tr key={row.name} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td className="py-2 px-3">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: pitchColor(row.name) }} />
                      <span className="text-white">{row.name}</span>
                    </span>
                  </td>
                  <td className="text-right py-2 px-2 text-zinc-400 font-mono">{row.count}</td>
                  <td className="text-right py-2 px-2 text-white font-mono">{fmt(row.velo, 1)}</td>
                  <td className="text-right py-2 px-2 text-white font-mono">{fmt(row.maxVelo, 1)}</td>
                  <td className="text-right py-2 px-2 text-white font-mono">{fmt(row.spin, 0)}</td>
                  <td className="text-right py-2 px-2 text-white font-mono">{row.tilt || '—'}</td>
                  <td className="text-right py-2 px-2 text-white font-mono">{fmt(row.ivb, 1)}</td>
                  <td className="text-right py-2 px-2 text-white font-mono">{fmt(row.hb, 1)}</td>
                  <td className="text-right py-2 px-2 text-white font-mono">{fmt(row.vaa, 1)}</td>
                  <td className="text-right py-2 px-2 text-white font-mono">{fmt(row.relH, 2)}</td>
                  <td className="text-right py-2 px-2 text-white font-mono">{fmt(row.relS, 2)}</td>
                  <td className="text-right py-2 px-2 text-white font-mono">{fmt(row.ext, 2)}</td>
                  <td className="text-right py-2 px-2 text-white font-mono">{row.spinEff !== null ? `${fmt(row.spinEff, 0)}%` : '—'}</td>
                </tr>
              ))}

              {totalsRow && (
                <tr className="border-t border-zinc-700 bg-zinc-800/20">
                  <td className="py-2 px-3 text-zinc-400 font-medium">Total</td>
                  <td className="text-right py-2 px-2 text-zinc-400 font-mono">{totalsRow.count}</td>
                  <td className="text-right py-2 px-2 text-zinc-400 font-mono">{fmt(totalsRow.velo, 1)}</td>
                  <td className="text-right py-2 px-2 text-zinc-400 font-mono">{fmt(totalsRow.maxVelo, 1)}</td>
                  <td className="text-right py-2 px-2 text-zinc-400 font-mono">{fmt(totalsRow.spin, 0)}</td>
                  <td className="text-right py-2 px-2 text-zinc-400 font-mono">—</td>
                  <td className="text-right py-2 px-2 text-zinc-400 font-mono">{fmt(totalsRow.ivb, 1)}</td>
                  <td className="text-right py-2 px-2 text-zinc-400 font-mono">{fmt(totalsRow.hb, 1)}</td>
                  <td className="text-right py-2 px-2 text-zinc-400 font-mono">{fmt(totalsRow.vaa, 1)}</td>
                  <td className="text-right py-2 px-2 text-zinc-400 font-mono">{fmt(totalsRow.relH, 2)}</td>
                  <td className="text-right py-2 px-2 text-zinc-400 font-mono">{fmt(totalsRow.relS, 2)}</td>
                  <td className="text-right py-2 px-2 text-zinc-400 font-mono">{fmt(totalsRow.ext, 2)}</td>
                  <td className="text-right py-2 px-2 text-zinc-400 font-mono">{totalsRow.spinEff !== null ? `${fmt(totalsRow.spinEff, 0)}%` : '—'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
