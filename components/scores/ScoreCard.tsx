'use client'
import { TEAM_COLORS } from '@/lib/constants'
import type { Game } from '@/lib/types'

/* ─── Diamond (base runners) ─── */

export function Diamond({ onFirst, onSecond, onThird, size = 20 }: { onFirst: boolean; onSecond: boolean; onThird: boolean; size?: number }) {
  const s = size
  const half = s / 2
  const baseSize = s * 0.26
  const bh = baseSize / 2
  const pad = s * 0.12
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className="shrink-0">
      <path d={`M${half} ${pad} L${s - pad} ${half} L${half} ${s - pad} L${pad} ${half} Z`}
        fill="none" stroke="#3f3f46" strokeWidth={0.8} />
      {/* 2nd */}
      <rect x={half - bh} y={pad - bh} width={baseSize} height={baseSize}
        transform={`rotate(45 ${half} ${pad})`}
        fill={onSecond ? '#34d399' : '#27272a'} stroke={onSecond ? '#34d399' : '#3f3f46'} strokeWidth={0.5} />
      {/* 3rd */}
      <rect x={pad - bh} y={half - bh} width={baseSize} height={baseSize}
        transform={`rotate(45 ${pad} ${half})`}
        fill={onThird ? '#34d399' : '#27272a'} stroke={onThird ? '#34d399' : '#3f3f46'} strokeWidth={0.5} />
      {/* 1st */}
      <rect x={s - pad - bh} y={half - bh} width={baseSize} height={baseSize}
        transform={`rotate(45 ${s - pad} ${half})`}
        fill={onFirst ? '#34d399' : '#27272a'} stroke={onFirst ? '#34d399' : '#3f3f46'} strokeWidth={0.5} />
    </svg>
  )
}

/* ─── Outs indicator ─── */

export function OutsDots({ outs }: { outs: number }) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map(i => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < outs ? 'bg-amber-400' : 'bg-zinc-700'}`} />
      ))}
    </div>
  )
}

/* ─── Score Card ─── */

function ScoreCard({ game, selected, onClick }: { game: Game; selected: boolean; onClick: () => void }) {
  const isLive = game.state === 'Live'
  const isFinal = game.state === 'Final'
  const isPreview = game.state === 'Preview'

  const awayWon = isFinal && game.away.score !== null && game.home.score !== null && game.away.score > game.home.score
  const homeWon = isFinal && game.away.score !== null && game.home.score !== null && game.home.score > game.away.score

  function gameTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  let statusText = ''
  let statusColor = 'text-zinc-500'
  if (isLive) {
    statusText = `${game.inningHalf === 'Top' ? '\u25B2' : '\u25BC'} ${game.inningOrdinal || ''}`
    statusColor = 'text-emerald-400'
  } else if (isFinal) {
    statusText = game.inning && game.inning > 9 ? `Final/${game.inning}` : 'Final'
  } else if (game.detailedState === 'Postponed') {
    statusText = 'PPD'
    statusColor = 'text-red-400'
  } else {
    statusText = gameTime(game.gameDate)
  }

  const lastName = (name: string) => name.split(' ').slice(-1)[0]

  return (
    <div onClick={onClick} className={`bg-zinc-900 border rounded-lg p-4 min-w-[240px] flex-shrink-0 cursor-pointer transition ${
      selected ? 'border-emerald-500 ring-1 ring-emerald-500/30' : isLive ? 'border-emerald-700/50 hover:border-emerald-700' : 'border-zinc-800 hover:border-zinc-700'
    }`}>
      {/* Header: status + situation */}
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
          {isLive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse align-middle" />}
          {statusText}
        </span>
        {isLive && game.outs !== null && (
          <div className="flex items-center gap-2">
            <OutsDots outs={game.outs} />
            <Diamond onFirst={game.onFirst} onSecond={game.onSecond} onThird={game.onThird} />
          </div>
        )}
      </div>

      {/* Away team */}
      <div className={`flex items-center justify-between py-1 ${awayWon ? 'text-white' : 'text-zinc-400'}`}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
            style={{ backgroundColor: TEAM_COLORS[game.away.abbrev] || '#52525b' }}>
            {game.away.abbrev}
          </div>
          <span className={`text-sm font-medium ${awayWon ? 'text-white' : ''}`}>{game.away.abbrev}</span>
        </div>
        <span className={`text-sm font-mono font-semibold ${awayWon ? 'text-white' : ''}`}>
          {game.away.score !== null ? game.away.score : ''}
        </span>
      </div>

      {/* Home team */}
      <div className={`flex items-center justify-between py-1 ${homeWon ? 'text-white' : 'text-zinc-400'}`}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
            style={{ backgroundColor: TEAM_COLORS[game.home.abbrev] || '#52525b' }}>
            {game.home.abbrev}
          </div>
          <span className={`text-sm font-medium ${homeWon ? 'text-white' : ''}`}>{game.home.abbrev}</span>
        </div>
        <span className={`text-sm font-mono font-semibold ${homeWon ? 'text-white' : ''}`}>
          {game.home.score !== null ? game.home.score : ''}
        </span>
      </div>

      {/* Live: pitcher / batter */}
      {isLive && (game.pitcher || game.batter) && (
        <div className="mt-2 pt-2 border-t border-zinc-800 space-y-0.5">
          {game.pitcher && (
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-zinc-600 font-medium shrink-0">P</span>
              <span className="text-zinc-400 truncate">{lastName(game.pitcher.name)}</span>
            </div>
          )}
          {game.batter && (
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-zinc-600 font-medium shrink-0">AB</span>
              <span className="text-zinc-400 truncate">{lastName(game.batter.name)}</span>
            </div>
          )}
        </div>
      )}

      {/* Preview: probable pitchers */}
      {isPreview && (game.probableAway || game.probableHome) && (
        <div className="mt-2 pt-2 border-t border-zinc-800 space-y-0.5">
          {game.probableAway && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-zinc-600 font-medium">{game.away.abbrev}</span>
              <span className="text-zinc-400 truncate">{lastName(game.probableAway.name)}</span>
            </div>
          )}
          {game.probableHome && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-zinc-600 font-medium">{game.home.abbrev}</span>
              <span className="text-zinc-400 truncate">{lastName(game.probableHome.name)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ScoreCard
