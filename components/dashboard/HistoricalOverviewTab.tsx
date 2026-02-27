'use client'
import { useState } from 'react'
import type { LahmanBattingSeason, LahmanPitchingSeason } from '@/lib/lahman-stats'
import { formatIP, modernTeamCode } from '@/lib/lahman-stats'

interface Props {
  batting: LahmanBattingSeason[]
  pitching: LahmanPitchingSeason[]
}

type Mode = 'batting' | 'pitching'

const battingCols = [
  { k:'year', l:'Year' }, { k:'team_id', l:'Team' }, { k:'g', l:'G' }, { k:'pa', l:'PA' },
  { k:'ab', l:'AB' }, { k:'r', l:'R' }, { k:'h', l:'H' }, { k:'doubles', l:'2B' },
  { k:'triples', l:'3B' }, { k:'hr', l:'HR' }, { k:'rbi', l:'RBI' }, { k:'sb', l:'SB' },
  { k:'bb', l:'BB' }, { k:'so', l:'SO' }, { k:'ba', l:'BA' }, { k:'obp', l:'OBP' },
  { k:'slg', l:'SLG' }, { k:'ops', l:'OPS' },
]

const pitchingCols = [
  { k:'year', l:'Year' }, { k:'team_id', l:'Team' }, { k:'w', l:'W' }, { k:'l', l:'L' },
  { k:'era', l:'ERA' }, { k:'g', l:'G' }, { k:'gs', l:'GS' }, { k:'cg', l:'CG' },
  { k:'sho', l:'SHO' }, { k:'sv', l:'SV' }, { k:'ip', l:'IP' },
  { k:'h', l:'H' }, { k:'er', l:'ER' }, { k:'hr', l:'HR' }, { k:'bb', l:'BB' },
  { k:'so', l:'SO' }, { k:'whip', l:'WHIP' }, { k:'k9', l:'K/9' }, { k:'bb9', l:'BB/9' },
]

function fmt(v: any, d: number = 0): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return isNaN(n) ? String(v) : n.toFixed(d)
}

function cellColor(k: string, v: any): string {
  if (k === 'year' || k === 'team_id') return 'text-white font-medium'
  if (['g','pa','ab','gs','cg','sho'].includes(k)) return 'text-zinc-400'
  if (['ba','obp','slg','ops'].includes(k)) return 'text-rose-400'
  if (['hr','rbi','r','h','sb'].includes(k)) return 'text-zinc-300'
  if (['era','whip'].includes(k)) return 'text-cyan-400'
  if (['w','sv','so'].includes(k)) return 'text-emerald-400'
  if (['l','er','bb'].includes(k)) return 'text-red-400'
  if (['k9','bb9'].includes(k)) return 'text-amber-400'
  return 'text-zinc-300'
}

function careerTotals(rows: any[], cols: {k:string;l:string}[], isPitching: boolean): any {
  if (rows.length === 0) return null
  const totals: any = {}
  const rateFields = ['ba','obp','slg','ops','era','whip','k9','bb9']
  cols.forEach(c => {
    if (c.k === 'year') { totals[c.k] = 'Career'; return }
    if (c.k === 'team_id') { totals[c.k] = ''; return }
    const vals = rows.map(r => Number(r[c.k])).filter(v => !isNaN(v))
    if (vals.length === 0) { totals[c.k] = '—'; return }
    if (rateFields.includes(c.k)) {
      // Recompute rates from totals
      if (c.k === 'ba') {
        const h = rows.reduce((s, r) => s + (Number(r.h)||0), 0)
        const ab = rows.reduce((s, r) => s + (Number(r.ab)||0), 0)
        totals[c.k] = ab > 0 ? (h/ab).toFixed(3) : '—'
      } else if (c.k === 'obp') {
        const h = rows.reduce((s, r) => s + (Number(r.h)||0), 0)
        const bb = rows.reduce((s, r) => s + (Number(r.bb)||0), 0)
        const hbp = rows.reduce((s, r) => s + (Number(r.hbp)||0), 0)
        const ab = rows.reduce((s, r) => s + (Number(r.ab)||0), 0)
        const sf = rows.reduce((s, r) => s + (Number(r.sf)||0), 0)
        const denom = ab + bb + hbp + sf
        totals[c.k] = denom > 0 ? ((h+bb+hbp)/denom).toFixed(3) : '—'
      } else if (c.k === 'slg') {
        const h = rows.reduce((s, r) => s + (Number(r.h)||0), 0)
        const d = rows.reduce((s, r) => s + (Number(r.doubles)||0), 0)
        const t = rows.reduce((s, r) => s + (Number(r.triples)||0), 0)
        const hr = rows.reduce((s, r) => s + (Number(r.hr)||0), 0)
        const ab = rows.reduce((s, r) => s + (Number(r.ab)||0), 0)
        totals[c.k] = ab > 0 ? ((h+d+2*t+3*hr)/ab).toFixed(3) : '—'
      } else if (c.k === 'ops') {
        const obp = Number(totals.obp) || 0
        const slg = Number(totals.slg) || 0
        totals[c.k] = (obp + slg).toFixed(3)
      } else if (c.k === 'era') {
        const er = rows.reduce((s, r) => s + (Number(r.er)||0), 0)
        const ipouts = rows.reduce((s, r) => s + (Number(r.ipouts)||0), 0)
        totals[c.k] = ipouts > 0 ? (9*er/(ipouts/3)).toFixed(2) : '—'
      } else if (c.k === 'whip') {
        const bb = rows.reduce((s, r) => s + (Number(r.bb)||0), 0)
        const h = rows.reduce((s, r) => s + (Number(r.h)||0), 0)
        const ipouts = rows.reduce((s, r) => s + (Number(r.ipouts)||0), 0)
        totals[c.k] = ipouts > 0 ? ((bb+h)/(ipouts/3)).toFixed(2) : '—'
      } else if (c.k === 'k9') {
        const so = rows.reduce((s, r) => s + (Number(r.so)||0), 0)
        const ipouts = rows.reduce((s, r) => s + (Number(r.ipouts)||0), 0)
        totals[c.k] = ipouts > 0 ? (9*so/(ipouts/3)).toFixed(1) : '—'
      } else if (c.k === 'bb9') {
        const bb = rows.reduce((s, r) => s + (Number(r.bb)||0), 0)
        const ipouts = rows.reduce((s, r) => s + (Number(r.ipouts)||0), 0)
        totals[c.k] = ipouts > 0 ? (9*bb/(ipouts/3)).toFixed(1) : '—'
      }
    } else if (c.k === 'ip') {
      const ipouts = rows.reduce((s, r) => s + (Number(r.ipouts)||0), 0)
      totals[c.k] = formatIP(ipouts)
    } else {
      totals[c.k] = vals.reduce((a,b) => a+b, 0)
    }
  })
  return totals
}

