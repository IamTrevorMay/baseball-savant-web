'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  NES, TIER_LABELS, segmentColors, formatStatValue, percentileColor,
  PITCHER_TIERS, HITTER_TIERS, samePositionCategory, gameDay,
  type StatDef,
} from '@/lib/gameConstants'

// ── Types ──
type Phase = 'menu' | 'loading' | 'play' | 'result'
type PlayerType = 'pitcher' | 'hitter'

interface StatResult { key: string; label: string; value: number; percentile: number; unit: string }
interface Tier { level: number; label: string; stats: StatResult[] }
interface PoolPlayer { id: number; name: string; role?: string }
interface PuzzleData {
  tiers: Tier[]
  hints: { league: string; hand: string; team: string }
  answer: { id: number; name: string }
  pool: PoolPlayer[]
  poolSize: number
  date: string
}
interface PlayerMeta {
  id: number; name: string; number: string; position: string; birthCountry: string; age: number
}
interface GuessRow {
  name: string; id: number; meta: PlayerMeta | null; role?: string
}
interface SavedState {
  guessRows: { name: string; id: number; role?: string }[]
  hintsUsed: boolean[]
  completed: boolean; won: boolean; score: number
  year: number; type: PlayerType
}

// ── Helpers ──
function storageKey(year: number, type: PlayerType) {
  return `triton-game-${year}-${type}-${gameDay()}`
}
function purgeOldEntries() {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith('triton-game-')) keys.push(k)
  }
  const now = Date.now()
  keys.forEach(k => {
    const parts = k.split('-')
    const d = new Date(parts.slice(-3).join('-'))
    if (now - d.getTime() > 7 * 86400_000) localStorage.removeItem(k)
  })
}

// ── Score History ──
interface GameRecord {
  date: string
  year: number
  type: 'pitcher' | 'hitter'
  score: number
  won: boolean
  guesses: number
  hintsUsed: number
}

const HISTORY_KEY = 'percentile-history'

function loadHistory(): GameRecord[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch { return [] }
}

function saveHistory(record: GameRecord) {
  const history = loadHistory()
  // Deduplicate by date+year+type
  const exists = history.some(h => h.date === record.date && h.year === record.year && h.type === record.type)
  if (exists) return
  history.push(record)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
}

