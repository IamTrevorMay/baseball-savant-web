// Shared clip helpers — naming, formatting, and loading pitch clips as
// same-origin blob URLs so a <canvas> that draws them stays untainted
// (cross-origin video frames poison captureStream / toBlob / VideoFrame).
//
// Used by the Videos page and both video tools (telestrator, overlay).

import type { ClipRow } from './types'

export const label = (s: string | null) => String(s || '').replace(/_/g, ' ')
export const titleCase = (s: string | null) =>
  label(s).replace(/\b\w/g, c => c.toUpperCase())

// "Palmquist, Carson" → "Carson Palmquist"
export function flipName(name: string | null): string {
  const parts = String(name || '').split(',')
  if (parts.length === 2) return `${parts[1].trim()} ${parts[0].trim()}`
  return String(name || '').trim()
}

export const outcome = (row: ClipRow) =>
  titleCase(row.events || row.description || 'Unknown')

export const rowKey = (row: ClipRow) =>
  `${row.game_pk}-${row.at_bat_number}-${row.pitch_number}`

// [Pitcher] to [Hitter] [Pitch Type] [Count] [Outcome][ suffix].[ext]
// Default (no opts) is byte-identical to the original page filename.
export function clipFilename(
  row: ClipRow,
  opts: { suffix?: string; ext?: string } = {},
): string {
  const { suffix = '', ext = 'mp4' } = opts
  const raw = `${flipName(row.player_name)} to ${flipName(row.batter_name)} ${row.pitch_type || 'NA'} ${row.balls ?? '-'}-${row.strikes ?? '-'} ${outcome(row)}${suffix}`
  return `${raw.replace(/[^\w\-. ]+/g, '').replace(/\s+/g, ' ').trim()}.${ext}`
}

// Resolve a pitch row to a remote playable mp4 URL. Archived clips carry
// video_url (Mayday NAS); unarchived rows live-resolve the Savant CDN mp4.
export async function resolveClipUrl(row: ClipRow): Promise<string | null> {
  if (row.video_url) return row.video_url
  try {
    const res = await fetch(
      `/api/pitch-video?game_pk=${row.game_pk}&ab=${row.at_bat_number}&pitch=${row.pitch_number}&resolve_mp4=true`,
    )
    const json = await res.json().catch(() => ({}))
    return json?.row?.savant_mp4_url || null
  } catch {
    return null
  }
}

// Fetch the clip bytes and wrap them in a blob: object URL. The returned URL is
// same-origin, so a <video> pointed at it can be drawn into a canvas that we
// then export. Caller owns the URL and must URL.revokeObjectURL() it.
export async function loadClipObjectURL(row: ClipRow): Promise<string> {
  const src = await resolveClipUrl(row)
  if (!src) throw new Error('No playable clip is available for this pitch.')
  const res = await fetch(src)
  if (!res.ok) throw new Error(`Clip download failed (${res.status}).`)
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}
