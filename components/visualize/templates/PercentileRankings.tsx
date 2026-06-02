'use client'
import { useMemo, useState, useEffect, RefObject } from 'react'
import Plot from '@/components/PlotWrapper'
import { BASE_LAYOUT, COLORS } from '@/components/chartConfig'
import { QualityPreset } from '@/lib/qualityPresets'
import { empiricalPercentile } from '@/lib/leagueStats'
import { toPitcherX } from '@/lib/pitcherPerspective'

interface TemplateProps {
  data: any[]
  playerName: string
  quality: QualityPreset
  containerRef: RefObject<HTMLDivElement>
  onFrameUpdate?: (frame: number, total: number) => void
}

// Metric definitions for this template's subset
const TEMPLATE_METRICS: Record<string, { label: string; unit: string; dbKey: string }> = {
  avg_spin:  { label: 'Spin Rate',  unit: 'rpm', dbKey: 'avg_spin' },
  extension: { label: 'Extension',  unit: 'ft',  dbKey: 'avg_ext' },
  ivb:       { label: 'IVB (FF)',   unit: 'in',  dbKey: 'avg_ivb_in' },
  hb:        { label: 'HB (FF)',    unit: 'in',  dbKey: 'avg_hbreak_in' },
  vaa:       { label: 'VAA (FF)',   unit: '°',   dbKey: 'vaa_ff' },
  whiff_pct: { label: 'Whiff%',    unit: '%',   dbKey: 'whiff_pct' },
  chase_pct: { label: 'Chase%',    unit: '%',   dbKey: 'chase_pct' },
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
  const [percentileMap, setPercentileMap] = useState<Record<string, { breakpoints: number[]; higher_better: boolean }>>({})

  // Determine pitcher role (SP if ≥3 games with 50+ pitches)
  const role = useMemo(() => {
    const gamePitchCounts: Record<string, number> = {}
    for (const d of data) {
      if (!d.game_pk || !d.pitcher) continue
      if (d.pitch_type === 'PO' || d.pitch_type === 'IN') continue
      const key = String(d.game_pk)
      gamePitchCounts[key] = (gamePitchCounts[key] || 0) + 1
    }
    const gamesOver50 = Object.values(gamePitchCounts).filter(c => c >= 50).length
    return gamesOver50 >= 3 ? 'SP' : 'RP'
  }, [data])

  useEffect(() => {
    const years = [...new Set(data.map(d => d.game_year).filter(Boolean))] as number[]
    if (years.length === 0) return
    const season = Math.max(...years)
    fetch(`/api/league-percentiles?season=${season}&role=${role}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        const map: Record<string, { breakpoints: number[]; higher_better: boolean }> = {}
        for (const r of rows) {
          map[r.metric] = { breakpoints: r.breakpoints.map(Number), higher_better: r.higher_better }
        }
        setPercentileMap(map)
      })
      .catch(() => {})
  }, [data, role])

  const metrics = useMemo(() => {
    if (!data.length) return []

    // Compute player averages for fastballs (for pitch-specific metrics)
    const fastballs = data.filter(d => ['4-Seam Fastball', 'FF', 'Fastball', 'FA'].includes(d.pitch_name || d.pitch_type || ''))
    const allPitches = data

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
      avg_spin: avgSpin, extension: avgExt,
      ivb: avgIvb, hb: avgHb, vaa: avgVaa, whiff_pct: whiffPct, chase_pct: chasePct,
    }

    for (const [key, def] of Object.entries(TEMPLATE_METRICS)) {
      const v = vals[key]
      if (v == null) continue

      const bp = percentileMap[def.dbKey]
      const pct = bp ? empiricalPercentile(v, bp.breakpoints, bp.higher_better) : 50

      results.push({ key, value: v, pct })
    }

    return results
  }, [data, percentileMap])

  if (!metrics.length) {
    return (
      <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">
        Insufficient data for percentile rankings
      </div>
    )
  }

  const labels = metrics.map(m => TEMPLATE_METRICS[m.key].label)
  const pcts = metrics.map(m => Math.round(m.pct))
  const colors = pcts.map(p => percentileColor(p))
  const hoverTexts = metrics.map(m => {
    const def = TEMPLATE_METRICS[m.key]
    const displayVal = m.key === 'hb' ? toPitcherX(m.value) : m.value
    return `${def.label}: ${displayVal.toFixed(1)} ${def.unit}<br>Percentile: ${Math.round(m.pct)}th`
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
      text: `${playerName} — Percentile Rankings`,
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
