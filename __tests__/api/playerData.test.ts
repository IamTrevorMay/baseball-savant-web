import { describe, it, expect } from 'vitest'

// Test the column prefixing logic extracted from player-data route

const BASE_COLUMNS = 'game_pk,game_date,game_year,game_type,pitcher,batter,player_name,stand,p_throws,pitch_name,pitch_type,release_speed,effective_speed,release_spin_rate,spin_axis,pfx_x,pfx_z,plate_x,plate_z,sz_top,sz_bot,zone,type,events,description,bb_type,balls,strikes,outs_when_up,inning,inning_topbot,home_team,away_team,launch_speed,launch_angle,launch_speed_angle,hit_distance_sc,release_extension,arm_angle,release_pos_x,release_pos_z,vx0,vy0,vz0,ax,ay,az,bat_speed,swing_length,estimated_ba_using_speedangle,estimated_woba_using_speedangle,estimated_slg_using_speedangle,woba_value,delta_run_exp,at_bat_number,pitch_number,home_score,away_score,n_thruorder_pitcher,if_fielding_alignment,of_fielding_alignment,on_1b,on_2b,on_3b,hc_x,hc_y,stuff_plus'

function prefixColumns(columns: string): string {
  return columns.split(',').map(c => `p.${c.trim()}`).join(', ')
}

describe('column prefixing', () => {
  it('prefixes every column with p.', () => {
    const result = prefixColumns(BASE_COLUMNS)
    const cols = result.split(', ')
    for (const col of cols) {
      expect(col).toMatch(/^p\.\w+$/)
    }
  })

  it('preserves all column names', () => {
    const result = prefixColumns(BASE_COLUMNS)
    expect(result).toContain('p.game_pk')
    expect(result).toContain('p.pitcher')
    expect(result).toContain('p.stuff_plus')
  })

  it('handles single column', () => {
    expect(prefixColumns('pitcher')).toBe('p.pitcher')
  })

  it('trims whitespace', () => {
    expect(prefixColumns('pitcher , batter')).toBe('p.pitcher, p.batter')
  })

  it('produces correct count', () => {
    const result = prefixColumns(BASE_COLUMNS)
    const inputCount = BASE_COLUMNS.split(',').length
    const outputCount = result.split(', ').length
    expect(outputCount).toBe(inputCount)
  })
})
