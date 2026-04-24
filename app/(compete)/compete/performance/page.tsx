'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import Papa from 'papaparse'
import { getPitchColor } from '@/components/chartConfig'

/* ── TrackMan pitch type colors (overrides for names not in chartConfig) ── */
const TM_COLORS: Record<string, string> = {
  Fastball: '#ef4444', Sinker: '#f97316', Cutter: '#eab308',
  Curveball: '#22c55e', Slider: '#3b82f6', Sweeper: '#8b5cf6',
  ChangeUp: '#ec4899', Knuckleball: '#6b7280', Splitter: '#14b8a6',
}

function pitchColor(name: string): string {
  return TM_COLORS[name] || getPitchColor(name) || '#71717a'
}

/* ── Types ── */
interface PitchRow {
  PitchNo: number
  Pitcher: string
  TaggedPitchType: string
  RelSpeed: number | null
  SpinRate: number | null
  Tilt: string
  InducedVertBreak: number | null
  HorzBreak: number | null
  VertApprAngle: number | null
  RelHeight: number | null
  RelSide: number | null
  Extension: number | null
  SpinAxis3dSpinEfficiency: number | null
  PitchSession: string
}

type SessionFilter = 'All' | 'Warmup' | 'Live'

/* ── Helpers ── */
function num(v: unknown): number | null {
  if (v === '' || v === undefined || v === null) return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function avg(vals: (number | null)[]): number | null {
  const valid = vals.filter((v): v is number => v !== null)
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null
}

function max(vals: (number | null)[]): number | null {
  const valid = vals.filter((v): v is number => v !== null)
  return valid.length ? Math.max(...valid) : null
}

/** Mode of clock-face tilt strings like "12:30", "1:15" */
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

/* ── Component ── */
export default function PerformancePage() {
  const [rows, setRows] = useState<PitchRow[]>([])
  const [fileName, setFileName] = useState('')
  const [pitcher, setPitcher] = useState<string>('__all__')
  const [session, setSession] = useState<SessionFilter>('All')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    setFileName(file.name)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(result) {
        const parsed: PitchRow[] = result.data.map((r: any) => ({
          PitchNo: Number(r.PitchNo) || 0,
          Pitcher: (r.Pitcher || '').trim(),
          TaggedPitchType: (r.TaggedPitchType || '').trim(),
          RelSpeed: num(r.RelSpeed),
          SpinRate: num(r.SpinRate),
          Tilt: (r.Tilt || '').trim(),
          InducedVertBreak: num(r.InducedVertBreak),
          HorzBreak: num(r.HorzBreak),
          VertApprAngle: num(r.VertApprAngle),
          RelHeight: num(r.RelHeight),
          RelSide: num(r.RelSide),
          Extension: num(r.Extension),
          SpinAxis3dSpinEfficiency: num(r.SpinAxis3dSpinEfficiency),
          PitchSession: (r.PitchSession || '').trim(),
        }))
        setRows(parsed)
        // Default to first pitcher
        const pitchers = [...new Set(parsed.map(r => r.Pitcher).filter(Boolean))]
        if (pitchers.length === 1) setPitcher(pitchers[0])
        else setPitcher('__all__')
      },
    })
  }, [])

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

  const sessions = useMemo(() => {
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

  const sessionDate = useMemo(() => {
    // Try to extract date from filename like "2025-01-15..." or first row
    const m = fileName.match(/(\d{4}[-_]\d{2}[-_]\d{2})/)
    return m ? m[1].replace(/_/g, '-') : null
  }, [fileName])

  /* ── Build table rows ── */
  interface TypeRow {
    name: string
    count: number
    velo: number | null
    maxVelo: number | null
    spin: number | null
    tilt: string
    ivb: number | null
    hb: number | null
    vaa: number | null
    relH: number | null
    relS: number | null
    ext: number | null
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

  /* ── Upload state ── */
  if (!rows.length) {
    return (
      <div className="max-w-3xl mx-auto p-6 mt-8">
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`bg-zinc-900 border rounded-xl p-16 flex flex-col items-center justify-center cursor-pointer transition ${
            dragOver ? 'border-amber-500 bg-amber-500/5' : 'border-dashed border-zinc-700 hover:border-zinc-500'
          }`}
        >
          <svg className="w-10 h-10 text-zinc-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 16V4m0 0L8 8m4-4l4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" />
          </svg>
          <p className="text-zinc-400 text-sm font-medium">Drop a TrackMan CSV</p>
          <p className="text-zinc-600 text-xs mt-1">or click to browse</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            onChange={onFileInput}
            className="hidden"
          />
        </div>
      </div>
    )
  }

  /* ── Data loaded ── */
  const hasSessionTypes = sessions.some(s => /warmup/i.test(s))
  const sessionFilters: SessionFilter[] = hasSessionTypes ? ['All', 'Warmup', 'Live'] : ['All']

  return (
    <div className="max-w-6xl mx-auto p-6 mt-4 space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-4 flex-wrap">
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

        {/* Session filter */}
        {sessionFilters.length > 1 && (
          <div className="bg-zinc-800 rounded-lg p-0.5 flex">
            {sessionFilters.map(s => (
              <button
                key={s}
                onClick={() => setSession(s)}
                className={`px-3 py-1 text-xs rounded-md transition ${
                  session === s
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Session info */}
        <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
          {sessionDate && <span>{sessionDate}</span>}
          <span>{filtered.length} pitches</span>
          <button
            onClick={() => { setRows([]); setFileName(''); setPitcher('__all__'); setSession('All') }}
            className="text-zinc-600 hover:text-zinc-400 transition"
          >
            Clear
          </button>
        </div>
      </div>

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

              {/* Totals row */}
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
