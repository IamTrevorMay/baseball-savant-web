import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdminLong as supabase } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      type = 'batting',
      season,
      limit = 10,
      sortBy,
      sortDir = 'DESC',
    } = body

    const safeLimit = Math.min(Math.max(parseInt(limit), 1), 100)
    const safeSortDir = sortDir === 'ASC' ? 'ASC' : 'DESC'
    const seasonFilter = season ? `AND game_year = ${parseInt(season)}` : ''

    let sql: string
    let defaultSort: string

    if (type === 'batting') {
      defaultSort = sortBy || 'ba'
      const safeSortBy = ['pa', 'h', 'hr_count', 'ba', 'obp', 'slg', 'ops', 'k_pct', 'bb_pct', 'avg_ev', 'batter'].includes(defaultSort)
        ? defaultSort : 'ba'

      sql = `
        SELECT
          b.batter,
          p.name AS player_name,
          COUNT(DISTINCT CASE WHEN w.events IS NOT NULL THEN w.game_pk::bigint * 10000 + w.at_bat_number END) AS pa,
          COUNT(CASE WHEN w.events IN ('single','double','triple','home_run') THEN 1 END) AS h,
          COUNT(CASE WHEN w.events = 'home_run' THEN 1 END) AS hr_count,
          CASE WHEN COUNT(CASE WHEN w.events IS NOT NULL AND w.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','sac_fly_double_play','catcher_interf') THEN 1 END) > 0
            THEN ROUND(COUNT(CASE WHEN w.events IN ('single','double','triple','home_run') THEN 1 END)::numeric
              / COUNT(CASE WHEN w.events IS NOT NULL AND w.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','sac_fly_double_play','catcher_interf') THEN 1 END), 3)
            ELSE 0 END AS ba,
          CASE WHEN COUNT(DISTINCT CASE WHEN w.events IS NOT NULL THEN w.game_pk::bigint * 10000 + w.at_bat_number END) > 0
            THEN ROUND((COUNT(CASE WHEN w.events IN ('single','double','triple','home_run','walk','hit_by_pitch') THEN 1 END))::numeric
              / COUNT(DISTINCT CASE WHEN w.events IS NOT NULL THEN w.game_pk::bigint * 10000 + w.at_bat_number END), 3)
            ELSE 0 END AS obp,
          CASE WHEN COUNT(CASE WHEN w.events IS NOT NULL AND w.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','sac_fly_double_play','catcher_interf') THEN 1 END) > 0
            THEN ROUND((
              COUNT(CASE WHEN w.events = 'single' THEN 1 END)
              + COUNT(CASE WHEN w.events = 'double' THEN 1 END) * 2
              + COUNT(CASE WHEN w.events = 'triple' THEN 1 END) * 3
              + COUNT(CASE WHEN w.events = 'home_run' THEN 1 END) * 4
            )::numeric / COUNT(CASE WHEN w.events IS NOT NULL AND w.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','sac_fly_double_play','catcher_interf') THEN 1 END), 3)
            ELSE 0 END AS slg,
          CASE WHEN COUNT(DISTINCT CASE WHEN w.events IS NOT NULL THEN w.game_pk::bigint * 10000 + w.at_bat_number END) > 0
            THEN ROUND(
              (COUNT(CASE WHEN w.events IN ('single','double','triple','home_run','walk','hit_by_pitch') THEN 1 END))::numeric
                / COUNT(DISTINCT CASE WHEN w.events IS NOT NULL THEN w.game_pk::bigint * 10000 + w.at_bat_number END)
              + CASE WHEN COUNT(CASE WHEN w.events IS NOT NULL AND w.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','sac_fly_double_play','catcher_interf') THEN 1 END) > 0
                THEN (COUNT(CASE WHEN w.events = 'single' THEN 1 END) + COUNT(CASE WHEN w.events = 'double' THEN 1 END) * 2 + COUNT(CASE WHEN w.events = 'triple' THEN 1 END) * 3 + COUNT(CASE WHEN w.events = 'home_run' THEN 1 END) * 4)::numeric
                  / COUNT(CASE WHEN w.events IS NOT NULL AND w.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','sac_fly_double_play','catcher_interf') THEN 1 END)
                ELSE 0 END
            , 3)
            ELSE 0 END AS ops,
          CASE WHEN COUNT(DISTINCT CASE WHEN w.events IS NOT NULL THEN w.game_pk::bigint * 10000 + w.at_bat_number END) > 0
            THEN ROUND(100.0 * COUNT(CASE WHEN w.events IN ('strikeout','strikeout_double_play') THEN 1 END)::numeric
              / COUNT(DISTINCT CASE WHEN w.events IS NOT NULL THEN w.game_pk::bigint * 10000 + w.at_bat_number END), 1)
            ELSE 0 END AS k_pct,
          CASE WHEN COUNT(DISTINCT CASE WHEN w.events IS NOT NULL THEN w.game_pk::bigint * 10000 + w.at_bat_number END) > 0
            THEN ROUND(100.0 * COUNT(CASE WHEN w.events = 'walk' THEN 1 END)::numeric
              / COUNT(DISTINCT CASE WHEN w.events IS NOT NULL THEN w.game_pk::bigint * 10000 + w.at_bat_number END), 1)
            ELSE 0 END AS bb_pct,
          ROUND(AVG(w.launch_speed)::numeric, 1) AS avg_ev
        FROM (SELECT DISTINCT batter FROM wbc_pitches WHERE pitch_type NOT IN ('PO','IN') ${seasonFilter}) b
        JOIN wbc_pitches w ON w.batter = b.batter AND w.pitch_type NOT IN ('PO','IN') ${seasonFilter}
        LEFT JOIN players p ON p.id = b.batter
        GROUP BY b.batter, p.name
        HAVING COUNT(DISTINCT CASE WHEN w.events IS NOT NULL THEN w.game_pk::bigint * 10000 + w.at_bat_number END) >= 5
        ORDER BY ${safeSortBy} ${safeSortDir}
        LIMIT ${safeLimit}
      `
    } else {
      defaultSort = sortBy || 'k_pct'
      const safeSortBy = ['pitches', 'k_pct', 'bb_pct', 'whiff_pct', 'avg_velo', 'ba', 'pitcher'].includes(defaultSort)
        ? defaultSort : 'k_pct'

      sql = `
        SELECT
          w.pitcher,
          w.player_name,
          COUNT(*) AS pitches,
          CASE WHEN COUNT(DISTINCT CASE WHEN w.events IS NOT NULL THEN w.game_pk::bigint * 10000 + w.at_bat_number END) > 0
            THEN ROUND(100.0 * COUNT(CASE WHEN w.events IN ('strikeout','strikeout_double_play') THEN 1 END)::numeric
              / COUNT(DISTINCT CASE WHEN w.events IS NOT NULL THEN w.game_pk::bigint * 10000 + w.at_bat_number END), 1)
            ELSE 0 END AS k_pct,
          CASE WHEN COUNT(DISTINCT CASE WHEN w.events IS NOT NULL THEN w.game_pk::bigint * 10000 + w.at_bat_number END) > 0
            THEN ROUND(100.0 * COUNT(CASE WHEN w.events = 'walk' THEN 1 END)::numeric
              / COUNT(DISTINCT CASE WHEN w.events IS NOT NULL THEN w.game_pk::bigint * 10000 + w.at_bat_number END), 1)
            ELSE 0 END AS bb_pct,
          ROUND(100.0 * COUNT(CASE WHEN w.description IN ('swinging_strike','swinging_strike_blocked','foul_tip','missed_bunt') THEN 1 END)::numeric
            / NULLIF(COUNT(CASE WHEN w.description IN ('swinging_strike','swinging_strike_blocked','foul_tip','missed_bunt','foul','foul_bunt','hit_into_play','hit_into_play_no_out','hit_into_play_score') THEN 1 END), 0), 1) AS whiff_pct,
          ROUND(AVG(w.release_speed)::numeric, 1) AS avg_velo,
          CASE WHEN COUNT(CASE WHEN w.events IS NOT NULL AND w.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','sac_fly_double_play','catcher_interf') THEN 1 END) > 0
            THEN ROUND(COUNT(CASE WHEN w.events IN ('single','double','triple','home_run') THEN 1 END)::numeric
              / COUNT(CASE WHEN w.events IS NOT NULL AND w.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','sac_fly_double_play','catcher_interf') THEN 1 END), 3)
            ELSE 0 END AS ba
        FROM wbc_pitches w
        WHERE w.pitch_type NOT IN ('PO','IN') ${seasonFilter}
        GROUP BY w.pitcher, w.player_name
        HAVING COUNT(*) >= 30
        ORDER BY ${safeSortBy} ${safeSortDir}
        LIMIT ${safeLimit}
      `
    }

    const { data, error } = await supabase.rpc('run_query', { query_text: sql })
    if (error) return NextResponse.json({ error: error.message, sql }, { status: 500 })

    return NextResponse.json({ rows: data || [], type })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
