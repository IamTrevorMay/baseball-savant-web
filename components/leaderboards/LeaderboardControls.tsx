'use client'

interface Props {
  type: 'career' | 'season'
  category: 'batting' | 'pitching'
  stat: string
  minPA: number
  minIP: number
  startYear: string
  endYear: string
  league: string
  onTypeChange: (v: 'career' | 'season') => void
  onCategoryChange: (v: 'batting' | 'pitching') => void
  onStatChange: (v: string) => void
  onMinPAChange: (v: number) => void
  onMinIPChange: (v: number) => void
  onStartYearChange: (v: string) => void
  onEndYearChange: (v: string) => void
  onLeagueChange: (v: string) => void
}

const BATTING_STATS = [
  { value: 'hr', label: 'Home Runs' }, { value: 'h', label: 'Hits' },
  { value: 'r', label: 'Runs' }, { value: 'rbi', label: 'RBI' },
  { value: 'sb', label: 'Stolen Bases' }, { value: 'bb', label: 'Walks' },
  { value: 'ba', label: 'Batting Avg' }, { value: 'obp', label: 'On-Base%' },
  { value: 'slg', label: 'Slugging%' }, { value: 'ops', label: 'OPS' },
  { value: 'doubles', label: 'Doubles' }, { value: 'triples', label: 'Triples' },
  { value: 'g', label: 'Games' }, { value: 'ab', label: 'At Bats' },
  { value: 'pa', label: 'Plate App.' },
]

const PITCHING_STATS = [
  { value: 'w', label: 'Wins' }, { value: 'so', label: 'Strikeouts' },
  { value: 'era', label: 'ERA' }, { value: 'sv', label: 'Saves' },
  { value: 'whip', label: 'WHIP' }, { value: 'k9', label: 'K/9' },
  { value: 'ip', label: 'Innings Pitched' }, { value: 'cg', label: 'Complete Games' },
  { value: 'sho', label: 'Shutouts' }, { value: 'g', label: 'Games' },
  { value: 'gs', label: 'Games Started' },
]

const chipCls = (active: boolean) =>
  `px-3 py-1.5 rounded text-xs font-medium transition cursor-pointer ${
    active ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700'
  }`

const selectCls = 'bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1.5 focus:border-emerald-600 focus:outline-none'

export default function LeaderboardControls(props: Props) {
  const stats = props.category === 'pitching' ? PITCHING_STATS : BATTING_STATS

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 space-y-3">
      {/* Row 1: Type + Category */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex gap-1">
          <button className={chipCls(props.type === 'career')} onClick={() => props.onTypeChange('career')}>Career</button>
          <button className={chipCls(props.type === 'season')} onClick={() => props.onTypeChange('season')}>Season</button>
        </div>
        <div className="flex gap-1">
          <button className={chipCls(props.category === 'batting')} onClick={() => { props.onCategoryChange('batting'); props.onStatChange('hr') }}>Batting</button>
          <button className={chipCls(props.category === 'pitching')} onClick={() => { props.onCategoryChange('pitching'); props.onStatChange('w') }}>Pitching</button>
        </div>
        <select value={props.stat} onChange={e => props.onStatChange(e.target.value)} className={selectCls}>
          {stats.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Row 2: Qualifiers + Filters */}
      <div className="flex flex-wrap gap-3 items-center text-xs text-zinc-400">
        {props.category === 'batting' && (
          <label className="flex items-center gap-1.5">
            Min PA:
            <input type="number" value={props.minPA} onChange={e => props.onMinPAChange(Number(e.target.value))}
              className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:border-emerald-600 focus:outline-none" />
          </label>
        )}
        {props.category === 'pitching' && (
          <label className="flex items-center gap-1.5">
            Min IP:
            <input type="number" value={props.minIP} onChange={e => props.onMinIPChange(Number(e.target.value))}
              className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:border-emerald-600 focus:outline-none" />
          </label>
        )}
        <label className="flex items-center gap-1.5">
          From:
          <input type="number" value={props.startYear} onChange={e => props.onStartYearChange(e.target.value)} placeholder="1871"
            className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:border-emerald-600 focus:outline-none" />
        </label>
        <label className="flex items-center gap-1.5">
          To:
          <input type="number" value={props.endYear} onChange={e => props.onEndYearChange(e.target.value)} placeholder="2025"
            className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:border-emerald-600 focus:outline-none" />
        </label>
        <select value={props.league} onChange={e => props.onLeagueChange(e.target.value)} className={selectCls}>
          <option value="">All Leagues</option>
          <option value="AL">AL</option>
          <option value="NL">NL</option>
        </select>
      </div>
    </div>
  )
}
