'use client'
import PitchUsage from '../charts/PitchUsage'
import PitchMovement from '../charts/PitchMovement'
import VelocityDistribution from '../charts/VelocityDistribution'
import StrikeZoneHeatmap from '../charts/StrikeZoneHeatmap'

interface Props { data: any[]; info: any }

function calcStats(pitches: any[], total: number) {
  const velos = pitches.map(p => p.release_speed).filter(Boolean)
  const spins = pitches.map(p => p.release_spin_rate).filter(Boolean)
  const exts = pitches.map(p => p.release_extension).filter(Boolean)
  const hBreaks = pitches.map(p => p.pfx_x).filter((v: any) => v != null)
  const vBreaks = pitches.map(p => p.pfx_z).filter((v: any) => v != null)
  const armAngles = pitches.map(p => p.arm_angle).filter(Boolean)
  const spinAxes = pitches.map(p => p.spin_axis).filter(Boolean)

  const swingDescs = ['swinging_strike','swinging_strike_blocked','foul','foul_tip','hit_into_play','foul_bunt','missed_bunt']
  const whiffDescs = ['swinging_strike','swinging_strike_blocked']
  const calledStrikeDescs = ['called_strike']

  const swings = pitches.filter(p => {
    const d = (p.description || '').toLowerCase()
    return swingDescs.some(s => d.includes(s)) || d.includes('in play')
  }).length
  const whiffs = pitches.filter(p => {
    const d = (p.description || '').toLowerCase()
    return whiffDescs.some(s => d.includes(s))
  }).length
  const calledStrikes = pitches.filter(p => {
    const d = (p.description || '').toLowerCase()
    return calledStrikeDescs.some(s => d.includes(s))
  }).length
  const balls = pitches.filter(p => p.type === 'B').length
  const strikes = pitches.filter(p => p.type === 'S').length
  const inPlay = pitches.filter(p => p.type === 'X').length

  const battedBalls = pitches.filter(p => p.launch_speed != null)
  const evs = battedBalls.map(p => p.launch_speed)
  const las = battedBalls.map(p => p.launch_angle).filter(Boolean)
  const xbas = pitches.map(p => p.estimated_ba_using_speedangle).filter((v: any) => v != null)
  const xwobas = pitches.map(p => p.estimated_woba_using_speedangle).filter((v: any) => v != null)
  const xslgs = pitches.map(p => p.estimated_slg_using_speedangle).filter((v: any) => v != null)

  const gbs = battedBalls.filter(p => p.bb_type === 'ground_ball').length
  const fbs = battedBalls.filter(p => p.bb_type === 'fly_ball').length
  const lds = battedBalls.filter(p => p.bb_type === 'line_drive').length
  const pus = battedBalls.filter(p => p.bb_type === 'popup').length
  const bbTotal = battedBalls.length || 1

  const avg = (arr: number[]) => arr.length ? arr.reduce((a,b) => a+b,0) / arr.length : null
  const max = (arr: number[]) => arr.length ? Math.max(...arr) : null
  const min = (arr: number[]) => arr.length ? Math.min(...arr) : null
  const fmt = (v: number | null, d: number = 1) => v != null ? v.toFixed(d) : '—'
  const fmtPct = (num: number, den: number) => den > 0 ? (num / den * 100).toFixed(1) + '%' : '—'

  return {
    count: pitches.length,
    usagePct: fmtPct(pitches.length, total),
    avgVelo: fmt(avg(velos)),
    maxVelo: fmt(max(velos)),
    minVelo: fmt(min(velos)),
    avgSpin: fmt(avg(spins), 0),
    avgExt: fmt(avg(exts)),
    avgHBreak: fmt(avg(hBreaks)),
    avgVBreak: fmt(avg(vBreaks)),
    avgArmAngle: fmt(avg(armAngles)),
    avgSpinAxis: fmt(avg(spinAxes), 0),
    whiffPct: fmtPct(whiffs, swings),
    csPct: fmtPct(calledStrikes, pitches.length),
    swingPct: fmtPct(swings, pitches.length),
    zonePct: fmtPct(strikes + inPlay, pitches.length),
    ballPct: fmtPct(balls, pitches.length),
    avgEV: fmt(avg(evs)),
    maxEV: fmt(max(evs)),
    avgLA: fmt(avg(las)),
    avgXba: fmt(avg(xbas), 3),
    avgXwoba: fmt(avg(xwobas), 3),
    avgXslg: fmt(avg(xslgs), 3),
    gbPct: fmtPct(gbs, bbTotal),
    fbPct: fmtPct(fbs, bbTotal),
    ldPct: fmtPct(lds, bbTotal),
    puPct: fmtPct(pus, bbTotal),
  }
}

