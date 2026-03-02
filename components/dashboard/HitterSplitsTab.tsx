'use client'
import Tip from '@/components/Tip'

function calcSplitStats(pitches: any[]) {
  const total = pitches.length
  if (!total) return null

  const velos = pitches.map(p => p.release_speed).filter(Boolean)
  const spins = pitches.map(p => p.release_spin_rate).filter(Boolean)

  const swingDescs = ['swinging_strike','swinging_strike_blocked','foul','foul_tip','hit_into_play','foul_bunt','missed_bunt']
  const whiffDescs = ['swinging_strike','swinging_strike_blocked']

  const swings = pitches.filter(p => {
    const d = (p.description || '').toLowerCase()
    return swingDescs.some(s => d.includes(s)) || d.includes('in play')
  }).length
  const whiffs = pitches.filter(p => whiffDescs.some(s => (p.description || '').toLowerCase().includes(s))).length
  const calledStrikes = pitches.filter(p => (p.description || '').toLowerCase().includes('called_strike')).length

  const pas = pitches.filter(p => p.events).length
  const ks = pitches.filter(p => p.events?.includes('strikeout')).length
  const bbs = pitches.filter(p => p.events?.includes('walk')).length
  const hits = pitches.filter(p => ['single','double','triple','home_run'].includes(p.events)).length
  const hrs = pitches.filter(p => p.events === 'home_run').length
  const hbps = pitches.filter(p => p.events === 'hit_by_pitch').length

  const battedBalls = pitches.filter(p => p.launch_speed != null)
  const evs = battedBalls.map(p => p.launch_speed)
  const xbas = pitches.map(p => p.estimated_ba_using_speedangle).filter((v: any) => v != null)
  const xwobas = pitches.map(p => p.estimated_woba_using_speedangle).filter((v: any) => v != null)

  const gbs = battedBalls.filter(p => p.bb_type === 'ground_ball').length
  const fbs = battedBalls.filter(p => p.bb_type === 'fly_ball').length
  const lds = battedBalls.filter(p => p.bb_type === 'line_drive').length
  const bbT = battedBalls.length || 1

  const abEst = pas - bbs - hbps

  const avg = (arr: number[]) => arr.length ? (arr.reduce((a,b) => a+b,0) / arr.length) : null
  const f = (v: number | null, d: number = 1) => v != null ? v.toFixed(d) : '—'
  const pct = (n: number, den: number) => den > 0 ? (n / den * 100).toFixed(1) + '%' : '—'

  return {
    pitches: total, pa: pas, pitchVelo: f(avg(velos)),
    whiffPct: pct(whiffs, swings), contactPct: swings > 0 ? ((1 - whiffs / swings) * 100).toFixed(1) + '%' : '—',
    swingPct: pct(swings, total),
    kPct: pct(ks, pas), bbPct: pct(bbs, pas), hits, hrs,
    ba: abEst > 0 ? f(hits / abEst, 3) : '—',
    avgEV: f(avg(evs)), xBA: f(avg(xbas), 3), xwOBA: f(avg(xwobas), 3),
    gbPct: pct(gbs, bbT), fbPct: pct(fbs, bbT), ldPct: pct(lds, bbT),
  }
}

function SplitTable({ label, splits }: { label: string; splits: { name: string; stats: any }[] }) {
  const cols = [
    { key: 'name', label: label }, { key: 'pitches', label: '#' }, { key: 'pa', label: 'PA' },
    { key: 'pitchVelo', label: 'Pitch Velo' },
    { key: 'whiffPct', label: 'Whiff%' }, { key: 'contactPct', label: 'Contact%' }, { key: 'swingPct', label: 'Sw%' },
    { key: 'kPct', label: 'K%' }, { key: 'bbPct', label: 'BB%' }, { key: 'ba', label: 'BA' },
    { key: 'hits', label: 'H' }, { key: 'hrs', label: 'HR' },
    { key: 'avgEV', label: 'Avg EV' }, { key: 'xBA', label: 'xBA' }, { key: 'xwOBA', label: 'xwOBA' },
    { key: 'gbPct', label: 'GB%' }, { key: 'fbPct', label: 'FB%' }, { key: 'ldPct', label: 'LD%' },
  ]

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c.key} className="bg-zinc-800 px-3 py-2 text-zinc-500 font-medium whitespace-nowrap text-right first:text-left">
                <Tip label={c.label} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {splits.filter(s => s.stats).map(s => (
            <tr key={s.name} className="border-b border-zinc-800/30 hover:bg-zinc-800/30 transition">
              {cols.map(c => (
                <td key={c.key} className={`px-3 py-2 whitespace-nowrap font-mono text-right first:text-left first:font-sans first:font-medium first:text-white ${
                  c.key === 'name' ? '' :
                  c.key === 'pitchVelo' ? 'text-amber-400' :
                  c.key === 'contactPct' ? 'text-emerald-400' :
                  c.key.includes('whiff') || c.key.includes('k') ? 'text-red-400' :
                  c.key.includes('xBA') || c.key.includes('xwOBA') || c.key === 'ba' ? 'text-rose-400' :
                  c.key === 'avgEV' ? 'text-orange-400' :
                  'text-zinc-300'
                }`}>
                  {c.key === 'name' ? s.name : (s.stats as any)[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function HitterSplitsTab({ data }: { data: any[] }) {
  // Platoon splits — vs pitcher handedness
  const vsLHP = data.filter(d => d.p_throws === 'L')
  const vsRHP = data.filter(d => d.p_throws === 'R')

  // Count splits
  const counts = ['0-0','0-1','0-2','1-0','1-1','1-2','2-0','2-1','2-2','3-0','3-1','3-2']
  const countSplits = counts.map(c => {
    const [b, s] = c.split('-').map(Number)
    const pitches = data.filter(d => d.balls === b && d.strikes === s)
    return { name: c, stats: calcSplitStats(pitches) }
  })

  // By inning
  const innings = [...new Set(data.map(d => d.inning).filter(Boolean))].sort((a: number, b: number) => a - b)
  const inningSplits = innings.map((inn: number) => ({
    name: `Inning ${inn}`,
    stats: calcSplitStats(data.filter(d => d.inning === inn))
  }))

  // By pitch type vs each hand
  const pitchTypes = [...new Set(data.map(d => d.pitch_name).filter(Boolean))].sort()
  const pitchVsLHP = pitchTypes.map(pt => ({ name: `${pt} vs LHP`, stats: calcSplitStats(vsLHP.filter(d => d.pitch_name === pt)) }))
  const pitchVsRHP = pitchTypes.map(pt => ({ name: `${pt} vs RHP`, stats: calcSplitStats(vsRHP.filter(d => d.pitch_name === pt)) }))

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Platoon Splits</h3>
      <SplitTable label="Split" splits={[
        { name: 'vs LHP', stats: calcSplitStats(vsLHP) },
        { name: 'vs RHP', stats: calcSplitStats(vsRHP) },
        { name: 'Overall', stats: calcSplitStats(data) },
      ]} />

      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">By Count</h3>
      <SplitTable label="Count" splits={countSplits} />

      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">By Inning</h3>
      <SplitTable label="Inning" splits={inningSplits} />

      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">vs Pitch Type (LHP)</h3>
      <SplitTable label="Pitch" splits={pitchVsLHP} />

      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">vs Pitch Type (RHP)</h3>
      <SplitTable label="Pitch" splits={pitchVsRHP} />
    </div>
  )
}
