import { NextRequest } from 'next/server'

// Bearer-token check shared by all Vision-facing routes. Pairs with
// `tools_sync.token` in Vision's config.toml.
export function checkVisionAuth(req: NextRequest): { ok: boolean; reason?: string } {
  const expected = process.env.VISION_INGEST_TOKEN
  if (!expected) return { ok: false, reason: 'server_misconfigured' }
  const auth = req.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (!m || m[1].trim() !== expected) return { ok: false, reason: 'unauthorized' }
  return { ok: true }
}
