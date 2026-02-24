'use client'
import { useEffect, useMemo, RefObject } from 'react'
import Plot from '@/components/PlotWrapper'
import { BASE_LAYOUT, COLORS, getPitchColor } from '@/components/chartConfig'
import { QualityPreset } from '@/lib/qualityPresets'

interface TemplateProps {
  data: any[]
  playerName: string
  quality: QualityPreset
  containerRef: RefObject<HTMLDivElement>
  onFrameUpdate?: (frame: number, total: number) => void
}

// Max game groups to animate before falling back to static
const MAX_ANIMATED_GAMES = 60

function sampleData(arr: any[], max: number): any[] {
  if (arr.length <= max) return arr
  const step = arr.length / max
  return Array.from({ length: max }, (_, i) => arr[Math.floor(i * step)])
}

export default function VelocityAnimation({
  data,
  playerName,
  quality,
  containerRef,
  onFrameUpdate,
}: TemplateProps) {
  const sampled = useMemo(
    () =>
      sampleData(
        data
          .filter(d => d.release_speed != null && d.game_date && d.pitch_name)
          .sort((a, b) => (a.game_date < b.game_date ? -1 : a.game_date > b.game_date ? 1 : 0)),
        quality.maxPitches
      ),
    [data, quality.maxPitches]
  )

  // Group by game_date, preserve pitch index within each game for x positioning
  const gameGroups = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const d of sampled) {
      const key = d.game_date
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(d)
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1))
  }, [sampled])

  const pitchTypes = useMemo(
    () => [...new Set(sampled.map(d => d.pitch_name))].sort() as string[],
    [sampled]
  )

  const useAnimation = gameGroups.length <= MAX_ANIMATED_GAMES && gameGroups.length > 1

  // Notify frame updates when animated — synchronize with quality.fps intent
  useEffect(() => {
    if (!useAnimation || !onFrameUpdate) return
    onFrameUpdate(0, gameGroups.length)
  }, [useAnimation, gameGroups.length, onFrameUpdate])

  // Build a global pitch index so x axis is continuous across games
  const indexedData = useMemo(() => {
    let idx = 0
    return sampled.map(d => ({ ...d, _pitchIdx: idx++ }))
  }, [sampled])

  // Static traces — all pitches visible (used for both static and as final frame)
  const staticTraces = useMemo(() => {
    return pitchTypes.map(pt => {
      const pts = indexedData.filter(d => d.pitch_name === pt)
      return {
        x: pts.map(d => d.game_date),
        y: pts.map(d => d.release_speed),
        customdata: pts.map(d => [pt, d.game_date, d.release_spin_rate ?? '']),
        type: 'scatter' as any,
        mode: 'markers' as any,
        name: pt,
        marker: { color: getPitchColor(pt), size: 5, opacity: 0.65 },
        hovertemplate:
          '%{customdata[0]}<br>' +
          'Velocity: %{y:.1f} mph<br>' +
          'Date: %{customdata[1]}<br>' +
          'Spin: %{customdata[2]} rpm<extra></extra>',
      }
    })
  }, [indexedData, pitchTypes])

  // Animation frames: each frame adds one more game's worth of pitches
  const { frames, sliderSteps } = useMemo(() => {
    if (!useAnimation) return { frames: [], sliderSteps: [] }

    // Accumulate pitches up to and including game i
    const accumulatedByGame: any[][] = []
    let acc: any[] = []
    for (const [, pitches] of gameGroups) {
      acc = [...acc, ...pitches]
      accumulatedByGame.push(acc)
    }

    const frames = accumulatedByGame.map((accPitches, i) => {
      const [gameDateKey] = gameGroups[i]
      const frameTraces = pitchTypes.map(pt => {
        const pts = accPitches.filter(d => d.pitch_name === pt)
        return {
          x: pts.map(d => d.game_date),
          y: pts.map(d => d.release_speed),
          customdata: pts.map(d => [pt, d.game_date, d.release_spin_rate ?? '']),
          type: 'scatter' as any,
          mode: 'markers' as any,
          name: pt,
          marker: { color: getPitchColor(pt), size: 5, opacity: 0.65 },
          hovertemplate:
            '%{customdata[0]}<br>' +
            'Velocity: %{y:.1f} mph<br>' +
            'Date: %{customdata[1]}<br>' +
            'Spin: %{customdata[2]} rpm<extra></extra>',
        }
      })
      return { name: gameDateKey, data: frameTraces }
    })

    const sliderSteps = gameGroups.map(([date], i) => ({
      label: date,
      method: 'animate' as const,
      args: [
        [date],
        {
          mode: 'immediate',
          transition: { duration: 0 },
          frame: { duration: 0, redraw: false },
        },
      ],
    }))

    return { frames, sliderSteps }
  }, [useAnimation, gameGroups, pitchTypes])

  if (!sampled.length) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">
        No velocity data
      </div>
    )
  }

  const veloVals = sampled.map(d => d.release_speed).filter(Boolean) as number[]
  const minVelo = veloVals.length ? Math.floor(Math.min(...veloVals)) - 2 : 60
  const maxVelo = veloVals.length ? Math.ceil(Math.max(...veloVals)) + 2 : 100

  const layout: any = {
    ...BASE_LAYOUT,
    title: {
      text: `${playerName} — Velocity Over Time`,
      font: { size: 14, color: COLORS.textLight },
    },
    xaxis: {
      ...BASE_LAYOUT.xaxis,
      title: 'Game Date',
      type: 'category',
      tickangle: -35,
      tickfont: { size: 9, color: COLORS.text },
      nticks: Math.min(gameGroups.length, 20),
    },
    yaxis: {
      ...BASE_LAYOUT.yaxis,
      title: 'Velocity (mph)',
      range: [minVelo, maxVelo],
    },
    legend: {
      ...BASE_LAYOUT.legend,
      x: 1,
      xanchor: 'right' as const,
      y: 1,
    },
    margin: { t: 50, r: 120, b: useAnimation ? 100 : 60, l: 60 },
  }

  // Add animation controls if animating
  if (useAnimation && sliderSteps.length) {
    layout.updatemenus = [
      {
        type: 'buttons',
        showactive: false,
        x: 0.05,
        y: -0.12,
        xanchor: 'left' as const,
        yanchor: 'top' as const,
        buttons: [
          {
            label: 'Play',
            method: 'animate' as const,
            args: [
              null,
              {
                fromcurrent: true,
                transition: { duration: 80, easing: 'linear' },
                frame: { duration: 120, redraw: false },
              },
            ],
          },
          {
            label: 'Pause',
            method: 'animate' as const,
            args: [
              [null],
              {
                mode: 'immediate',
                transition: { duration: 0 },
                frame: { duration: 0, redraw: false },
              },
            ],
          },
        ],
        font: { color: COLORS.textLight, size: 11 },
        bgcolor: '#27272a',
        bordercolor: '#3f3f46',
        borderwidth: 1,
      },
    ]

    layout.sliders = [
      {
        active: sliderSteps.length - 1,
        steps: sliderSteps,
        x: 0.05,
        y: -0.06,
        len: 0.9,
        xanchor: 'left' as const,
        yanchor: 'top' as const,
        currentvalue: {
          prefix: 'Game: ',
          font: { color: COLORS.text, size: 10 },
          visible: true,
          xanchor: 'right' as const,
        },
        transition: { duration: 0 },
        font: { color: COLORS.text, size: 9 },
        bgcolor: '#27272a',
        bordercolor: '#3f3f46',
        tickcolor: '#3f3f46',
        minorticklen: 0,
      },
    ]
  }

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col" style={{ background: COLORS.bg }}>
      {!useAnimation && (
        <div className="px-3 pt-2">
          <span className="text-xs text-zinc-500">
            Static view — {gameGroups.length} games ({sampled.length.toLocaleString()} pitches)
          </span>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Plot
          data={staticTraces}
          layout={layout}
          frames={useAnimation ? frames : undefined}
          config={{
            displaylogo: false,
            modeBarButtonsToRemove: ['lasso2d', 'select2d', 'toImage'],
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
