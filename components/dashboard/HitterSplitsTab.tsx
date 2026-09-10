'use client'
import Tip from '@/components/Tip'

function calcSplitStats(pitches: any[]) {
  const total = pitches.length
  if (!total) return null

  const velos = pitches.map(p => p.release_speed).filter(Boolean)
  const spins = pitches.map(p => p.release_spin_rate).filter(Boolean)

  const swingDescs = ['swinging_strike','swinging_strike_blocked','foul','foul_tip','hit_into_play','foul_bunt','missed_bunt','swinging_pitchout']
  // Savant whiff: foul tips count as swinging strikes (matches METRICS.whiff_pct)
  const whiffDescs = ['swinging_strike','swinging_strike_blocked','missed_bunt','swinging_pitchout','foul_tip','bunt_foul_tip']

  const swings = pitches.filter(p => {
    const d = (p.description || '').toLowerCase()
    return swingDescs.some(s => d.includes(s)) || d.includes('in play')
  }).length
  const whiffs = pitches.filter(p => whiffDescs.some(s => (p.description || '').toLowerCase().includes(s))).length
  const calledStrikes = pitches.filter(p => (p.description || '').toLowerCase().includes('called_strike')).length

  // FanGraphs conventions (2026-09-11): PA excludes truncated_pa, BB includes
  // intentional walks, BA = H/AB (true AB, not the old PA−BB−HBP estimate),
  // FB% folds popups in (GB+LD+FB = 100%).
  const NON_AB = new Set(['walk','intent_walk','hit_by_pitch','sac_fly','sac_fly_double_play','sac_bunt','sac_bunt_double_play','catcher_interf'])
  const paRows = pitches.filter(p => p.events && p.events !== 'truncated_pa')
  const pas = paRows.length
  const ks = paRows.filter(p => p.events.includes('strikeout')).length
  const bbs = paRows.filter(p => p.events === 'walk' || p.events === 'intent_walk').length
  const hits = paRows.filter(p => ['single','double','triple','home_run'].includes(p.events)).length
  const hrs = paRows.filter(p => p.events === 'home_run').length
  const abEst = paRows.filter(p => !NON_AB.has(p.events)).length

  const battedBalls = pitches.filter(p => p.bb_type != null)
  const evs = battedBalls.map(p => p.launch_speed)
  const xbaSum = paRows.reduce((s: number, d: any) => s + (d.estimated_ba_using_speedangle || 0), 0)
  const xbaAB = abEst
  // Savant-faithful xwOBA: batted-ball xwOBA + 0.7·(uBB + HBP), over the
  // official wOBA denominator (AB + uBB + SF + HBP; IBB excluded entirely)
  const WOBA_DENOM = new Set(['single','double','triple','home_run','field_out','strikeout','strikeout_double_play','grounded_into_double_play','force_out','double_play','field_error','fielders_choice','fielders_choice_out','triple_play','other_out','walk','hit_by_pitch','sac_fly','sac_fly_double_play'])
  const wobaDen = paRows.filter(p => WOBA_DENOM.has(p.events)).length
  const xwobaNum = pitches.reduce((s: number, p: any) => s + ((p.description || '').startsWith('hit_into_play') ? (p.estimated_woba_using_speedangle || 0) : 0), 0)
    + 0.7 * paRows.filter(p => p.events === 'walk' || p.events === 'hit_by_pitch').length
  const xwoba = wobaDen > 0 ? xwobaNum / wobaDen : null

  const gbs = battedBalls.filter(p => p.bb_type === 'ground_ball').length
  const fbs = battedBalls.filter(p => p.bb_type === 'fly_ball' || p.bb_type === 'popup').length
  const lds = battedBalls.filter(p => p.bb_type === 'line_drive').length
  const bbT = battedBalls.length || 1

  const avg = (arr: number[]) => arr.length ? (arr.reduce((a,b) => a+b,0) / arr.length) : null
  const f = (v: number | null, d: number = 1) => v != null ? v.toFixed(d) : '—'
  const pct = (n: number, den: number) => den > 0 ? (n / den * 100).toFixed(1) + '%' : '—'

  return {
    pitches: total, pa: pas, pitchVelo: f(avg(velos)),
    whiffPct: pct(whiffs, swings), contactPct: swings > 0 ? ((1 - whiffs / swings) * 100).toFixed(1) + '%' : '—',
    swingPct: pct(swings, total),
    kPct: pct(ks, pas), bbPct: pct(bbs, pas), hits, hrs,
    ba: abEst > 0 ? f(hits / abEst, 3) : '—',
    avgEV: f(avg(evs)), xBA: f(xbaAB > 0 ? xbaSum / xbaAB : null, 3), xwOBA: f(xwoba, 3),
    gbPct: pct(gbs, bbT), fbPct: pct(fbs, bbT), ldPct: pct(lds, bbT),
  }
}

function SplitTable({ label, splits, showVelo = false }: { label: string; splits: { name: string; stats: any }[]; showVelo?: boolean }) {
  const cols = [
    { key: 'name', label: label }, { key: 'pitches', label: '#' }, { key: 'pa', label: 'PA' },
    ...(showVelo ? [{ key: 'pitchVelo', label: 'Pitch Velo' }] : []),
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
      <SplitTable label="Pitch" splits={pitchVsLHP} showVelo />

      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">vs Pitch Type (RHP)</h3>
      <SplitTable label="Pitch" splits={pitchVsRHP} showVelo />
    </div>
  )
}
