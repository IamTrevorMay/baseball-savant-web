'use client'
import type { H2HRecord, ChaseRegion, CountProfile } from '@/lib/engines/types'

export function H2HTable({ rows }: { rows: H2HRecord[] }) {
  if (!rows.length) return <div className="text-zinc-600 text-xs py-4">No head-to-head data</div>
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="bg-zinc-800/50">
            <th className="px-3 py-1.5 text-left text-zinc-400 font-medium">Pitch</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">#</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">Whiff%</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">xwOBA</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">Avg EV</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">BA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-zinc-800/30 hover:bg-zinc-800/20">
              <td className="px-3 py-1.5 text-white">{r.pitch_name}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.pitches}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.whiff_pct?.toFixed(1) ?? '—'}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.xwoba?.toFixed(3) ?? '—'}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.avg_ev?.toFixed(1) ?? '—'}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.ba?.toFixed(3) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ChaseTable({ rows }: { rows: ChaseRegion[] }) {
  if (!rows.length) return <div className="text-zinc-600 text-xs py-4">No chase data</div>
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="bg-zinc-800/50">
            <th className="px-3 py-1.5 text-left text-zinc-400 font-medium">Region</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">#</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">Swing%</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">Whiff%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-zinc-800/30 hover:bg-zinc-800/20">
              <td className="px-3 py-1.5 text-white capitalize">{r.quadrant}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.pitches}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">
                {r.swing_pct != null ? (
                  <span className={r.swing_pct > 30 ? 'text-amber-400' : ''}>{r.swing_pct.toFixed(1)}</span>
                ) : '—'}
              </td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">
                {r.whiff_pct != null ? (
                  <span className={r.whiff_pct > 35 ? 'text-emerald-400' : ''}>{r.whiff_pct.toFixed(1)}</span>
                ) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CountTable({ rows }: { rows: CountProfile[] }) {
  if (!rows.length) return <div className="text-zinc-600 text-xs py-4">No count data</div>
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="bg-zinc-800/50">
            <th className="px-3 py-1.5 text-left text-zinc-400 font-medium">Count</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">#</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">Swing%</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">Avg EV</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">xwOBA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-zinc-800/30 hover:bg-zinc-800/20">
              <td className="px-3 py-1.5 text-white font-mono">{r.balls}-{r.strikes}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.pitches}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.swing_pct?.toFixed(1) ?? '—'}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.avg_ev?.toFixed(1) ?? '—'}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.xwoba?.toFixed(3) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
