'use client'

export default function GameLogTab({ data }: { data: any[] }) {
  // Group by game
  const games: Record<string, any[]> = {}
  data.forEach(d => {
    const key = `${d.game_date}_${d.game_pk}`
    if (!games[key]) games[key] = []
    games[key].push(d)
  })

  const gameRows = Object.entries(games).map(([key, pitches]) => {
    const first = pitches[0]
    const velos = pitches.map(p => p.release_speed).filter(Boolean)
    const ks = pitches.filter(p => p.events?.includes('strikeout')).length
    const bbs = pitches.filter(p => p.events?.includes('walk')).length
    const hits = pitches.filter(p => ['single','double','triple','home_run'].includes(p.events)).length
    const whiffs = pitches.filter(p => p.description?.toLowerCase().includes('swinging_strike')).length
    const swings = pitches.filter(p => {
      const d = (p.description || '').toLowerCase()
      return d.includes('swing') || d.includes('foul') || d.includes('in play')
    }).length

    return {
      date: first.game_date, opponent: first.home_team === first.away_team ? '—' : `${first.away_team} @ ${first.home_team}`,
      pitches: pitches.length, avgVelo: velos.length ? (velos.reduce((a,b) => a+b,0)/velos.length).toFixed(1) : '—',
      maxVelo: velos.length ? Math.max(...velos).toFixed(1) : '—',
      ks, bbs, hits, whiffPct: swings > 0 ? (whiffs / swings * 100).toFixed(1) : '—',
    }
  }).sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="text-[11px] text-zinc-500 uppercase tracking-wider">
            <th className="text-left px-4 py-2">Date</th>
            <th className="text-left px-4 py-2">Matchup</th>
            <th className="text-right px-4 py-2">Pitches</th>
            <th className="text-right px-4 py-2">Avg Velo</th>
            <th className="text-right px-4 py-2">Max Velo</th>
            <th className="text-right px-4 py-2">K</th>
            <th className="text-right px-4 py-2">BB</th>
            <th className="text-right px-4 py-2">Hits</th>
            <th className="text-right px-4 py-2">Whiff%</th>
          </tr>
        </thead>
        <tbody>
          {gameRows.map((r, i) => (
            <tr key={i} className="border-t border-zinc-800/50 hover:bg-zinc-800/30 transition">
              <td className="px-4 py-2 text-sm text-white font-mono">{r.date}</td>
              <td className="px-4 py-2 text-sm text-zinc-400">{r.opponent}</td>
              <td className="px-4 py-2 text-sm text-zinc-400 text-right font-mono">{r.pitches}</td>
              <td className="px-4 py-2 text-sm text-amber-400 text-right font-mono">{r.avgVelo}</td>
              <td className="px-4 py-2 text-sm text-amber-400/70 text-right font-mono">{r.maxVelo}</td>
              <td className="px-4 py-2 text-sm text-emerald-400 text-right font-mono">{r.ks}</td>
              <td className="px-4 py-2 text-sm text-red-400 text-right font-mono">{r.bbs}</td>
              <td className="px-4 py-2 text-sm text-sky-400 text-right font-mono">{r.hits}</td>
              <td className="px-4 py-2 text-sm text-zinc-300 text-right font-mono">{r.whiffPct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
