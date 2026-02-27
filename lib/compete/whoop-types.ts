// ---- WHOOP API Response Types ----

export interface WhoopUser {
  user_id: number
  email: string
  first_name: string
  last_name: string
}

export interface WhoopCycleScore {
  strain: number
  kilojoule: number
  average_heart_rate: number
  max_heart_rate: number
}

export interface WhoopRecoveryScore {
  user_calibrating: boolean
  recovery_score: number
  resting_heart_rate: number
  hrv_rmssd_milli: number
  spo2_percentage?: number
  skin_temp_celsius?: number
}

export interface WhoopCycle {
  id: number
  user_id: number
  start: string
  end?: string
  score?: WhoopCycleScore
  recovery?: WhoopRecoveryScore
}

export interface WhoopSleepScore {
  stage_summary: {
    total_in_bed_time_milli: number
    total_awake_time_milli: number
    total_no_data_time_milli: number
    total_light_sleep_time_milli: number
    total_slow_wave_sleep_time_milli: number
    total_rem_sleep_time_milli: number
    sleep_cycle_count: number
    disturbance_count: number
  }
  sleep_needed: { baseline_milli: number; need_from_sleep_debt_milli: number; need_from_recent_strain_milli: number; need_from_recent_nap_milli: number }
  respiratory_rate: number
  sleep_performance_percentage: number
  sleep_consistency_percentage: number
  sleep_efficiency_percentage: number
}

export interface WhoopSleep {
  id: number
  user_id: number
  start: string
  end: string
  score?: WhoopSleepScore
  nap: boolean
}

export interface WhoopWorkoutScore {
  strain: number
  average_heart_rate: number
  max_heart_rate: number
  kilojoule: number
  percent_recorded: number
  distance_meter?: number
  altitude_gain_meter?: number
  altitude_change_meter?: number
  zone_duration: { zone_zero_milli: number; zone_one_milli: number; zone_two_milli: number; zone_three_milli: number; zone_four_milli: number; zone_five_milli: number }
}

export interface WhoopWorkout {
  id: number
  user_id: number
  start: string
  end: string
  sport_id: number
  score?: WhoopWorkoutScore
}

export interface WhoopRecovery {
  cycle_id: number
  sleep_id: number
  user_id: number
  created_at: string
  updated_at: string
  score_state: string
  score?: WhoopRecoveryScore
}

export interface WhoopPaginatedResponse<T> {
  records: T[]
  next_token?: string
}

// ---- DB Row Types ----

export interface WhoopTokenRow {
  id: string
  athlete_id: string
  whoop_user_id: string
  encrypted_access_token: string
  encrypted_refresh_token: string
  token_expires_at: string
  created_at: string
  updated_at: string
}

export interface WhoopCycleRow {
  id: string
  athlete_id: string
  whoop_cycle_id: string
  cycle_date: string
  recovery_score: number | null
  recovery_state: string | null
  hrv_rmssd: number | null
  resting_heart_rate: number | null
  strain_score: number | null
  spo2_pct: number | null
  skin_temp_celsius: number | null
  raw_data: unknown
  created_at: string
}

export interface WhoopSleepRow {
  id: string
  athlete_id: string
  whoop_sleep_id: string
  sleep_date: string
  sleep_score: number | null
  total_duration_ms: number | null
  rem_duration_ms: number | null
  sws_duration_ms: number | null
  light_duration_ms: number | null
  awake_duration_ms: number | null
  sleep_efficiency: number | null
  respiratory_rate: number | null
  raw_data: unknown
  created_at: string
}

export interface WhoopWorkoutRow {
  id: string
  athlete_id: string
  whoop_workout_id: string
  workout_date: string
  sport_name: string | null
  sport_id: number | null
  strain_score: number | null
  average_heart_rate: number | null
  max_heart_rate: number | null
  distance_meter: number | null
  duration_ms: number | null
  raw_data: unknown
  created_at: string
}

// ---- Frontend types (from data API) ----

export interface WhoopDashboardData {
  cycles: WhoopCycleRow[]
  sleep: WhoopSleepRow[]
  workouts: WhoopWorkoutRow[]
}

export function recoveryStateFromScore(score: number | null): 'green' | 'yellow' | 'red' | null {
  if (score === null || score === undefined) return null
  if (score >= 67) return 'green'
  if (score >= 34) return 'yellow'
  return 'red'
}

export const WHOOP_SPORT_NAMES: Record<number, string> = {
  [-1]: 'Activity',
  0: 'Running',
  1: 'Cycling',
  16: 'Baseball',
  17: 'Basketball',
  22: 'CrossFit',
  25: 'Elliptical',
  33: 'Hiking',
  43: 'Rowing',
  44: 'Rugby',
  48: 'Spinning',
  49: 'Swimming',
  50: 'Tennis',
  51: 'Track & Field',
  52: 'Volleyball',
  56: 'Weightlifting',
  57: 'Yoga',
  63: 'HIIT',
  64: 'Walking',
  71: 'Functional Fitness',
  84: 'Stretching',
}
