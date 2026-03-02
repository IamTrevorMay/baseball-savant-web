'use client'
import { RiskGauge } from './RiskGauge'
import Plot from '@/components/PlotWrapper'
import { COLORS, BASE_LAYOUT } from '@/components/chartConfig'
import type { PURIOutput } from '@/lib/engines/types'
import Tip from '@/components/Tip'

interface RiskDashboardProps {
  result: PURIOutput
  pitcherName: string
  season: number
}

const ACWR_COLORS: Record<string, string> = {
  'underwork': 'text-sky-400 bg-sky-500/20',
  'sweet-spot': 'text-emerald-400 bg-emerald-500/20',
  'caution': 'text-amber-400 bg-amber-500/20',
  'spike': 'text-red-400 bg-red-500/20',
}

const ALERT_STYLES: Record<string, { border: string; bg: string; icon: string }> = {
  info: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', icon: 'text-emerald-400' },
  warning: { border: 'border-amber-500/30', bg: 'bg-amber-500/5', icon: 'text-amber-400' },
  danger: { border: 'border-red-500/30', bg: 'bg-red-500/5', icon: 'text-red-400' },
}

export function RiskDashboard({ result, pitcherName, season }: RiskDashboardProps) {
  const { riskScore, riskLevel, alerts, workload, enrichedLog } = result

  // ── Velocity trend chart data ─────────────────────────────────────────
  const veloGames = enrichedLog.filter(g => g.avg_fb_velo !== null).reverse()
  const veloDates = veloGames.map(g => g.game_date)
  const veloValues = veloGames.map(g => g.avg_fb_velo!)

  const veloTrace = {
    x: veloDates,
    y: veloValues,
    type: 'scatter' as const,
    mode: 'lines+markers' as const,
    name: 'FB Velo',
    line: { color: COLORS.purple, width: 2 },
    marker: { size: 5, color: COLORS.purple },
  }

  const baselineTrace = workload.seasonBaselineVelo ? {
    x: veloDates.length >= 2 ? [veloDates[0], veloDates[veloDates.length - 1]] : veloDates,
    y: veloDates.length >= 2
      ? [workload.seasonBaselineVelo, workload.seasonBaselineVelo]
      : [workload.seasonBaselineVelo],
    type: 'scatter' as const,
    mode: 'lines' as const,
    name: 'Season Avg',
    line: { color: COLORS.amber, width: 1, dash: 'dash' as const },
  } : null

  const veloLayout = {
    ...BASE_LAYOUT,
    title: { text: 'Fastball Velocity Trend', font: { size: 13, color: COLORS.textLight } },
    xaxis: { ...BASE_LAYOUT.xaxis, title: { text: 'Game Date', font: { size: 10 } } },
    yaxis: {
      ...BASE_LAYOUT.yaxis,
      title: { text: 'Avg FB Velo (mph)', font: { size: 10 } },
      range: veloValues.length
        ? [Math.min(...veloValues) - 2, Math.max(...veloValues) + 2]
        : undefined,
    },
    margin: { ...BASE_LAYOUT.margin, t: 40 },
    showlegend: true,
    legend: { ...BASE_LAYOUT.legend, x: 0, y: 1.15, orientation: 'h' as const },
  }

  return (
    <div className="space-y-6">
      {/* Row 1: Risk gauge + Workload metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RiskGauge score={riskScore} level={riskLevel} />

        {/* Workload metrics card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium block mb-4">Workload Metrics</span>
          <div className="grid grid-cols-2 gap-3">
            <MetricCell
              label="ACWR"
              value={workload.acwr.toFixed(2)}
              badge={workload.acwrLabel}
              badgeClass={ACWR_COLORS[workload.acwrLabel]}
            />
            <MetricCell label="Role" value={workload.role === 'starter' ? 'Starter' : 'Reliever'} />
            <MetricCell
              label="Season FB Velo"
              value={workload.seasonBaselineVelo?.toFixed(1) ?? '—'}
              suffix="mph"
            />
            <MetricCell
              label="Recent FB Velo"
              value={workload.recentVelo?.toFixed(1) ?? '—'}
              suffix="mph"
              highlight={workload.veloDrop !== null && workload.veloDrop > 1.0}
            />
            <MetricCell
              label="Velo Drop"
              value={workload.veloDrop !== null ? `${workload.veloDrop > 0 ? '-' : '+'}${Math.abs(workload.veloDrop).toFixed(1)}` : '—'}
              suffix="mph"
              highlight={workload.veloDrop !== null && workload.veloDrop > 1.0}
            />
            <MetricCell
              label="Days Since Last"
              value={workload.lastRestDays?.toString() ?? '—'}
              suffix="days"
            />
            <MetricCell
              label="Acute Load (7d)"
              value={workload.acuteLoad.toString()}
              suffix="pitches"
            />
            <MetricCell
              label="High-Lev (7d)"
              value={workload.highLevCount7d.toString()}
              suffix="games"
              highlight={workload.highLevCount7d >= 3}
            />
          </div>
        </div>
      </div>

      {/* Row 2: Risk alerts */}
      {alerts.length > 0 && (
        <div>
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2 font-medium">Risk Alerts</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alerts.map((alert, i) => {
              const style = ALERT_STYLES[alert.level]
              return (
                <div key={i} className={`${style.bg} border ${style.border} rounded-lg px-4 py-3`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`${style.icon} text-xs`}>
                      {alert.level === 'danger' ? '!!!' : alert.level === 'warning' ? '!!' : 'i'}
                    </span>
                    <span className={`text-xs font-semibold ${style.icon}`}>{alert.title}</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{alert.message}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Row 3: Velocity trend chart */}
      {veloGames.length > 1 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <Plot
            data={baselineTrace ? [veloTrace, baselineTrace] : [veloTrace]}
            layout={veloLayout}
            style={{ width: '100%', height: '350px' }}
          />
        </div>
      )}

      {/* Row 4: Game log table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Game Log — {season}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 text-[10px] uppercase tracking-wider border-b border-zinc-800">
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-right px-3 py-2"><Tip label="Pitches" /></th>
                <th className="text-right px-3 py-2"><Tip label="Avg FB" /></th>
                <th className="text-right px-3 py-2"><Tip label="Max FB" /></th>
                <th className="text-right px-3 py-2"><Tip label="Inn" /></th>
                <th className="text-right px-3 py-2"><Tip label="BF" /></th>
                <th className="text-right px-3 py-2"><Tip label="Rest" /></th>
                <th className="text-right px-3 py-2"><Tip label="Fade" /></th>
                <th className="text-center px-3 py-2"><Tip label="HiLev" /></th>
                <th className="text-center px-3 py-2"><Tip label="Flag" /></th>
              </tr>
            </thead>
            <tbody>
              {enrichedLog.map((g, i) => (
                <tr key={g.game_pk} className={`border-b border-zinc-800/50 ${i % 2 === 0 ? '' : 'bg-zinc-800/20'}`}>
                  <td className="px-3 py-1.5 text-zinc-300 font-mono">{g.game_date}</td>
                  <td className={`px-3 py-1.5 text-right ${g.pitch_flag ? 'text-red-400 font-semibold' : 'text-zinc-300'}`}>
                    {g.pitches}
                  </td>
                  <td className="px-3 py-1.5 text-right text-zinc-300">
                    {g.avg_fb_velo?.toFixed(1) ?? '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right text-zinc-300">
                    {g.max_fb_velo?.toFixed(1) ?? '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right text-zinc-300">{g.innings}</td>
                  <td className="px-3 py-1.5 text-right text-zinc-300">{g.batters_faced}</td>
                  <td className={`px-3 py-1.5 text-right ${
                    g.rest_days !== null && g.rest_days <= 1 ? 'text-red-400 font-semibold' :
                    g.rest_days !== null && g.rest_days <= 3 ? 'text-amber-400' : 'text-zinc-300'
                  }`}>
                    {g.rest_days ?? '—'}
                  </td>
                  <td className={`px-3 py-1.5 text-right ${
                    g.velo_fade !== null && g.velo_fade > 2.0 ? 'text-amber-400' : 'text-zinc-300'
                  }`}>
                    {g.velo_fade !== null ? `${g.velo_fade > 0 ? '-' : '+'}${Math.abs(g.velo_fade).toFixed(1)}` : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {g.high_leverage && (
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {g.pitch_flag && (
                      <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function MetricCell({ label, value, suffix, badge, badgeClass, highlight }: {
  label: string
  value: string
  suffix?: string
  badge?: string
  badgeClass?: string
  highlight?: boolean
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-lg font-bold ${highlight ? 'text-red-400' : 'text-white'}`}>{value}</span>
        {suffix && <span className="text-[10px] text-zinc-500">{suffix}</span>}
        {badge && badgeClass && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${badgeClass}`}>
            {badge}
          </span>
        )}
      </div>
    </div>
  )
}
