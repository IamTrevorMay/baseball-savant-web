// Pitch-playlist persistence (pitch_playlists + pitch_playlist_items, RLS
// owner-only). Shared by the Videos page and the game-log review modal so
// "Save as playlist" writes the same rows from either place.

import { supabase } from '@/lib/supabase'
import type { ClipRow } from '@/lib/video/types'
import { rowKey } from '@/lib/video/clip'

export interface Playlist {
  id: string
  name: string
  created_by: string
  created_at: string
  updated_at: string
  pitch_playlist_items?: { count: number }[]
}

/** Create an empty playlist owned by the signed-in user. */
export async function createPlaylist(name: string): Promise<Playlist | null> {
  const trimmed = (name || '').trim()
  if (!trimmed) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('pitch_playlists')
    .insert({ name: trimmed, created_by: user.id })
    .select()
    .single()
  if (error) {
    console.error('Error creating playlist:', error)
    return null
  }
  return data as Playlist
}

/**
 * Append clips to a playlist in the given order, starting after whatever is
 * already there. Returns an error message, or null on success.
 */
export async function appendPlaylistItems(
  playlistId: string,
  clips: ClipRow[],
): Promise<string | null> {
  if (!clips.length) return null
  const { data: existing } = await supabase
    .from('pitch_playlist_items')
    .select('position')
    .eq('playlist_id', playlistId)
  let pos = (existing || []).reduce((m, r) => Math.max(m, r.position), -1) + 1
  const rows = clips.map(c => ({
    playlist_id: playlistId,
    row_key: rowKey(c),
    clip: c,
    position: pos++,
  }))
  const { error } = await supabase.from('pitch_playlist_items').insert(rows)
  return error ? error.message : null
}