async function fetchMeta(id: number): Promise<PlayerMeta | null> {
  try {
    const res = await fetch(`/api/game/player-meta?id=${id}`)
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

const SCORE_TABLE = [100, 80, 60, 40, 20]
const HINT_COSTS = [3, 5, 7]

// ══════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════
export default function GamePage() {
  const [phase, setPhase] = useState<Phase>('menu')
  const [year, setYear] = useState(2024)
  const [type, setType] = useState<PlayerType>('pitcher')
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null)
  const [guessRows, setGuessRows] = useState<GuessRow[]>([])
  const [answerMeta, setAnswerMeta] = useState<PlayerMeta | null>(null)
  const [hintsUsed, setHintsUsed] = useState([false, false, false])
  const [completed, setCompleted] = useState(false)
  const [won, setWon] = useState(false)
  const [score, setScore] = useState(0)
  const [error, setError] = useState('')

  const guessNum = guessRows.length

  useEffect(() => { purgeOldEntries() }, [])

  const startGame = useCallback(async (y: number, t: PlayerType) => {
    setPhase('loading')
    setError('')
    try {
      const res = await fetch(`/api/game/puzzle?year=${y}&type=${t}`)
      if (!res.ok) throw new Error('Failed to load puzzle')
      const data: PuzzleData = await res.json()
      setPuzzle(data)
      setYear(y)
      setType(t)

      // Fetch answer metadata (await so grid works immediately)
      const aMeta = await fetchMeta(data.answer.id)
      setAnswerMeta(aMeta)

      // Check saved state
      const saved = localStorage.getItem(storageKey(y, t))
      if (saved) {
        const s: SavedState = JSON.parse(saved)
        // Restore guess rows with metadata
        const rows: GuessRow[] = s.guessRows.map(g => ({ ...g, meta: null, role: g.role }))
        setGuessRows(rows)
        setHintsUsed(s.hintsUsed)
        setCompleted(s.completed)
        setWon(s.won)
        setScore(s.score)
        setPhase(s.completed ? 'result' : 'play')
        // Fetch meta for each guess
        s.guessRows.forEach((g, i) => {
          fetchMeta(g.id).then(meta => {
            setGuessRows(prev => prev.map((r, j) => j === i ? { ...r, meta } : r))
          })
        })
      } else {
        setGuessRows([])
        setHintsUsed([false, false, false])
        setCompleted(false)
        setWon(false)
        setScore(0)
        setPhase('play')
      }
    } catch {
      setError('Failed to load puzzle. Try again.')
      setPhase('menu')
    }
  }, [])

  const saveState = useCallback((rows: GuessRow[], h: boolean[], done: boolean, w: boolean, s: number) => {
    const state: SavedState = {
      guessRows: rows.map(r => ({ name: r.name, id: r.id, role: r.role })),
      hintsUsed: h, completed: done, won: w, score: s, year, type,
    }
    localStorage.setItem(storageKey(year, type), JSON.stringify(state))
  }, [year, type])

  const submitGuess = useCallback(async (player: PoolPlayer) => {
    if (!puzzle || completed) return
    const meta = await fetchMeta(player.id)
    const row: GuessRow = { name: player.name, id: player.id, meta, role: player.role }
    const newRows = [...guessRows, row]
    const isCorrect = player.id === puzzle.answer.id
    const newGuessNum = guessNum + 1

    if (isCorrect) {
      const hintPenalty = hintsUsed.reduce((sum, used, i) => sum + (used ? HINT_COSTS[i] : 0), 0)
      const s = Math.max(0, SCORE_TABLE[guessNum] - hintPenalty)
      setGuessRows(newRows); setCompleted(true); setWon(true); setScore(s); setPhase('result')
      saveState(newRows, hintsUsed, true, true, s)
      saveHistory({ date: gameDay(), year, type, score: s, won: true, guesses: newGuessNum, hintsUsed: hintsUsed.filter(Boolean).length })
    } else if (newGuessNum >= 5) {
      setGuessRows(newRows); setCompleted(true); setWon(false); setScore(0); setPhase('result')
      saveState(newRows, hintsUsed, true, false, 0)
      saveHistory({ date: gameDay(), year, type, score: 0, won: false, guesses: 5, hintsUsed: hintsUsed.filter(Boolean).length })
    } else {
      setGuessRows(newRows)
      saveState(newRows, hintsUsed, false, false, 0)
    }
  }, [puzzle, completed, guessRows, guessNum, hintsUsed, saveState])

  const useHint = useCallback((idx: number) => {
    const newHints = [...hintsUsed]
    newHints[idx] = true
    setHintsUsed(newHints)
    saveState(guessRows, newHints, completed, won, score)
  }, [hintsUsed, guessRows, completed, won, score, saveState])

  if (phase === 'menu') return <MenuScreen onStart={startGame} error={error} />
  if (phase === 'loading') return <LoadingScreen />
  if (phase === 'result' && puzzle) {
    return <ResultScreen puzzle={puzzle} guessRows={guessRows} answerMeta={answerMeta} hintsUsed={hintsUsed} won={won} score={score} year={year} type={type} onBack={() => setPhase('menu')} />
  }
  if (phase === 'play' && puzzle) {
    return <PlayScreen puzzle={puzzle} guessNum={guessNum} guessRows={guessRows} answerMeta={answerMeta} hintsUsed={hintsUsed} onGuess={submitGuess} onHint={useHint} year={year} type={type} />
  }
  return null
}

// ══════════════════════════════════════════
//  MENU SCREEN
// ══════════════════════════════════════════
function MenuScreen({ onStart, error }: { onStart: (y: number, t: PlayerType) => void; error: string }) {
  const [year, setYear] = useState(2024)
  const [type, setType] = useState<PlayerType>('pitcher')
  const [showRules, setShowRules] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<GameRecord[]>([])

  useEffect(() => { setHistory(loadHistory()) }, [])

  const wins = history.filter(h => h.won).length
  const winRate = history.length > 0 ? Math.round((wins / history.length) * 100) : 0
  const avgScore = history.length > 0 ? Math.round(history.reduce((s, h) => s + h.score, 0) / history.length) : 0

  // Streak calc
  const sorted = [...history].sort((a, b) => `${b.date}-${b.year}-${b.type}`.localeCompare(`${a.date}-${a.year}-${a.type}`))
  let currentStreak = 0
  for (const h of sorted) { if (h.won) currentStreak++; else break }
  let bestStreak = 0, streak = 0
  for (const h of sorted) {
    if (h.won) { streak++; bestStreak = Math.max(bestStreak, streak) } else { streak = 0 }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 gap-8">
      <h1 className="text-xl sm:text-2xl text-center leading-relaxed" style={{ color: NES.red }}>
        PERCENTILE
      </h1>
      <p className="text-xs" style={{ color: NES.yellow }}>STATCAST EDITION</p>

      {/* How to Play */}
      <div className="w-full max-w-md">
        <button onClick={() => { setShowRules(!showRules); setShowHistory(false) }}
          className="w-full px-3 py-2 text-[10px] border-2 transition-colors"
          style={{ borderColor: NES.yellow, color: NES.yellow }}>
          {showRules ? '▼' : '▶'} HOW TO PLAY
        </button>
        {showRules && (
          <div className="border-2 border-t-0 px-3 py-2 space-y-1" style={{ borderColor: NES.yellow }}>
            <p className="text-[8px]" style={{ color: NES.white }}>• Identify the MLB player from Statcast percentile rankings</p>
            <p className="text-[8px]" style={{ color: NES.white }}>• Start with 3 stats from the hardest tier — miss = 2 more from easier tiers</p>
            <p className="text-[8px]" style={{ color: NES.white }}>• 5 guesses max</p>
            <p className="text-[8px]" style={{ color: NES.white }}>• Hints unlock after guesses 2, 3, 4 (cost -3, -5, -7 pts)</p>
            <p className="text-[8px]" style={{ color: NES.white }}>• Scoring: Guess 1=100, 2=80, 3=60, 4=40, 5=20</p>
          </div>
        )}
      </div>

      {/* History */}
      <div className="w-full max-w-md">
        <button onClick={() => { setShowHistory(!showHistory); setShowRules(false) }}
          className="w-full px-3 py-2 text-[10px] border-2 transition-colors"
          style={{ borderColor: NES.green, color: NES.green }}>
          {showHistory ? '▼' : '▶'} HISTORY
        </button>
        {showHistory && (
          <div className="border-2 border-t-0 px-3 py-3 space-y-3" style={{ borderColor: NES.green }}>
            {history.length === 0 ? (
              <p className="text-[8px] text-center" style={{ color: NES.gray }}>NO GAMES PLAYED YET</p>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-sm" style={{ color: NES.white }}>{history.length}</p>
                    <p className="text-[7px]" style={{ color: NES.gray }}>PLAYED</p>
                  </div>
                  <div>
                    <p className="text-sm" style={{ color: NES.white }}>{winRate}%</p>
                    <p className="text-[7px]" style={{ color: NES.gray }}>WIN RATE</p>
                  </div>
                  <div>
                    <p className="text-sm" style={{ color: NES.white }}>{currentStreak}</p>
                    <p className="text-[7px]" style={{ color: NES.gray }}>STREAK</p>
                  </div>
                  <div>
                    <p className="text-sm" style={{ color: NES.white }}>{avgScore}</p>
                    <p className="text-[7px]" style={{ color: NES.gray }}>AVG SCORE</p>
                  </div>
                </div>
                <div className="border-t" style={{ borderColor: NES.darkGray }} />
                <p className="text-[7px]" style={{ color: NES.gray }}>BEST STREAK: {bestStreak}</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {sorted.slice(0, 20).map((h, i) => (
                    <div key={i} className="flex items-center justify-between text-[8px] px-1 py-0.5"
                      style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
                      <span style={{ color: NES.gray }}>{h.date}</span>
                      <span style={{ color: NES.gray }}>{h.year}</span>
                      <span className="uppercase" style={{ color: NES.gray }}>{h.type.slice(0, 3)}</span>
                      <span style={{ color: h.won ? NES.green : NES.red }}>{h.score} pts</span>
                      <span style={{ color: h.won ? NES.green : NES.red }}>{h.won ? 'W' : 'L'}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-2 max-w-md">
        {Array.from({ length: 11 }, (_, i) => 2015 + i).map(y => (
          <button key={y} onClick={() => setYear(y)}
            className="px-3 py-2 text-[10px] border-2 transition-colors"
            style={{ borderColor: y === year ? NES.green : NES.gray, color: y === year ? NES.green : NES.gray, background: y === year ? 'rgba(0,168,0,0.15)' : 'transparent' }}>
            {y}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {(['pitcher', 'hitter'] as const).map(t => (
          <button key={t} onClick={() => setType(t)}
            className="px-4 py-2 text-xs border-2 uppercase transition-colors"
            style={{ borderColor: t === type ? NES.blue : NES.gray, color: t === type ? NES.blue : NES.gray, background: t === type ? 'rgba(0,88,248,0.15)' : 'transparent' }}>
            {t}
          </button>
        ))}
      </div>

      {error && <p className="text-[10px]" style={{ color: NES.red }}>{error}</p>}

      <button onClick={() => onStart(year, type)} className="text-xs animate-blink" style={{ color: NES.white }}>
        PRESS START
      </button>
      <style>{`
        @keyframes blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
        .animate-blink { animation: blink 1s steps(1) infinite; }
      `}</style>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-xs animate-pulse" style={{ color: NES.yellow }}>LOADING INTEL...</p>
    </div>
  )
}

// ══════════════════════════════════════════
//  PLAY SCREEN
// ══════════════════════════════════════════
function PlayScreen({
  puzzle, guessNum, guessRows, answerMeta, hintsUsed, onGuess, onHint, year, type,
}: {
  puzzle: PuzzleData; guessNum: number; guessRows: GuessRow[]; answerMeta: PlayerMeta | null
  hintsUsed: boolean[]; onGuess: (p: PoolPlayer) => void; onHint: (i: number) => void
  year: number; type: PlayerType
}) {
  const [query, setQuery] = useState('')
  const [showResults, setShowResults] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const visibleTiers = Math.min(guessNum + 1, 5)
  const tierDefs = type === 'pitcher' ? PITCHER_TIERS : HITTER_TIERS
  // Build flat stat def lookup for reliable key matching
  const statDefMap = useMemo(() => {
    const map = new Map<string, StatDef>()
    for (const tier of tierDefs) for (const d of tier) map.set(d.key, d)
    return map
  }, [tierDefs])

  // Client-side search from pool — instant, no API calls
  const guessedIds = useMemo(() => new Set(guessRows.map(g => g.id)), [guessRows])
  const searchResults = useMemo(() => {
    if (query.length < 2) return []
    const q = query.toLowerCase()
    return puzzle.pool
      .filter(p => !guessedIds.has(p.id) && p.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, puzzle.pool, guessedIds])

  const handleSelect = (player: PoolPlayer) => {
    setQuery('')
    setShowResults(false)
    onGuess(player)
  }

  const hintLabels = ['LEAGUE', 'HAND', 'TEAM']
  const hintValues = [puzzle.hints.league, puzzle.hints.hand, puzzle.hints.team]
  const hintUnlockAt = [1, 2, 3]

  return (
    <div className="min-h-screen p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px]" style={{ color: NES.yellow }}>{year} {type.toUpperCase()}</p>
        <p className="text-[10px]" style={{ color: NES.gray }}>GUESS {Math.min(guessNum + 1, 5)}/5</p>
      </div>

      {/* Stat tiers */}
      <div className="space-y-4 mb-6">
        {puzzle.tiers.slice(0, visibleTiers).map((tier, ti) => (
          <div key={ti}>
            <p className="text-[8px] mb-2 tracking-widest" style={{ color: NES.gray }}>{TIER_LABELS[ti]}</p>
            <div className={`grid gap-2 ${ti === 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {tier.stats.map(stat => (
                <StatCard key={stat.key} stat={stat} def={statDefMap.get(stat.key)} />
              ))}
            </div>
          </div>
        ))}
        {visibleTiers < 5 && (
          <p className="text-[8px] text-center" style={{ color: NES.darkGray }}>
            {5 - visibleTiers} TIER{5 - visibleTiers > 1 ? 'S' : ''} REMAINING...
          </p>
        )}
      </div>

      {/* Hints */}
      <div className="flex gap-2 mb-4 justify-center flex-wrap">
        {hintLabels.map((label, i) => {
          const unlocked = guessNum >= hintUnlockAt[i]
          const used = hintsUsed[i]
          return (
            <button key={label}
              onClick={() => unlocked && !used && onHint(i)}
              disabled={!unlocked || used}
              className="px-3 py-2 text-[8px] border-2 transition-colors"
              style={{
                borderColor: used ? NES.green : unlocked ? NES.yellow : NES.darkGray,
                color: used ? NES.green : unlocked ? NES.yellow : NES.darkGray,
                cursor: unlocked && !used ? 'pointer' : 'default',
              }}>
              {used ? `${label}: ${hintValues[i]}` : unlocked ? `${label} (-${HINT_COSTS[i]} PTS)` : `\u{1F512} ${label}`}
            </button>
          )
        })}
      </div>

      {/* Guess comparison grid */}
      {guessRows.length > 0 && answerMeta && (
        <GuessGrid guessRows={guessRows} answerMeta={answerMeta} answerRole={puzzle.pool.find(p => p.id === puzzle.answer.id)?.role} type={type} />
      )}

      {/* Search input */}
      <div className="relative mt-4">
        <input ref={inputRef} type="text" value={query}
          onChange={e => { setQuery(e.target.value); setShowResults(true) }}
          onFocus={() => setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)}
          placeholder="TYPE PLAYER NAME..."
          className="w-full px-3 py-3 text-[10px] border-2 bg-transparent outline-none"
          style={{ borderColor: NES.white, color: NES.white, fontFamily: 'var(--font-pixel), monospace' }} />
        {showResults && searchResults.length > 0 && (
          <div className="absolute left-0 right-0 border-2 border-t-0 z-40 max-h-48 overflow-y-auto"
            style={{ borderColor: NES.white, background: NES.bg }}>
            {searchResults.map(r => (
              <button key={r.id} onMouseDown={() => handleSelect(r)}
                className="w-full text-left px-3 py-2 text-[10px] hover:bg-white/10 transition-colors block"
                style={{ color: NES.white, fontFamily: 'var(--font-pixel), monospace' }}>
                {r.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Guess Comparison Grid ──
function GuessGrid({ guessRows, answerMeta, answerRole, type }: { guessRows: GuessRow[]; answerMeta: PlayerMeta; answerRole?: string; type: PlayerType }) {
  const cols = ['#', 'BORN', 'AGE', 'POS']
  return (
    <div className="mb-4">
      {/* Header */}
      <div className="grid grid-cols-4 gap-1 mb-1">
        {cols.map(c => (
          <div key={c} className="text-center text-[8px] py-1" style={{ background: NES.blue, color: NES.white }}>{c}</div>
        ))}
      </div>
      {/* Rows */}
      {guessRows.map((row, i) => {
        const m = row.meta
        if (!m) return (
          <div key={i} className="mb-2">
            <p className="text-[9px] mb-1" style={{ color: NES.red }}>{row.name}</p>
            <div className="grid grid-cols-4 gap-1">
              {cols.map(c => <div key={c} className="text-center text-[9px] py-2 animate-pulse" style={{ background: NES.darkGray, color: NES.gray }}>...</div>)}
            </div>
          </div>
        )
        return (
          <div key={i} className="mb-2">
            <p className="text-[9px] mb-1" style={{ color: NES.red }}>{row.name}</p>
            <div className="grid grid-cols-4 gap-1">
              <CompareCell value={m.number} answer={answerMeta.number} mode="number" />
              <CompareCell value={m.birthCountry} answer={answerMeta.birthCountry} mode="exact" />
              <CompareCell value={String(m.age)} answer={String(answerMeta.age)} mode="age" />
              <CompareCell value={type === 'pitcher' ? (row.role || 'P') : m.position} answer={type === 'pitcher' ? (answerRole || 'P') : answerMeta.position} mode={type === 'pitcher' ? 'exact' : 'position'} playerType={type} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CompareCell({ value, answer, mode, playerType }: {
  value: string; answer: string; mode: 'number' | 'age' | 'exact' | 'position'; playerType?: PlayerType
}) {
  let bg = 'transparent'

  if (mode === 'number' || mode === 'age') {
    const diff = Math.abs(Number(value) - Number(answer))
    if (diff === 0) bg = NES.green
    else if (diff <= (mode === 'age' ? 1 : 5)) bg = NES.yellow
  } else if (mode === 'exact') {
    if (value === answer) bg = NES.green
  } else if (mode === 'position') {
    if (value === answer) bg = NES.green
    else if (samePositionCategory(value, answer)) bg = NES.yellow
  }

  const textColor = bg === NES.green || bg === NES.yellow ? '#000' : NES.white
  const cellBg = bg === 'transparent' ? NES.darkGray : bg

  return (
    <div className="text-center text-[9px] py-2 font-bold" style={{ background: cellBg, color: textColor }}>
      {value}
    </div>
  )
}

// ── Helpers ──
function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th'
  switch (n % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}

// ── Stat Card (improved percentile visibility) ──
function StatCard({ stat, def }: { stat: StatResult; def?: StatDef }) {
  const fallbackDef: StatDef = def ?? { key: stat.key, label: stat.label, unit: stat.unit || '', format: 'num', decimals: 1 }
  const colors = segmentColors(stat.percentile)
  const pColor = percentileColor(stat.percentile)
  return (
    <div className="group/stat relative border-2 p-2" style={{ borderColor: NES.gray }}>
      <p className="text-[7px] mb-1 truncate" style={{ color: NES.gray }}>{stat.label}</p>
      <p className="text-sm mb-2" style={{ color: NES.white }}>
        {formatStatValue(stat.value, fallbackDef)}
      </p>
      {/* Percentile bar */}
      <div className="flex gap-[2px] mb-1">
        {colors.map((c, i) => (
          <div key={i} className="flex-1 h-2" style={{ background: c }} />
        ))}
      </div>
      {/* Bigger, colored percentile */}
      <p className="text-xs text-right font-bold" style={{ color: pColor }}>
        {stat.percentile}<span className="text-[7px]">{ordinal(stat.percentile)}</span>
      </p>
      {/* Tooltip */}
      {def?.desc && (
        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-50 hidden group-hover/stat:block px-2 py-1.5 text-[8px] whitespace-normal max-w-[180px] leading-snug border-2 text-center"
          style={{ background: NES.bg, color: NES.white, borderColor: NES.gray }}>
          {def.desc}
        </span>
      )}
    </div>
  )
}

// ══════════════════════════════════════════
//  RESULT SCREEN
// ══════════════════════════════════════════
function ResultScreen({
  puzzle, guessRows, answerMeta, hintsUsed, won, score, year, type, onBack,
}: {
  puzzle: PuzzleData; guessRows: GuessRow[]; answerMeta: PlayerMeta | null
  hintsUsed: boolean[]; won: boolean; score: number; year: number; type: PlayerType
  onBack: () => void
}) {
  const [copied, setCopied] = useState(false)
  const tierDefs = type === 'pitcher' ? PITCHER_TIERS : HITTER_TIERS
  const statDefMap = useMemo(() => {
    const map = new Map<string, StatDef>()
    for (const tier of tierDefs) for (const d of tier) map.set(d.key, d)
    return map
  }, [tierDefs])

  const share = () => {
    const today = gameDay()
    const guessBlocks = Array.from({ length: 5 }, (_, i) => {
      if (i >= guessRows.length) return '\u2B1B'
      if (i === guessRows.length - 1 && won) return '\uD83D\uDFE9'
      return '\uD83D\uDFE5'
    }).join('')
    const text = [
      'PERCENTILE \u26BE',
      `${year} ${type.charAt(0).toUpperCase() + type.slice(1)} | ${today}`,
      won ? `\uD83D\uDFE9 ${score} pts (Guess ${guessRows.length})` : `\uD83D\uDFE5 0 pts`,
      guessBlocks,
    ].join('\n')
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <div className="min-h-screen p-4 max-w-lg mx-auto flex flex-col items-center">
      <div className="text-center mb-6 mt-8">
        <p className="text-xs mb-2" style={{ color: won ? NES.green : NES.red }}>
          {won ? 'MISSION COMPLETE' : 'GAME OVER'}
        </p>
        <p className="text-lg mb-1" style={{ color: NES.white }}>{puzzle.answer.name}</p>
        <p className="text-[10px]" style={{ color: NES.gray }}>{year} · {type.toUpperCase()} · {puzzle.hints.team}</p>
      </div>

      <div className="border-2 px-8 py-4 mb-6 text-center" style={{ borderColor: won ? NES.green : NES.red }}>
        <p className="text-[10px] mb-1" style={{ color: NES.gray }}>SCORE</p>
        <p className="text-2xl" style={{ color: won ? NES.green : NES.red }}>{score}</p>
        {won && (
          <p className="text-[8px] mt-1" style={{ color: NES.gray }}>
            GUESS {guessRows.length}/5 · {hintsUsed.filter(Boolean).length} HINT{hintsUsed.filter(Boolean).length !== 1 ? 'S' : ''} USED
          </p>
        )}
      </div>

      {/* Guess comparison grid in results */}
      {answerMeta && guessRows.length > 0 && (
        <div className="w-full mb-4">
          <GuessGrid guessRows={guessRows} answerMeta={answerMeta} answerRole={puzzle.pool.find(p => p.id === puzzle.answer.id)?.role} type={type} />
        </div>
      )}

      {/* All stats revealed */}
      <div className="w-full space-y-3 mb-6">
        {puzzle.tiers.map((tier, ti) => (
          <div key={ti}>
            <p className="text-[8px] mb-1 tracking-widest" style={{ color: NES.gray }}>{TIER_LABELS[ti]}</p>
            <div className={`grid gap-2 ${ti === 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {tier.stats.map(stat => (
                <StatCard key={stat.key} stat={stat} def={statDefMap.get(stat.key)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-4">
        <button onClick={share} className="px-4 py-2 text-[10px] border-2 transition-colors"
          style={{ borderColor: NES.blue, color: NES.blue }}>
          {copied ? 'COPIED!' : 'SHARE'}
        </button>
        <button onClick={onBack} className="px-4 py-2 text-[10px] border-2 transition-colors"
          style={{ borderColor: NES.gray, color: NES.gray }}>
          MENU
        </button>
      </div>
    </div>
  )
}