export default function HistoricalOverviewTab({ batting, pitching }: Props) {
  const hasBatting = batting.length > 0
  const hasPitching = pitching.length > 0
  const defaultMode: Mode = hasPitching && !hasBatting ? 'pitching' : 'batting'
  const [mode, setMode] = useState<Mode>(defaultMode)

  const rows = mode === 'pitching'
    ? pitching.map(s => ({
        ...s,
        team_id: modernTeamCode(s.team_id),
        ip: s.ipouts != null ? formatIP(s.ipouts) : '—',
        era: s.era != null ? s.era.toFixed(2) : '—',
        whip: s.whip != null ? s.whip.toFixed(2) : '—',
        k9: s.k9 != null ? s.k9.toFixed(1) : '—',
        bb9: s.bb9 != null ? s.bb9.toFixed(1) : '—',
      }))
    : batting.map(s => ({
        ...s,
        team_id: modernTeamCode(s.team_id),
        ba: s.ba != null ? Number(s.ba).toFixed(3) : '—',
        obp: s.obp != null ? Number(s.obp).toFixed(3) : '—',
        slg: s.slg != null ? Number(s.slg).toFixed(3) : '—',
        ops: s.ops != null ? Number(s.ops).toFixed(3) : '—',
      }))

  const cols = mode === 'pitching' ? pitchingCols : battingCols
  const totals = careerTotals(rows, cols, mode === 'pitching')

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex gap-1">
            {hasBatting && (
              <button onClick={() => setMode('batting')}
                className={`px-3 py-1 rounded text-xs font-medium transition ${mode === 'batting' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                Batting
              </button>
            )}
            {hasPitching && (
              <button onClick={() => setMode('pitching')}
                className={`px-3 py-1 rounded text-xs font-medium transition ${mode === 'pitching' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                Pitching
              </button>
            )}
          </div>
          <span className="text-[11px] text-zinc-500">{rows.length} seasons</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                {cols.map(c => (
                  <th key={c.k} className="bg-zinc-800/50 px-3 py-2 text-zinc-500 font-medium whitespace-nowrap text-right first:text-left">{c.l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any, i: number) => (
                <tr key={i} className="border-t border-zinc-800/30 hover:bg-zinc-800/30 transition">
                  {cols.map(c => (
                    <td key={c.k} className={`px-3 py-2 whitespace-nowrap font-mono text-right first:text-left first:font-sans ${cellColor(c.k, r[c.k])}`}>
                      {r[c.k] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
              {totals && (
                <tr className="border-t-2 border-zinc-600 bg-zinc-800/40 font-semibold">
                  {cols.map(c => (
                    <td key={c.k} className={`px-3 py-2 whitespace-nowrap font-mono text-right first:text-left first:font-sans ${cellColor(c.k, totals[c.k])}`}>
                      {totals[c.k] ?? '—'}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