export default function OverviewTab({ data, info }: Props) {
  const pitchGroups: Record<string, any[]> = {}
  data.forEach(d => { if (d.pitch_name) { if (!pitchGroups[d.pitch_name]) pitchGroups[d.pitch_name] = []; pitchGroups[d.pitch_name].push(d) } })

  const rows = Object.entries(pitchGroups)
    .map(([name, pitches]) => ({ name, ...calcStats(pitches, data.length) }))
    .sort((a, b) => b.count - a.count)

  const totals = { name: 'Total', ...calcStats(data, data.length) }

  const cols: { key: string; label: string; group: string }[] = [
    { key: 'name', label: 'Pitch', group: 'Pitch' },
    { key: 'count', label: '#', group: 'Usage' },
    { key: 'usagePct', label: 'Usage%', group: 'Usage' },
    { key: 'avgVelo', label: 'Avg', group: 'Velocity' },
    { key: 'maxVelo', label: 'Max', group: 'Velocity' },
    { key: 'minVelo', label: 'Min', group: 'Velocity' },
    { key: 'avgSpin', label: 'Spin', group: 'Spin' },
    { key: 'avgSpinAxis', label: 'Axis', group: 'Spin' },
    { key: 'avgHBreak', label: 'H Brk', group: 'Movement' },
    { key: 'avgVBreak', label: 'V Brk', group: 'Movement' },
    { key: 'avgExt', label: 'Ext', group: 'Release' },
    { key: 'avgArmAngle', label: 'Arm°', group: 'Release' },
    { key: 'whiffPct', label: 'Whiff%', group: 'Outcomes' },
    { key: 'csPct', label: 'CSt%', group: 'Outcomes' },
    { key: 'swingPct', label: 'Sw%', group: 'Outcomes' },
    { key: 'zonePct', label: 'Zone%', group: 'Outcomes' },
    { key: 'avgEV', label: 'Avg EV', group: 'Batted Ball' },
    { key: 'maxEV', label: 'Max EV', group: 'Batted Ball' },
    { key: 'avgLA', label: 'Avg LA', group: 'Batted Ball' },
    { key: 'gbPct', label: 'GB%', group: 'Batted Ball' },
    { key: 'fbPct', label: 'FB%', group: 'Batted Ball' },
    { key: 'ldPct', label: 'LD%', group: 'Batted Ball' },
    { key: 'avgXba', label: 'xBA', group: 'Expected' },
    { key: 'avgXwoba', label: 'xwOBA', group: 'Expected' },
    { key: 'avgXslg', label: 'xSLG', group: 'Expected' },
  ]

  // Compute column groups for header
  const groups: { label: string; span: number }[] = []
  let lastGroup = ''
  cols.forEach(c => {
    if (c.group !== lastGroup) { groups.push({ label: c.group, span: 1 }); lastGroup = c.group }
    else { groups[groups.length - 1].span++ }
  })

  const cellColor = (key: string) => {
    if (key.includes('Velo') || key === 'avgExt') return 'text-amber-400'
    if (key.includes('Spin') || key.includes('Axis')) return 'text-sky-400'
    if (key.includes('Break') || key.includes('Arm')) return 'text-purple-400'
    if (key.includes('whiff') || key.includes('cs') || key.includes('swing') || key.includes('zone')) return 'text-emerald-400'
    if (key.includes('EV') || key.includes('LA') || key.includes('gb') || key.includes('fb') || key.includes('ld') || key.includes('pu')) return 'text-orange-400'
    if (key.includes('Xba') || key.includes('Xwoba') || key.includes('Xslg')) return 'text-rose-400'
    return 'text-zinc-300'
  }

  return (
    <div className="space-y-6">
      {/* Arsenal Table */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-x-auto">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">Pitch Arsenal</h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">{data.length.toLocaleString()} pitches</p>
        </div>
        <table className="w-full text-[11px]">
          {/* Group Headers */}
          <thead>
            <tr>
              {groups.map((g, i) => (
                <th key={i} colSpan={g.span}
                  className={`px-2 py-1.5 text-center font-semibold uppercase tracking-wider border-b border-zinc-800 ${
                    g.label ? 'text-zinc-400 bg-zinc-800/50' : 'bg-zinc-900'
                  }`}>
                  {g.label}
                </th>
              ))}
            </tr>
            <tr>
              {cols.map(c => (
                <th key={c.key} className="px-2 py-1.5 text-zinc-500 font-medium border-b border-zinc-800 whitespace-nowrap text-right first:text-left">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.name} className="border-b border-zinc-800/30 hover:bg-zinc-800/30 transition">
                {cols.map(c => (
                  <td key={c.key} className={`px-2 py-1.5 whitespace-nowrap font-mono text-right first:text-left first:font-sans first:font-medium first:text-white ${
                    c.key === 'name' ? '' : cellColor(c.key)
                  }`}>
                    {(r as any)[c.key]?.toLocaleString?.() ?? (r as any)[c.key]}
                  </td>
                ))}
              </tr>
            ))}
            {/* Totals row */}
            <tr className="border-t-2 border-zinc-700 bg-zinc-800/30 font-semibold">
              {cols.map(c => (
                <td key={c.key} className={`px-2 py-2 whitespace-nowrap font-mono text-right first:text-left first:font-sans first:text-white ${
                  c.key === 'name' ? '' : cellColor(c.key)
                }`}>
                  {(totals as any)[c.key]?.toLocaleString?.() ?? (totals as any)[c.key]}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <PitchUsage data={data} />
        </div>
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <PitchMovement data={data} />
        </div>
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <VelocityDistribution data={data} />
        </div>
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <StrikeZoneHeatmap data={data} />
        </div>
      </div>
    </div>
  )
}
