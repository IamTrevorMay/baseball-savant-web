'use client'

import { useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type {
  PanelPosition,
  PanelContent,
  PresetType,
  StatLineConfig,
  StandingsConfig,
  LeaderboardConfig,
  MatchupConfig,
  ComparisonConfig,
  CustomTextConfig,
  ArsenalConfig,
  MovementConfig,
  StatLineData,
  StandingsData,
  LeaderboardData,
  MatchupData,
  ComparisonData,
  ArsenalData,
  MovementData,
  ArsenalPitch,
} from './producerTypes'
import { SCENE_METRICS } from './reportMetrics'

function metricLabel(key: string): string {
  return SCENE_METRICS.find(m => m.value === key)?.label || key
}

// ── Data fetchers ───────────────────────────────────────────────────────────

async function fetchStatLine(config: StatLineConfig): Promise<PanelContent> {
  const params = new URLSearchParams({
    playerId: String(config.playerId),
    metrics: config.metrics.join(','),
    gameYear: String(config.season),
  })
  const res = await fetch(`/api/scene-stats?${params}`)
  const json = await res.json()

  const metricLabels: Record<string, string> = {}
  for (const m of config.metrics) {
    metricLabels[m] = metricLabel(m)
  }

  const data: StatLineData = {
    playerId: config.playerId,
    playerName: config.playerName,
    stats: json.stats || {},
    metricLabels,
  }
  return { presetType: 'stat-line', data, title: config.playerName }
}

async function fetchStandings(config: StandingsConfig): Promise<PanelContent> {
  const res = await fetch(`/api/standings?season=${config.season}`)
  const json = await res.json()

  const divisions = json.divisions || []
  let filtered = divisions

  if (config.division !== 'MLB') {
    if (config.division === 'AL' || config.division === 'NL') {
      filtered = divisions.filter((d: any) => d.league === config.division)
    } else {
      filtered = divisions.filter((d: any) => d.divisionAbbrev === config.division)
    }
  }

  // Take first matching division for single-div display
  const div = filtered[0]
  if (!div) {
    return {
      presetType: 'standings',
      data: { division: config.division, divisionAbbrev: config.division, teams: [] },
      title: 'Standings',
    }
  }

  const data: StandingsData = {
    division: div.division,
    divisionAbbrev: div.divisionAbbrev,
    teams: div.teams.map((t: any) => ({
      id: t.id,
      name: t.name,
      abbrev: t.abbrev,
      w: t.w,
      l: t.l,
      pct: t.pct,
      gb: t.gb,
      streak: t.streak,
      l10: t.l10,
    })),
  }
  return { presetType: 'standings', data, title: div.division }
}

async function fetchLeaderboard(config: LeaderboardConfig): Promise<PanelContent> {
  const params = new URLSearchParams({
    leaderboard: 'true',
    metric: config.metric,
    playerType: config.playerType,
    limit: String(config.count),
    gameYear: String(config.season),
  })
  const res = await fetch(`/api/scene-stats?${params}`)
  const json = await res.json()

  const entries = (json.leaderboard || []).map((e: any, i: number) => ({
    player_id: e.player_id,
    player_name: e.player_name,
    primary_value: e.primary_value,
    rank: i + 1,
  }))

  const data: LeaderboardData = {
    metric: config.metric,
    metricLabel: config.metricLabel,
    entries,
    playerType: config.playerType,
    season: config.season,
  }
  return { presetType: 'leaderboard', data, title: config.metricLabel + ' Leaders' }
}

async function fetchMatchup(config: MatchupConfig): Promise<PanelContent> {
  const defaultMetrics = 'avg_velo,whiff_pct,k_pct,bb_pct,xba'
  const [pitcherRes, batterRes] = await Promise.all([
    fetch(`/api/scene-stats?playerId=${config.pitcherId}&metrics=${defaultMetrics}&gameYear=${config.season}`),
    fetch(`/api/scene-stats?playerId=${config.batterId}&metrics=${defaultMetrics}&gameYear=${config.season}`),
  ])
  const [pitcherJson, batterJson] = await Promise.all([pitcherRes.json(), batterRes.json()])

  const metricLabels: Record<string, string> = {}
  for (const m of defaultMetrics.split(',')) {
    metricLabels[m] = metricLabel(m)
  }

  const data: MatchupData = {
    pitcher: {
      playerId: config.pitcherId,
      playerName: config.pitcherName,
      stats: pitcherJson.stats || {},
      metricLabels,
    },
    batter: {
      playerId: config.batterId,
      playerName: config.batterName,
      stats: batterJson.stats || {},
      metricLabels,
    },
  }
  return { presetType: 'matchup', data, title: `${config.pitcherName} vs ${config.batterName}` }
}

async function fetchComparison(config: ComparisonConfig): Promise<PanelContent> {
  const metricsStr = config.metrics.join(',')
  const [aRes, bRes] = await Promise.all([
    fetch(`/api/scene-stats?playerId=${config.playerAId}&metrics=${metricsStr}&gameYear=${config.season}`),
    fetch(`/api/scene-stats?playerId=${config.playerBId}&metrics=${metricsStr}&gameYear=${config.season}`),
  ])
  const [aJson, bJson] = await Promise.all([aRes.json(), bRes.json()])

  const metricLabels: Record<string, string> = {}
  for (const m of config.metrics) {
    metricLabels[m] = metricLabel(m)
  }

  const data: ComparisonData = {
    playerA: {
      playerId: config.playerAId,
      playerName: config.playerAName,
      stats: aJson.stats || {},
      metricLabels,
    },
    playerB: {
      playerId: config.playerBId,
      playerName: config.playerBName,
      stats: bJson.stats || {},
      metricLabels,
    },
    metrics: config.metrics,
    metricLabels,
  }
  return { presetType: 'comparison', data, title: `${config.playerAName} vs ${config.playerBName}` }
}

function buildCustomText(config: CustomTextConfig): PanelContent {
  return {
    presetType: 'custom-text',
    data: { headline: config.headline, subline: config.subline, body: config.body },
    title: config.headline,
  }
}

async function fetchArsenal(config: ArsenalConfig): Promise<PanelContent> {
  const res = await fetch(`/api/scene-stats?kinematics=true&playerId=${config.playerId}&gameYear=${config.season}`)
  const json = await res.json()
  const rows = json.pitches || []

  const pitches: ArsenalPitch[] = rows.map((r: any) => ({
    pitch_type: r.pitch_type,
    pitch_name: r.pitch_name || r.pitch_type,
    avg_velo: r.avg_velo ?? 0,
    ivb: r.ivb ?? r.pfx_z_in ?? 0,
    hb: r.hb ?? r.pfx_x_in ?? 0,
    usage_pct: r.usage_pct ?? 0,
    whiff_pct: r.whiff_pct,
    count: r.count ?? 0,
  }))

  const data: ArsenalData = {
    playerId: config.playerId,
    playerName: config.playerName,
    pitches,
  }
  return { presetType: 'arsenal', data, title: `${config.playerName} Arsenal` }
}

async function fetchMovement(config: MovementConfig): Promise<PanelContent> {
  const res = await fetch(`/api/scene-stats?kinematics=true&playerId=${config.playerId}&gameYear=${config.season}`)
  const json = await res.json()
  const rows = json.pitches || []

  // Individual pitch data for scatter
  const pitches = rows.map((r: any) => ({
    pitch_type: r.pitch_type,
    pitch_name: r.pitch_name || r.pitch_type,
    hb: r.hb ?? r.pfx_x_in ?? 0,
    ivb: r.ivb ?? r.pfx_z_in ?? 0,
  }))

  // Averages per pitch type
  const typeMap = new Map<string, { name: string; hbSum: number; ivbSum: number; count: number }>()
  for (const p of pitches) {
    const existing = typeMap.get(p.pitch_type)
    if (existing) {
      existing.hbSum += p.hb
      existing.ivbSum += p.ivb
      existing.count++
    } else {
      typeMap.set(p.pitch_type, { name: p.pitch_name, hbSum: p.hb, ivbSum: p.ivb, count: 1 })
    }
  }

  const averages = Array.from(typeMap.entries()).map(([pt, v]) => ({
    pitch_type: pt,
    pitch_name: v.name,
    hb: v.hbSum / v.count,
    ivb: v.ivbSum / v.count,
  }))

  const data: MovementData = {
    playerId: config.playerId,
    playerName: config.playerName,
    pitches,
    averages,
  }
  return { presetType: 'movement', data, title: `${config.playerName} Movement` }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useProducerControls(channel: RealtimeChannel | null) {
  const pushPanel = useCallback(async (
    position: PanelPosition,
    presetType: PresetType,
    config: any,
  ) => {
    if (!channel) throw new Error('Channel not connected')

    let content: PanelContent

    switch (presetType) {
      case 'stat-line':
        content = await fetchStatLine(config as StatLineConfig)
        break
      case 'standings':
        content = await fetchStandings(config as StandingsConfig)
        break
      case 'leaderboard':
        content = await fetchLeaderboard(config as LeaderboardConfig)
        break
      case 'matchup':
        content = await fetchMatchup(config as MatchupConfig)
        break
      case 'comparison':
        content = await fetchComparison(config as ComparisonConfig)
        break
      case 'custom-text':
        content = buildCustomText(config as CustomTextConfig)
        break
      case 'arsenal':
        content = await fetchArsenal(config as ArsenalConfig)
        break
      case 'movement':
        content = await fetchMovement(config as MovementConfig)
        break
      default:
        throw new Error(`Unknown preset type: ${presetType}`)
    }

    await channel.send({
      type: 'broadcast',
      event: 'producer:panel-show',
      payload: { position, content, timestamp: Date.now() },
    })

    return content
  }, [channel])

  const hidePanel = useCallback(async (position: PanelPosition) => {
    if (!channel) return
    await channel.send({
      type: 'broadcast',
      event: 'producer:panel-hide',
      payload: { position, timestamp: Date.now() },
    })
  }, [channel])

  const hideAllPanels = useCallback(async () => {
    if (!channel) return
    await Promise.all([
      channel.send({
        type: 'broadcast',
        event: 'producer:panel-hide',
        payload: { position: 'lower-bar', timestamp: Date.now() },
      }),
      channel.send({
        type: 'broadcast',
        event: 'producer:panel-hide',
        payload: { position: 'right-panel', timestamp: Date.now() },
      }),
    ])
  }, [channel])

  const updatePanel = useCallback(async (position: PanelPosition, content: PanelContent) => {
    if (!channel) return
    await channel.send({
      type: 'broadcast',
      event: 'producer:panel-update',
      payload: { position, content, timestamp: Date.now() },
    })
  }, [channel])

  return { pushPanel, hidePanel, hideAllPanels, updatePanel }
}
