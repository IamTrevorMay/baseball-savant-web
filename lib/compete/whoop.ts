import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  WhoopCycle,
  WhoopRecovery,
  WhoopSleep,
  WhoopWorkout,
  WhoopPaginatedResponse,
  WhoopTokenRow,
  recoveryStateFromScore,
  WHOOP_SPORT_NAMES,
} from './whoop-types'

const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer/v2'
const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'

// ---- Encryption helpers (AES-256-GCM) ----

function getEncryptionKey(): Buffer {
  const key = process.env.WHOOP_ENCRYPTION_KEY
  if (!key || key.length < 32) throw new Error('WHOOP_ENCRYPTION_KEY must be at least 32 characters')
  return Buffer.from(key.slice(0, 32), 'utf-8')
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv:tag:ciphertext (all base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decrypt(encoded: string): string {
  const [ivB64, tagB64, dataB64] = encoded.split(':')
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const data = Buffer.from(dataB64, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

// ---- OAuth helpers ----

export function getWhoopAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.WHOOP_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/compete/whoop/callback`,
    response_type: 'code',
    scope: 'offline read:recovery read:cycles read:sleep read:workout read:profile',
    state,
  })
  return `${WHOOP_AUTH_URL}?${params.toString()}`
}

export async function exchangeWhoopCode(code: string): Promise<{
  access_token: string
  refresh_token: string | null
  expires_in: number
  whoop_user_id: string
}> {
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.WHOOP_CLIENT_ID!,
      client_secret: process.env.WHOOP_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/compete/whoop/callback`,
    }),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`WHOOP token exchange failed: ${res.status} ${text}`)
  }

  let data: Record<string, unknown>
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`WHOOP token response not JSON: ${text.slice(0, 200)}`)
  }

  if (!data.access_token) {
    throw new Error(`WHOOP token response missing access_token: ${text.slice(0, 200)}`)
  }

  // Fetch user profile to get whoop_user_id
  const profileRes = await fetch(`${WHOOP_API_BASE}/user/profile/basic`, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  })
  const profile = await profileRes.json()

  return {
    access_token: data.access_token as string,
    refresh_token: (data.refresh_token as string) || null,
    expires_in: data.expires_in as number,
    whoop_user_id: String(profile.user_id),
  }
}

