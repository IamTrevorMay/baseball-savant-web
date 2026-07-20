// Presentational biomech report — renders a BiomechReportPayload as the six-bucket
// Driveline layout (percentile bars + flags + kinetics placeholder). No hooks, no data
// fetching: reused by the admin preview (Phase 7) and the athlete Compete view (Phase 8).

import { METRIC_DEF_BY_KEY, bandFor } from '@/lib/mechanics/norms'
import { REPORT_BUCKETS, type BiomechReportPayload } from '@/lib/mechanics/reportPayload'
import type { AthleteLevel, MetricPercentile } from '@/lib/mechanics/types'

const fmt = (v: number, unit: string) => {
  if (!Number.isFinite(v)) return '—'
  if (unit === 's') return v.toFixed(3)
  if (Math.abs(v) >= 100) return Math.round(v).toString()
  return v.toFixed(1)
}

/** good = comfortably on the helpful side; flag = in the worse tail; watch = between. */
function status(p: MetricPercentile): 'good' | 'watch' | 'flag' {
  const favorable = p.higherIsBetter ? p.percentile : 100 - p.percentile
  if (favorable >= 55) return 'good'
  if (favorable >= 30) return 'watch'
  return 'flag'
}

const STATUS_COLOR: Record<string, string> = {
  good: 'bg-emerald-500', watch: 'bg-amber-500', flag: 'bg-rose-500',
}

function PercentileBar({ p, level }: { p: MetricPercentile; level: AthleteLevel }) {
  const def = METRIC_DEF_BY_KEY[p.key]
  const band = def ? bandFor(def, level) : null
  const st = status(p)
  const markerPct = Math.min(98, Math.max(2, p.percentile))
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[13px] text-zinc-300">
          {def?.label ?? p.key}
          {p.directional && (
            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-amber-500/80" title="Markerless proxy — directional, not absolute">
              directional
            </span>
          )}
        </span>
        <span className="text-[13px] tabular-nums text-white font-medium">
          {fmt(p.value, def?.unit ?? '')}<span className="text-zinc-500 text-[11px] ml-0.5">{def?.unit}</span>
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-zinc-800">
        {/* normal zone p25–p75 */}
        <div className="absolute top-0 h-2 rounded-full bg-zinc-700/70" style={{ left: '25%', width: '50%' }} />
        {/* p50 line */}
        <div className="absolute top-[-2px] h-3 w-px bg-zinc-500" style={{ left: '50%' }} />
        {/* value marker */}
        <div
          className={`absolute top-[-2px] h-3 w-1.5 rounded-full ${STATUS_COLOR[st]} ring-2 ring-zinc-950`}
          style={{ left: `calc(${markerPct}% - 3px)` }}
        />
      </div>
      <div className="flex justify-between mt-0.5 text-[10px] tabular-nums text-zinc-600">
        <span>{band ? fmt(band.p10, '') : ''}</span>
        <span className="text-zinc-500">{p.percentile}th pct</span>
        <span>{band ? fmt(band.p90, '') : ''}</span>
      </div>
    </div>
  )
}

function BucketTile({ title, percentiles, level }: {
  title: string; percentiles: MetricPercentile[]; level: AthleteLevel
}) {
  if (!percentiles.length) return null
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-blue-400 mb-1.5 uppercase tracking-wide">{title}</h3>
      <div className="divide-y divide-zinc-800/60">
        {percentiles.map(p => <PercentileBar key={p.key} p={p} level={level} />)}
      </div>
    </div>
  )
}

function FlagCard({ flag }: { flag: BiomechReportPayload['flags'][number] }) {
  return (
    <div className="bg-zinc-900 border border-rose-900/40 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-rose-300">{flag.intervention.title}</span>
        <span className="text-[11px] tabular-nums text-zinc-500">{flag.percentile}th pct · {flag.label}</span>
      </div>
      <p className="text-[12px] text-zinc-400 mb-2">{flag.intervention.rationale}</p>
      <div className="text-[12px] text-zinc-300 mb-1"><span className="text-zinc-500">Cue:</span> {flag.intervention.cue}</div>
      <div className="flex flex-wrap gap-1.5">
        {flag.intervention.drills.map(d => (
          <span key={d} className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">{d}</span>
        ))}
      </div>
    </div>
  )
}

function gradeColor(g: number): string {
  if (g >= 60) return 'text-emerald-400'
  if (g >= 40) return 'text-amber-400'
  return 'text-rose-400'
}

export default function BiomechReport({ payload }: { payload: BiomechReportPayload }) {
  const byKey = new Map(payload.percentiles.map(p => [p.key, p]))
  const level = payload.level

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="bg-gradient-to-br from-zinc-900 to-zinc-900/40 border border-zinc-800 rounded-xl p-5 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-blue-400 mb-1">Biomechanics Assessment</div>
          <h2 className="text-xl font-bold text-white">{payload.athleteName ?? 'Athlete'}</h2>
          <div className="text-[12px] text-zinc-500 mt-1">
            {payload.captureDate ?? '—'} · {level.toUpperCase()} · {payload.veloContext ?? 'context n/a'} · {payload.system}
          </div>
        </div>
        <div className="text-center">
          <div className={`text-4xl font-bold tabular-nums ${gradeColor(payload.movementGrade)}`}>{payload.movementGrade}</div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Movement Grade</div>
        </div>
      </div>

      {/* priority flags */}
      {payload.flags.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-2">Priority Flags → Prescriptions</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {payload.flags.map(f => <FlagCard key={f.key} flag={f} />)}
          </div>
        </div>
      )}

      {/* six buckets */}
      <div className="grid gap-4 md:grid-cols-2">
        {REPORT_BUCKETS.map(b => (
          <BucketTile
            key={b.key}
            title={b.title}
            level={level}
            percentiles={b.metrics.map(m => byKey.get(m)).filter(Boolean) as MetricPercentile[]}
          />
        ))}
      </div>

      {/* kinetics placeholder */}
      <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-zinc-400 mb-1 uppercase tracking-wide">Kinetics (Torque)</h3>
        <p className="text-[12px] text-zinc-500">
          Elbow varus / shoulder IR torque pending force plates + inverse dynamics (v2). Captury is
          kinematics-only — no validated N·m is reported. Rotational-shoulder metrics above are tagged
          <span className="text-amber-500/80"> directional</span> (markerless proxy).
        </p>
      </div>

      <div className="text-[11px] text-zinc-600">
        Throws used {payload.qc.throwsUsed}/{payload.qc.throwsDetected}
        {payload.qc.unmappedJoints.length > 0 && ` · unmapped joints: ${payload.qc.unmappedJoints.join(', ')}`}
      </div>
    </div>
  )
}
