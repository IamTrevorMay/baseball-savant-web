'use client'
import { useMemo, RefObject } from 'react'
import Plot from '@/components/PlotWrapper'
import { BASE_LAYOUT, COLORS } from '@/components/chartConfig'
import { QualityPreset } from '@/lib/qualityPresets'

interface TemplateProps {
  data: any[]
  playerName: string
  quality: QualityPreset
  containerRef: RefObject<HTMLDivElement>
  onFrameUpdate?: (frame: number, total: number) => void
}

// Hardcoded 2024 league percentile tables (pitcher perspective)
// [p10, p25, p50, p75, p90] values
const LEAGUE_PERCENTILES: Record<string, { label: string; unit: string; percentiles: number[]; higherBetter: boolean }> = {
  avg_velo: {
    label: 'Avg Velocity',
    unit: 'mph',
    percentiles: [88.5, 90.8, 93.2, 95.1, 97.0],
    higherBetter: true,
  },
  max_velo: {
    label: 'Max Velocity',
    unit: 'mph',
    percentiles: [91.2, 93.5, 96.0, 97.8, 99.5],
    higherBetter: true,
  },
  avg_spin: {
    label: 'Spin Rate',
    unit: 'rpm',
    percentiles: [2050, 2180, 2320, 2450, 2600],
    higherBetter: true,
  },
  extension: {
    label: 'Extension',
    unit: 'ft',
    percentiles: [5.8, 6.1, 6.3, 6.6, 6.9],
    higherBetter: true,
  },
  ivb: {
    label: 'IVB (FF)',
    unit: 'in',
    percentiles: [12.0, 14.0, 16.0, 18.0, 20.5],
    higherBetter: true,
  },
  hb: {
    label: 'HB (FF)',
    unit: 'in',
    percentiles: [-10.0, -8.0, -6.5, -4.5, -2.5],
    higherBetter: false,
  },
  vaa: {
    label: 'VAA (FF)',
    unit: '°',
    percentiles: [-6.8, -6.2, -5.5, -4.9, -4.2],
    higherBetter: true,  // less negative = better for FF
  },
  whiff_pct: {
    label: 'Whiff%',
    unit: '%',
    percentiles: [18.0, 22.0, 26.0, 31.0, 36.0],
    higherBetter: true,
  },
  chase_pct: {
    label: 'Chase%',
    unit: '%',
    percentiles: [24.0, 27.0, 30.0, 34.0, 38.0],
    higherBetter: true,
  },
}

function computePercentile(value: number, percentiles: number[], higherBetter: boolean): number {
  const pcts = [10, 25, 50, 75, 90]
  // If not higherBetter, invert: lower value = higher percentile
  const vals = higherBetter ? percentiles : [...percentiles].reverse()
  const pctsUsed = higherBetter ? pcts : [90, 75, 50, 25, 10]

  if (value <= vals[0]) return pctsUsed[0]
  if (value >= vals[vals.length - 1]) return pctsUsed[pctsUsed.length - 1]

  for (let i = 0; i < vals.length - 1; i++) {
    if (value >= vals[i] && value <= vals[i + 1]) {
      const frac = (value - vals[i]) / (vals[i + 1] - vals[i])
      return pctsUsed[i] + frac * (pctsUsed[i + 1] - pctsUsed[i])
    }
  }
  return 50
}

function percentileColor(pct: number): string {
  // red (0) → yellow (50) → blue (100)
  if (pct <= 50) {
    const t = pct / 50
    const r = Math.round(220 - t * 100)
    const g = Math.round(50 + t * 170)
    const b = Math.round(50 + t * 20)
    return `rgb(${r},${g},${b})`
  } else {
    const t = (pct - 50) / 50
    const r = Math.round(120 - t * 80)
    const g = Math.round(220 - t * 80)
    const b = Math.round(70 + t * 180)
    return `rgb(${r},${g},${b})`
  }
}

