import { Scene, SceneElement, StarterCardData } from './sceneTypes'
import { getPitchColor } from '@/components/chartConfig'

function formatValue(val: number | string | null | undefined, fmt?: string): string {
  if (val == null || val === undefined) return '--'
  if (typeof val === 'string') return val
  switch (fmt) {
    case '1f': return val.toFixed(1)
    case '2f': return val.toFixed(2)
    case '3f': return val.toFixed(3)
    case 'integer': return Math.round(val).toString()
    case 'percent': return `${(val * 100).toFixed(1)}%`
    default: return String(val)
  }
}

function getStatValue(data: StarterCardData, metric: string): number | string | null {
  // Game line stats
  const gl = data.game_line
  switch (metric) {
    case 'pitches': return gl.pitches
    case 'ip': return gl.ip
    case 'er': return gl.er
    case 'h': return gl.h
    case 'hr': return gl.hr
    case 'bb': return gl.bb
    case 'k': return gl.k
    case 'whiffs': return gl.whiffs
    case 'csw_pct': return gl.csw_pct
    // Grades
    case 'grade_start': return data.grades.start
    case 'grade_stuff': return data.grades.stuff
    case 'grade_command': return data.grades.command
    case 'grade_triton': return data.grades.triton
    // Primary fastball
    case 'fb_velo': return data.primary_fastball?.avg_velo ?? null
    case 'fb_ivb': return data.primary_fastball?.avg_ivb ?? null
    case 'fb_hb': return data.primary_fastball?.avg_hb ?? null
    case 'fb_ext': return data.primary_fastball?.avg_ext ?? null
    case 'fb_havaa': return data.primary_fastball?.avg_havaa ?? null
    // Command
    case 'cmd_plus': return data.command.cmd_plus
    case 'waste_pct': return data.command.waste_pct
    case 'avg_missfire': return data.command.avg_missfire
    case 'avg_cluster': return data.command.avg_cluster
    case 'avg_brink': return data.command.avg_brink
    default: return null
  }
}

export function populateReportCard(scene: Scene, data: StarterCardData, title?: string): Scene {
  const populated: SceneElement[] = scene.elements.map(el => {
    const binding = el.reportCardBinding
    if (!binding) {
      // Handle text elements with {title} placeholder
      if (el.type === 'text' && el.props.text && title) {
        const newText = el.props.text
          .replace(/\{title\}/gi, title)
          .replace(/\{player_name\}/gi, data.pitcher_name)
          .replace(/\{opponent\}/gi, data.opponent)
          .replace(/\{game_date\}/gi, data.game_date)
          .replace(/\{team\}/gi, data.team)
          .replace(/\{p_throws\}/gi, data.p_throws)
        return { ...el, props: { ...el.props, text: newText } }
      }
      // Auto-fill player-image if no playerId set
      if (el.type === 'player-image' && !el.props.playerId) {
        return { ...el, props: { ...el.props, playerId: data.pitcher_id, playerName: data.pitcher_name } }
      }
      return el
    }

    switch (binding.objectType) {
      case 'rc-stat-box': {
        const raw = getStatValue(data, binding.metric || 'k')
        const value = formatValue(raw, binding.format)
        const label = binding.metric?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Stat'
        return { ...el, props: { ...el.props, value, label } }
      }

      case 'rc-table': {
        const cols = binding.columns || el.props.columns || []
        const rows = data.pitch_metrics.map(pm => {
          const row: Record<string, any> = {}
          for (const col of cols) {
            const raw = (pm as any)[col.key]
            row[col.key] = col.key === 'pitch_name' ? raw : formatValue(raw, col.format)
          }
          row._color = getPitchColor(pm.pitch_name)
          return row
        })
        return { ...el, props: { ...el.props, rows, columns: cols } }
      }

      case 'rc-heatmap': {
        const allLocs = [...data.locations_lhb, ...data.locations_rhb]
        return { ...el, props: { ...el.props, locations: allLocs } }
      }

      case 'rc-zone-plot': {
        const allLocs = [...data.locations_lhb, ...data.locations_rhb]
        // ZonePlotRenderer reads p.pitches
        return { ...el, props: { ...el.props, pitches: allLocs, colorBy: binding.colorBy || 'pitch_type' } }
      }

      case 'rc-movement-plot': {
        // MovementPlotRenderer reads p.pitches and p.seasonShapes
        return {
          ...el,
          props: {
            ...el.props,
            pitches: data.movement,
            seasonShapes: data.season_movement,
          },
        }
      }

      case 'rc-bar-chart': {
        const metric = binding.metric || 'avg_velo'
        const barData = data.pitch_metrics
          .filter(pm => (pm as any)[metric] != null)
          .map(pm => ({
            label: pm.pitch_name,
            value: (pm as any)[metric],
            color: getPitchColor(pm.pitch_name),
          }))
        return { ...el, props: { ...el.props, barData, metric } }
      }

      case 'rc-donut-chart': {
        const usageData = data.usage.map(u => ({
          label: u.pitch_name,
          value: u.outing_pct,
          color: getPitchColor(u.pitch_name),
        }))
        return { ...el, props: { ...el.props, usageData } }
      }

      case 'rc-statline': {
        const gl = data.game_line
        return { ...el, props: { ...el.props, statline: {
          ip: gl.ip, h: gl.h, r: gl.r ?? 0, k: gl.k, bb: gl.bb,
          decision: gl.decision ?? 'ND', era: gl.era ?? '--',
        }}}
      }

      default:
        return el
    }
  })

  return { ...scene, elements: populated }
}
