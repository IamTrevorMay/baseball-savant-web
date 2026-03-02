'use client'
import Tip from '@/components/Tip'

export default function HitterGameLogTab({ data }: { data: any[] }) {
  // Group by game
  const games: Record<string, any[]> = {}
  data.forEach(d => {
    const key = `${d.game_date}_${d.game_pk}`
    if (!games[key]) games[key] = []
    games[key].push(d)
  })

  const gameRows = Object.entries(games).map(([key, pitches]) => {
    const first = pitches[0]
    const pas = pitches.filter(p => p.events).length
    const hits = pitches.filter(p => ['single','double','triple','home_run'].includes(p.events)).length
    const doubles = pitches.filter(p => p.events === 'double').length
    const triples = pitches.filter(p => p.events === 'triple').length
    const hrs = pitches.filter(p => p.events === 'home_run').length
    const bbs = pitches.filter(p => p.events?.includes('walk')).length
    const ks = pitches.filter(p => p.events?.includes('strikeout')).length
    const hbps = pitches.filter(p => p.events === 'hit_by_pitch').length

    const battedBalls = pitches.filter(p => p.launch_speed != null)
    const evs = battedBalls.map(p => p.launch_speed)
    const avgEV = evs.length ? (evs.reduce((a,b) => a+b,0) / evs.length).toFixed(1) : '—'

    // Opponent: derive from inning_topbot
    const opponent = first.vs_team || (first.inning_topbot === 'Top' ? first.home_team : first.away_team) || '—'
    const abEst = pas - bbs - hbps
    const ba = abEst > 0 ? (hits / abEst).toFixed(3) : '—'

    return {
      date: first.game_date, opponent,
      pa: pas, h: hits, '2b': doubles, '3b': triples, hr: hrs,
      bb: bbs, k: ks, ba, avgEV, pitches: pitches.length,
    }
  }).sort((a, b) => b.date.localeCompare(a.date))

  const cols = [
    { k: 'date', l: 'Date', cls: 'text-white font-mono' },
    { k: 'opponent', l: 'Opponent', cls: 'text-zinc-400' },
    { k: 'pa', l: 'PA', cls: 'text-zinc-400' },
    { k: 'h', l: 'H', cls: 'text-sky-400' },
    { k: '2b', l: '2B', cls: 'text-sky-400/70' },
    { k: '3b', l: '3B', cls: 'text-sky-400/70' },
    { k: 'hr', l: 'HR', cls: 'text-amber-400' },
    { k: 'bb', l: 'BB', cls: 'text-emerald-400' },
    { k: 'k', l: 'K', cls: 'text-red-400' },
    { k: 'ba', l: 'BA', cls: 'text-rose-400' },
    { k: 'avgEV', l: 'Avg EV', cls: 'text-orange-400' },
    { k: 'pitches', l: 'Pitches', cls: 'text-zinc-500' },
  ]

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="text-[11px] text-zinc-500 uppercase tracking-wider">
            {cols.map(c => (
              <th key={c.k} className={`px-4 py-2 ${c.k === 'date' || c.k === 'opponent' ? 'text-left' : 'text-right'}`}><Tip label={c.l} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gameRows.map((r, i) => (
            <tr key={i} className="border-t border-zinc-800/50 hover:bg-zinc-800/30 transition">
              {cols.map(c => (
                <td key={c.k} className={`px-4 py-2 text-sm font-mono ${c.k === 'date' || c.k === 'opponent' ? 'text-left' : 'text-right'} ${c.cls}`}>
                  {(r as any)[c.k]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