export default function PercentileRankings({ data, playerName }: TemplateProps) {
  const metrics = useMemo(() => {
    if (!data.length) return []

    // Compute player averages for fastballs (for pitch-specific metrics)
    const fastballs = data.filter(d => ['4-Seam Fastball', 'FF', 'Fastball', 'FA'].includes(d.pitch_name || d.pitch_type || ''))
    const allPitches = data

    // Velocity: all pitches
    const velos = allPitches.map(d => d.release_speed).filter((v): v is number => v != null)
    const avgVelo = velos.length ? velos.reduce((a, b) => a + b, 0) / velos.length : null
    const maxVelo = velos.length ? Math.max(...velos) : null

    // Spin rate: all pitches
    const spins = allPitches.map(d => d.release_spin_rate).filter((v): v is number => v != null)
    const avgSpin = spins.length ? spins.reduce((a, b) => a + b, 0) / spins.length : null

    // Extension: all pitches
    const exts = allPitches.map(d => d.release_extension).filter((v): v is number => v != null)
    const avgExt = exts.length ? exts.reduce((a, b) => a + b, 0) / exts.length : null

    // IVB & HB: fastballs
    const ivbs = fastballs.map(d => d.pfx_z_in ?? (d.pfx_z != null ? d.pfx_z * 12 : null)).filter((v): v is number => v != null)
    const avgIvb = ivbs.length ? ivbs.reduce((a, b) => a + b, 0) / ivbs.length : null

    const hbs = fastballs.map(d => d.pfx_x_in ?? (d.pfx_x != null ? d.pfx_x * 12 : null)).filter((v): v is number => v != null)
    const avgHb = hbs.length ? hbs.reduce((a, b) => a + b, 0) / hbs.length : null

    // VAA: fastballs
    const vaas = fastballs.map(d => d.vaa).filter((v): v is number => v != null)
    const avgVaa = vaas.length ? vaas.reduce((a, b) => a + b, 0) / vaas.length : null

    // Whiff%: swinging_strikes / swings
    const swings = allPitches.filter(d => {
      const desc = (d.description || '').toLowerCase()
      return desc.includes('swing') || desc.includes('foul') || desc.includes('hit_into_play') || desc === 'swinging_strike' || desc === 'swinging_strike_blocked'
    })
    const swingingStrikes = swings.filter(d => {
      const desc = (d.description || '').toLowerCase()
      return desc === 'swinging_strike' || desc === 'swinging_strike_blocked'
    })
    const whiffPct = swings.length > 0 ? (swingingStrikes.length / swings.length) * 100 : null

    // Chase%: swings on pitches outside zone
    const outsideZone = allPitches.filter(d => d.zone != null && Number(d.zone) >= 11)
    const chasePitches = outsideZone.filter(d => {
      const desc = (d.description || '').toLowerCase()
      return desc.includes('swing') || desc.includes('foul') || desc.includes('hit_into_play') || desc === 'swinging_strike' || desc === 'swinging_strike_blocked'
    })
    const chasePct = outsideZone.length > 0 ? (chasePitches.length / outsideZone.length) * 100 : null

    const results: { key: string; value: number; pct: number }[] = []
    const vals: Record<string, number | null> = {
      avg_velo: avgVelo, max_velo: maxVelo, avg_spin: avgSpin, extension: avgExt,
      ivb: avgIvb, hb: avgHb, vaa: avgVaa, whiff_pct: whiffPct, chase_pct: chasePct,
    }

    for (const [key, def] of Object.entries(LEAGUE_PERCENTILES)) {
      const v = vals[key]
      if (v == null) continue
      results.push({
        key,
        value: v,
        pct: computePercentile(v, def.percentiles, def.higherBetter),
      })
    }

    return results
  }, [data])

  if (!metrics.length) {
    return (
      <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">
        Insufficient data for percentile rankings
      </div>
    )
  }

  const labels = metrics.map(m => LEAGUE_PERCENTILES[m.key].label)
  const pcts = metrics.map(m => Math.round(m.pct))
  const colors = pcts.map(p => percentileColor(p))
  const hoverTexts = metrics.map(m => {
    const def = LEAGUE_PERCENTILES[m.key]
    return `${def.label}: ${m.value.toFixed(1)} ${def.unit}<br>Percentile: ${Math.round(m.pct)}th`
  })

  const traces = [{
    type: 'bar' as any,
    orientation: 'h' as any,
    y: labels,
    x: pcts,
    text: pcts.map(p => `${p}th`),
    textposition: 'outside' as any,
    textfont: { size: 11, color: COLORS.textLight },
    marker: { color: colors, line: { width: 0 } },
    hovertext: hoverTexts,
    hoverinfo: 'text' as any,
  }]

  const layout = {
    ...BASE_LAYOUT,
    title: {
      text: `${playerName} — Percentile Rankings (vs 2024 League)`,
      font: { size: 14, color: COLORS.textLight },
    },
    xaxis: {
      ...BASE_LAYOUT.xaxis,
      title: 'Percentile',
      range: [0, 105],
      dtick: 25,
    },
    yaxis: {
      ...BASE_LAYOUT.yaxis,
      autorange: 'reversed' as any,
      tickfont: { size: 11, color: COLORS.textLight },
    },
    margin: { t: 50, r: 50, b: 50, l: 120 },
    shapes: [
      // 50th percentile reference line
      {
        type: 'line' as const,
        x0: 50, x1: 50, y0: -0.5, y1: metrics.length - 0.5,
        line: { color: '#52525b', width: 1, dash: 'dash' as const },
      },
    ],
  }

  return (
    <div className="relative w-full h-full flex flex-col" style={{ background: COLORS.bg }}>
      <div className="flex-1 min-h-0">
        <Plot data={traces} layout={layout}
          config={{ displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d', 'toImage'] }}
          style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}
