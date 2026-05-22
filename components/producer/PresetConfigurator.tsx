'use client'

import type { PresetType } from '@/lib/producerTypes'
import StatLineConfig from './presets/StatLineConfig'
import StandingsConfig from './presets/StandingsConfig'
import LeaderboardConfig from './presets/LeaderboardConfig'
import MatchupConfig from './presets/MatchupConfig'
import ComparisonConfig from './presets/ComparisonConfig'
import CustomTextConfig from './presets/CustomTextConfig'
import ArsenalConfig from './presets/ArsenalConfig'
import MovementConfig from './presets/MovementConfig'

interface Props {
  presetType: PresetType
  onChange: (config: any) => void
}

export default function PresetConfigurator({ presetType, onChange }: Props) {
  switch (presetType) {
    case 'stat-line':
      return <StatLineConfig onChange={onChange} />
    case 'standings':
      return <StandingsConfig onChange={onChange} />
    case 'leaderboard':
      return <LeaderboardConfig onChange={onChange} />
    case 'matchup':
      return <MatchupConfig onChange={onChange} />
    case 'comparison':
      return <ComparisonConfig onChange={onChange} />
    case 'custom-text':
      return <CustomTextConfig onChange={onChange} />
    case 'arsenal':
      return <ArsenalConfig onChange={onChange} />
    case 'movement':
      return <MovementConfig onChange={onChange} />
    default:
      return null
  }
}