async function refreshWhoopToken(tokenRow: WhoopTokenRow): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  if (!tokenRow.encrypted_refresh_token) {
    throw new Error('No refresh token available — user must re-authenticate')
  }
  const currentRefreshToken = decrypt(tokenRow.encrypted_refresh_token)

  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: currentRefreshToken,
      client_id: process.env.WHOOP_CLIENT_ID!,
      client_secret: process.env.WHOOP_CLIENT_SECRET!,
    }),
  })

  if (!res.ok) {
    throw new Error(`WHOOP token refresh failed: ${res.status}`)
  }

  const data = await res.json()

  // Update stored tokens
  await supabaseAdmin.from('whoop_tokens').update({
    encrypted_access_token: encrypt(data.access_token),
    encrypted_refresh_token: encrypt(data.refresh_token),
    token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', tokenRow.id)

  return data
}

// ---- Token management ----

// Ensure we have a valid access token (refresh if needed). Call once before parallel fetches.
export async function ensureValidToken(athleteId: string): Promise<string> {
  const { data: tokenRow } = await supabaseAdmin
    .from('whoop_tokens')
    .select('*')
    .eq('athlete_id', athleteId)
    .single()

  if (!tokenRow) throw new Error('No WHOOP tokens found')

  let accessToken = decrypt(tokenRow.encrypted_access_token)

  // Check if token is expired (with 60s buffer)
  const expiresAt = new Date(tokenRow.token_expires_at).getTime()
  if (Date.now() > expiresAt - 60_000 && tokenRow.encrypted_refresh_token) {
    const refreshed = await refreshWhoopToken(tokenRow)
    accessToken = refreshed.access_token
  }

  return accessToken
}

// ---- Authenticated WHOOP API fetch ----

export async function whoopFetch(athleteId: string, path: string, params?: URLSearchParams, accessToken?: string): Promise<Response> {
  if (!accessToken) {
    accessToken = await ensureValidToken(athleteId)
  }

  const url = `${WHOOP_API_BASE}${path}${params ? '?' + params.toString() : ''}`
  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  // If 401, try refreshing token once
  if (res.status === 401) {
    const freshToken = await ensureValidToken(athleteId)
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${freshToken}` },
    })
  }

  return res
}

// ---- Paginated data fetchers ----

async function fetchPaginated<T>(athleteId: string, path: string, startDate: string, endDate: string, accessToken: string): Promise<T[]> {
  const allRecords: T[] = []
  let nextToken: string | undefined

  do {
    const params = new URLSearchParams({
      start: new Date(startDate).toISOString(),
      end: new Date(endDate + 'T23:59:59').toISOString(),
      limit: '25',
    })
    if (nextToken) params.set('nextToken', nextToken)

    const res = await whoopFetch(athleteId, path, params, accessToken)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`WHOOP API error ${res.status} on ${path}: ${body.slice(0, 300)}`)
    }

    const data: WhoopPaginatedResponse<T> = await res.json()
    allRecords.push(...data.records)
    nextToken = data.next_token
  } while (nextToken)

  return allRecords
}

export async function fetchCycles(athleteId: string, startDate: string, endDate: string, accessToken: string) {
  return fetchPaginated<WhoopCycle>(athleteId, '/cycle', startDate, endDate, accessToken)
}

export async function fetchSleep(athleteId: string, startDate: string, endDate: string, accessToken: string) {
  return fetchPaginated<WhoopSleep>(athleteId, '/activity/sleep', startDate, endDate, accessToken)
}

export async function fetchRecovery(athleteId: string, startDate: string, endDate: string, accessToken: string) {
  return fetchPaginated<WhoopRecovery>(athleteId, '/recovery', startDate, endDate, accessToken)
}

export async function fetchWorkouts(athleteId: string, startDate: string, endDate: string, accessToken: string) {
  return fetchPaginated<WhoopWorkout>(athleteId, '/activity/workout', startDate, endDate, accessToken)
}

// ---- Sync/Upsert helpers ----

export async function syncWhoopData(athleteId: string, days = 365) {
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0]

  // Refresh token ONCE before parallel fetches to avoid race conditions
  const accessToken = await ensureValidToken(athleteId)

  // Fetch all data types in parallel using the same valid token
  const [cycles, recoveries, sleeps, workouts] = await Promise.all([
    fetchCycles(athleteId, startDate, endDate, accessToken),
    fetchRecovery(athleteId, startDate, endDate, accessToken),
    fetchSleep(athleteId, startDate, endDate, accessToken),
    fetchWorkouts(athleteId, startDate, endDate, accessToken),
  ])

  // Build a map of cycle_id -> recovery for joining
  const recoveryByCycleId = new Map(
    recoveries.map(r => [r.cycle_id, r])
  )

  // Upsert cycles with recovery data joined in
  if (cycles.length > 0) {
    const rows = cycles.map(c => {
      const recovery = recoveryByCycleId.get(c.id)
      return {
        athlete_id: athleteId,
        whoop_cycle_id: String(c.id),
        cycle_date: c.start.split('T')[0],
        recovery_score: recovery?.score?.recovery_score ?? null,
        recovery_state: recoveryStateFromScore(recovery?.score?.recovery_score ?? null),
        hrv_rmssd: recovery?.score?.hrv_rmssd_milli ?? null,
        resting_heart_rate: recovery?.score?.resting_heart_rate ?? null,
        strain_score: c.score?.strain ?? null,
        spo2_pct: recovery?.score?.spo2_percentage ?? null,
        skin_temp_celsius: recovery?.score?.skin_temp_celsius ?? null,
        raw_data: { cycle: c, recovery },
      }
    })
    await supabaseAdmin.from('whoop_cycles').upsert(rows, { onConflict: 'athlete_id,whoop_cycle_id' })
  }

  // Upsert sleep (skip naps)
  if (sleeps.length > 0) {
    const rows = sleeps.filter(s => !s.nap).map(s => ({
      athlete_id: athleteId,
      whoop_sleep_id: String(s.id),
      sleep_date: s.start.split('T')[0],
      sleep_score: s.score?.sleep_performance_percentage ?? null,
      total_duration_ms: s.score?.stage_summary.total_in_bed_time_milli ?? null,
      rem_duration_ms: s.score?.stage_summary.total_rem_sleep_time_milli ?? null,
      sws_duration_ms: s.score?.stage_summary.total_slow_wave_sleep_time_milli ?? null,
      light_duration_ms: s.score?.stage_summary.total_light_sleep_time_milli ?? null,
      awake_duration_ms: s.score?.stage_summary.total_awake_time_milli ?? null,
      sleep_efficiency: s.score?.sleep_efficiency_percentage ?? null,
      respiratory_rate: s.score?.respiratory_rate ?? null,
      raw_data: s,
    }))
    await supabaseAdmin.from('whoop_sleep').upsert(rows, { onConflict: 'athlete_id,whoop_sleep_id' })
  }

  // Upsert workouts
  if (workouts.length > 0) {
    const rows = workouts.map(w => {
      const startMs = new Date(w.start).getTime()
      const endMs = new Date(w.end).getTime()
      return {
        athlete_id: athleteId,
        whoop_workout_id: String(w.id),
        workout_date: w.start.split('T')[0],
        sport_name: WHOOP_SPORT_NAMES[w.sport_id] || `Sport ${w.sport_id}`,
        sport_id: w.sport_id,
        strain_score: w.score?.strain ?? null,
        average_heart_rate: w.score?.average_heart_rate ?? null,
        max_heart_rate: w.score?.max_heart_rate ?? null,
        distance_meter: w.score?.distance_meter ?? null,
        duration_ms: endMs - startMs,
        raw_data: w,
      }
    })
    await supabaseAdmin.from('whoop_workouts').upsert(rows, { onConflict: 'athlete_id,whoop_workout_id' })
  }

  return { cycles: cycles.length, sleep: sleeps.length, workouts: workouts.length }
}
