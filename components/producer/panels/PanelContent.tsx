'use client'

import type { PanelContent, PanelPosition } from '@/lib/producerTypes'
import StatLineRenderer from '../renderers/StatLineRenderer'
import StandingsRenderer from '../renderers/StandingsRenderer'
import LeaderboardRenderer from '../renderers/LeaderboardRenderer'
import MatchupRenderer from '../renderers/MatchupRenderer'
import ComparisonRenderer from '../renderers/ComparisonRenderer'
import CustomTextRenderer from '../renderers/CustomTextRenderer'
import ArsenalRenderer from '../renderers/ArsenalRenderer'
import MovementRenderer from '../renderers/MovementRenderer'

interface Props {
  content: PanelContent
  position: PanelPosition
}

export default function PanelContentRenderer({ content, position }: Props) {
  const { presetType, data } = content

  switch (presetType) {
    case 'stat-line':
      return <StatLineRenderer data={data as any} position={position} />
    case 'standings':
      return <StandingsRenderer data={data as any} position={position} />
    case 'leaderboard':
      return <LeaderboardRenderer data={data as any} position={position} />
    case 'matchup':
      return <MatchupRenderer data={data as any} position={position} />
    case 'comparison':
      return <ComparisonRenderer data={data as any} position={position} />
    case 'custom-text':
      return <CustomTextRenderer data={data as any} position={position} />
    case 'arsenal':
      return <ArsenalRenderer data={data as any} position={position} />
    case 'movement':
      return <MovementRenderer data={data as any} position={position} />
    default:
      return null
  }
}
