# Pitch Video Archive API

Search and resolve archived Baseball Savant pitch clips. Backed by the
`pitch_videos` index table (Supabase) and the clip archive on the Mayday Cloud
NAS (`/PitchVideos/{year}/{game_pk}/{play_id}.mp4`).

Consumers (Mayday Studio, broadcast tools) talk only to this endpoint — no
knowledge of the database, NAS layout, or Savant needed.

## Endpoint

```
GET https://<triton-host>/api/pitch-video
```

## Auth

```
Authorization: Bearer <key>
```

Keys are configured in the Triton env var `PITCH_VIDEO_API_KEYS`
(comma-separated; revoke by removing and redeploying). Requests without a
valid key get `401`.

## Modes

### 1. Single resolve

By Savant play id:

```
GET /api/pitch-video?play_id=1dddb847-90b9-3672-93c8-1ddd151bf5df
```

Or by composite pitch key:

```
GET /api/pitch-video?game_pk=822714&ab=1&pitch=3
```

Response:

```json
{
  "row": {
    "game_pk": 822714, "game_date": "2026-04-02", "at_bat_number": 1, "pitch_number": 3,
    "player_name": "Skenes, Paul", "batter_name": "Ohtani, Shohei",
    "pitch_type": "SL", "release_speed": 88.4, "events": "strikeout",
    "play_id": "1dddb847-...", "status": "downloaded",
    "video_url": "https://cloud-api.maydaystudio.net/api/nas/stream?path=%2FPitchVideos%2F2026%2F822714%2F1dddb847-....mp4&token=mck_...",
    "savant_url": "https://baseballsavant.mlb.com/sporty-videos?playId=1dddb847-..."
  }
}
```

**On-demand cache:** if the pitch isn't indexed yet (e.g. a pre-2026 pitch),
the API resolves the play_id live, queues it for the download worker
(`"queued": true` in the response), and returns `savant_url` for immediate
playback. Ask again later and `video_url` will be populated.

**Embedding not-yet-archived clips:** add `resolve_mp4=true` to a single
resolve and, when the clip isn't archived (`video_url` null), the API scrapes
the Savant page server-side and returns `savant_mp4_url` — a direct
`sporty-clips.mlb.com` CDN link that plays in a `<video>` tag. Best-effort
(null when Savant has no clip); adds ~0.5–1s to the request. Don't store it
long-term — CDN URLs aren't guaranteed stable.

### 2. Search

Any combination of filters (at least one required):

| Param | Type | Notes |
|---|---|---|
| `pitcher` | int | MLB player id |
| `batter` | int | MLB player id |
| `pitcher_name` | string | substring match, case-insensitive |
| `batter_name` | string | substring match, case-insensitive |
| `team` | string | 2–3 letter code, matches home or away |
| `pitch_type` | string | Statcast code(s), comma-separated: `FF,SL,CH` |
| `event` | string | lowercase Statcast events, comma-separated: `home_run,strikeout` |
| `description` | string | lowercase Statcast descriptions: `swinging_strike,called_strike` |
| `date_from` / `date_to` | YYYY-MM-DD | inclusive |
| `game_year` | int | season |
| `velo_min` / `velo_max` | float | release_speed bounds (mph) |
| `stand` / `p_throws` | `L`/`R` | batter side / pitcher hand |
| `balls` / `strikes` | int | count state |
| `inning` | int | |
| `zone` | int | Statcast zone 1–14 |
| `status` | string | `pending` / `downloaded` / `failed` / `missing` |
| `only_archived` | `true` | shorthand for `status=downloaded` |
| `limit` | int | default 50, max 500 |
| `offset` | int | pagination |

Example — all archived Skenes sliders that ended an AB with a strikeout:

```
GET /api/pitch-video?pitcher_name=Skenes&pitch_type=SL&event=strikeout&only_archived=true&limit=100
```

Response: `{ "rows": [ ...same row shape as above... ], "count": 100, "limit": 100, "offset": 0 }`

Rows are ordered `game_date DESC`, then game/AB/pitch.

## Playback & download

`video_url` streams with HTTP range support — works directly in a `<video>`
tag, VLC, or `curl -O`. Batch download = iterate rows, fetch each `video_url`.

```js
const res = await fetch(
  'https://<triton-host>/api/pitch-video?pitcher_name=Skenes&event=home_run&only_archived=true',
  { headers: { Authorization: `Bearer ${KEY}` } }
)
const { rows } = await res.json()
for (const row of rows) {
  // row.video_url → stream/download; row.savant_url → browser fallback
}
```

```bash
curl -H "Authorization: Bearer $KEY" \
  "https://<triton-host>/api/pitch-video?game_pk=822714&ab=1&pitch=3"
```

**Don't cache `video_url` long-term** — the embedded Mayday token can be
rotated. Re-resolve through this API when a stored URL starts returning 401.

## Status field

| Value | Meaning | `video_url` |
|---|---|---|
| `downloaded` | clip archived on NAS | populated |
| `pending` | queued for download worker | null — use `savant_url` |
| `failed` | download errored, will retry | null — use `savant_url` |
| `missing` | Savant has no clip for this pitch | null; `savant_url` may 404 too |

## Triton env vars

| Var | Purpose |
|---|---|
| `PITCH_VIDEO_API_KEYS` | comma-separated consumer keys for this endpoint |
| `MAYDAY_CLOUD_API_URL` | default `https://cloud-api.maydaystudio.net` |
| `MAYDAY_PITCH_VIDEO_TOKEN` | Mayday `mck_*` API key, **viewer role**, scoped to `/PitchVideos` |

## Pipeline (context)

1. `scripts/backfill-pitch-videos.ts` — resolves play_ids from Savant game feeds into `pitch_videos` (status `pending`)
2. `scripts/download-pitch-videos.ts` — runs on the machine with the NAS mounted; downloads clips, flips rows to `downloaded`
3. This API — search/resolve; also queues on-demand requests
