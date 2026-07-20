// Shared pitch-clip row shape used by the Videos page and its video tools
// (telestrator, overlay). This is the row returned by /api/pitch-video plus
// the per-row status/url fields the page adds.

export interface ClipRow {
  game_pk: number
  game_date: string
  at_bat_number: number
  pitch_number: number
  player_name: string
  batter_name: string
  pitch_type: string | null
  pitch_name: string | null
  release_speed: number | null
  balls: number | null
  strikes: number | null
  outs_when_up: number | null
  inning: number | null
  inning_topbot: string | null
  home_team: string
  away_team: string
  events: string | null
  description: string | null
  launch_speed: number | null
  launch_angle: number | null
  status: string | null
  video_url: string | null
  savant_url: string | null
}
