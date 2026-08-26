/**
 * Extract the direct CDN mp4 URL from a Baseball Savant sporty-videos page.
 *
 * Dependency-free on purpose: both the Next route and the standalone tsx
 * download worker import this, and the worker parses .env.local by hand after
 * its imports have already been evaluated.
 *
 * The entity decoding is the whole point. Savant emits the URL inside HTML, so
 * the base64 path's `==` padding arrives as `&#x3D;&#x3D;`. Fetching the raw
 * match 404s — which is indistinguishable from "MLB never published this clip"
 * unless you look at the URL. That mistake settled tens of thousands of real
 * clips as terminal 'missing' in the archive. Clips whose base64 happens not to
 * need padding worked fine, which is why it looked like random per-game gaps.
 */

const MP4_RE = /https:\/\/sporty-clips\.mlb\.com\/[^"'\s\\<>]+\.mp4/

/** Decode the handful of entities that appear inside Savant's URLs. */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
}

/** The clip URL, ready to fetch, or null when the page carries no clip. */
export function extractSavantMp4Url(html: string): string | null {
  const m = html.match(MP4_RE)
  return m ? decodeHtmlEntities(m[0]) : null
}
