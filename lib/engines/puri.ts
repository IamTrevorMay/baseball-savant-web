import type {
  PURIInput,
  PURIOutput,
  GameLogRow,
  GameLogEntry,
  InningVeloRow,
  RiskAlert,
  WorkloadMetrics,
} from './types'

// ── Helpers ─────────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  const da = new Date(a)
  const db = new Date(b)
  return Math.round(Math.abs(db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24))
}

function computeVeloFade(gameDate: string, inningVelo: InningVeloRow[]): number | null {
  const rows = inningVelo.filter(r => r.game_date === gameDate).sort((a, b) => a.inning - b.inning)
  if (rows.length < 2) return null
  const first = rows[0].avg_velo
  const last = rows[rows.length - 1].avg_velo
  return Math.round((first - last) * 10) / 10
}

// ── Main PURI engine ────────────────────────────────────────────────────────

export function computePURI(input: PURIInput): PURIOutput {
  const { gameLog, inningVelo, currentDate } = input
  const alerts: RiskAlert[] = []
  const adjustments: { rule: string; delta: number }[] = []

  if (!gameLog.length) {
    const emptyWorkload: WorkloadMetrics = {
      acuteLoad: 0, chronicLoad: 0, acwr: 0, acwrLabel: 'sweet-spot',
      role: 'starter', seasonBaselineVelo: null, recentVelo: null,
      veloDrop: null, avgVeloFade: null, highLevCount7d: 0, lastRestDays: null,
    }
    return {
      riskScore: 0, riskLevel: 'low', alerts: [], workload: emptyWorkload,
      enrichedLog: [], adjustments: [],
    }
  }

  // Sort chronologically (oldest first) for processing
  const sorted = [...gameLog].sort((a, b) => a.game_date.localeCompare(b.game_date))

  // ── Role detection ──────────────────────────────────────────────────────
  const totalPitches = sorted.reduce((s, g) => s + Number(g.pitches), 0)
  const avgPitchesPerGame = totalPitches / sorted.length
  const role: 'starter' | 'reliever' = avgPitchesPerGame > 60 ? 'starter' : 'reliever'
  const pitchThreshold = role === 'starter' ? 100 : 35

  // ── Enrich game log ───────────────────────────────────────────────────
  const enrichedLog: GameLogEntry[] = sorted.map((g, i) => {
    const restDays = i > 0 ? daysBetween(sorted[i - 1].game_date, g.game_date) : null
    const fade = computeVeloFade(g.game_date, inningVelo)
    const highLev = g.late_inning === 1 && g.close_game === 1 && g.had_runners === 1
    const pitchFlag = Number(g.pitches) > pitchThreshold

    return {
      game_date: g.game_date,
      game_pk: g.game_pk,
      pitches: Number(g.pitches),
      avg_fb_velo: g.avg_fb_velo,
      max_fb_velo: g.max_fb_velo,
      avg_spin: g.avg_spin,
      innings: Number(g.innings),
      batters_faced: Number(g.batters_faced),
      rest_days: restDays,
      velo_fade: fade,
      high_leverage: highLev,
      pitch_flag: pitchFlag,
    }
  })

  // Reverse for display (most recent first)
  const displayLog = [...enrichedLog].reverse()

  // ── Acute:Chronic Workload Ratio ──────────────────────────────────────
  const today = new Date(currentDate)
  const d7ago = new Date(today); d7ago.setDate(d7ago.getDate() - 7)
  const d28ago = new Date(today); d28ago.setDate(d28ago.getDate() - 28)

  const acuteGames = enrichedLog.filter(g => new Date(g.game_date) >= d7ago)
  const chronicGames = enrichedLog.filter(g => new Date(g.game_date) >= d28ago)

  const acuteLoad = acuteGames.reduce((s, g) => s + g.pitches, 0)
  const chronicTotal = chronicGames.reduce((s, g) => s + g.pitches, 0)
  const chronicLoad = chronicTotal / 4  // avg per 7 days over 28 days
  const acwr = chronicLoad > 0 ? Math.round((acuteLoad / chronicLoad) * 100) / 100 : 0

  let acwrLabel: WorkloadMetrics['acwrLabel'] = 'sweet-spot'
  if (acwr > 1.5) acwrLabel = 'spike'
  else if (acwr > 1.3) acwrLabel = 'caution'
  else if (acwr < 0.8) acwrLabel = 'underwork'

  // ── Velocity trend ────────────────────────────────────────────────────
  const veloGames = enrichedLog.filter(g => g.avg_fb_velo !== null)
  const seasonBaselineVelo = veloGames.length
    ? Math.round(veloGames.reduce((s, g) => s + g.avg_fb_velo!, 0) / veloGames.length * 10) / 10
    : null
  const recent3Velo = veloGames.slice(-3)
  const recentVelo = recent3Velo.length
    ? Math.round(recent3Velo.reduce((s, g) => s + g.avg_fb_velo!, 0) / recent3Velo.length * 10) / 10
    : null
  const veloDrop = seasonBaselineVelo !== null && recentVelo !== null
    ? Math.round((seasonBaselineVelo - recentVelo) * 10) / 10
    : null

  // ── Average velo fade ─────────────────────────────────────────────────
  const recentFadeGames = enrichedLog.filter(g => g.velo_fade !== null).slice(-5)
  const avgVeloFade = recentFadeGames.length
    ? Math.round(recentFadeGames.reduce((s, g) => s + g.velo_fade!, 0) / recentFadeGames.length * 10) / 10
    : null

  // ── High-leverage count (last 7 days) ─────────────────────────────────
  const highLevCount7d = acuteGames.filter(g => g.high_leverage).length

  // ── Last rest days ────────────────────────────────────────────────────
  const lastGame = enrichedLog[enrichedLog.length - 1]
  const lastRestDays = lastGame ? daysBetween(lastGame.game_date, currentDate) : null

  // ── Risk score computation ────────────────────────────────────────────
  let riskScore = 20 // baseline

  // Workload spike
  if (acwr > 1.5) {
    riskScore += 25
    adjustments.push({ rule: 'Workload spike', delta: 25 })
    alerts.push({
      level: 'danger', title: 'Workload Spike',
      message: `ACWR of ${acwr.toFixed(2)} indicates a significant workload spike. Acute load (${acuteLoad} pitches/7d) far exceeds chronic rate.`,
    })
  } else if (acwr > 1.3) {
    riskScore += 12
    adjustments.push({ rule: 'Workload caution', delta: 12 })
    alerts.push({
      level: 'warning', title: 'Elevated Workload',
      message: `ACWR of ${acwr.toFixed(2)} is in the caution zone. Monitor closely for additional stress indicators.`,
    })
  } else if (acwr < 0.8 && chronicLoad > 0) {
    riskScore += 8
    adjustments.push({ rule: 'Workload underwork', delta: 8 })
    alerts.push({
      level: 'info', title: 'Underwork / Detraining',
      message: `ACWR of ${acwr.toFixed(2)} suggests reduced activity. Sudden ramp-up from this state increases injury risk.`,
    })
  }

  // Velo alarm
  if (veloDrop !== null && veloDrop > 1.5) {
    riskScore += 20
    adjustments.push({ rule: 'Velo alarm', delta: 20 })
    alerts.push({
      level: 'danger', title: 'Velocity Alarm',
      message: `FB velocity dropped ${veloDrop.toFixed(1)} mph vs season average (${seasonBaselineVelo?.toFixed(1)} → ${recentVelo?.toFixed(1)}).`,
    })
  } else if (veloDrop !== null && veloDrop > 1.0) {
    riskScore += 10
    adjustments.push({ rule: 'Velo concern', delta: 10 })
    alerts.push({
      level: 'warning', title: 'Velocity Decline',
      message: `FB velocity down ${veloDrop.toFixed(1)} mph from season baseline. Worth monitoring for fatigue.`,
    })
  }

  // Short rest (most recent rest)
  const mostRecentWithRest = displayLog.find(g => g.rest_days !== null)
  if (mostRecentWithRest && role === 'starter' && mostRecentWithRest.rest_days !== null && mostRecentWithRest.rest_days < 3) {
    riskScore += 15
    adjustments.push({ rule: 'Short rest', delta: 15 })
    alerts.push({
      level: 'warning', title: 'Short Rest',
      message: `Last appearance was on ${mostRecentWithRest.rest_days} day(s) rest. Standard rest for starters is 4-5 days.`,
    })
  }

  // Back-to-back
  if (mostRecentWithRest && mostRecentWithRest.rest_days === 0) {
    riskScore += 10
    adjustments.push({ rule: 'Back-to-back', delta: 10 })
    alerts.push({
      level: 'danger', title: 'Back-to-Back',
      message: 'Pitched in consecutive games. Elevated soft tissue risk.',
    })
  }

  // High-leverage load
  if (highLevCount7d >= 3) {
    riskScore += 10
    adjustments.push({ rule: 'High-leverage load', delta: 10 })
    alerts.push({
      level: 'warning', title: 'High-Leverage Load',
      message: `${highLevCount7d} high-leverage appearances in the last 7 days (late inning, close game, runners on).`,
    })
  }

  // Avg velo fade
  if (avgVeloFade !== null && avgVeloFade > 2.0) {
    riskScore += 10
    adjustments.push({ rule: 'Avg velo fade', delta: 10 })
    alerts.push({
      level: 'warning', title: 'In-Game Velocity Fade',
      message: `Average within-game velo fade of ${avgVeloFade.toFixed(1)} mph across recent starts.`,
    })
  }

  // Heavy recent game
  if (displayLog.length > 0 && displayLog[0].pitch_flag) {
    riskScore += 8
    adjustments.push({ rule: 'Heavy recent game', delta: 8 })
    alerts.push({
      level: 'info', title: 'Heavy Workload',
      message: `Most recent outing: ${displayLog[0].pitches} pitches (above ${pitchThreshold} threshold for ${role}).`,
    })
  }

  // Low workload bonus
  if (acwrLabel === 'sweet-spot' && (veloDrop === null || veloDrop <= 0.5)) {
    riskScore -= 10
    adjustments.push({ rule: 'Low workload (sweet spot)', delta: -10 })
  }

  // Clamp
  riskScore = Math.max(0, Math.min(100, riskScore))

  // Risk level
  let riskLevel: PURIOutput['riskLevel'] = 'low'
  if (riskScore > 75) riskLevel = 'high'
  else if (riskScore > 50) riskLevel = 'elevated'
  else if (riskScore > 25) riskLevel = 'moderate'

  const workload: WorkloadMetrics = {
    acuteLoad, chronicLoad: Math.round(chronicLoad), acwr, acwrLabel,
    role, seasonBaselineVelo, recentVelo, veloDrop, avgVeloFade,
    highLevCount7d, lastRestDays,
  }

  return {
    riskScore, riskLevel, alerts, workload,
    enrichedLog: displayLog, adjustments,
  }
}
