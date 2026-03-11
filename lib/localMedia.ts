/**
 * Convert a stored media path to a usable URL.
 * - Remote URLs (http/https) pass through as-is
 * - API paths (/api/...) pass through as-is
 * - Supabase storage URLs pass through as-is
 * - Local file paths get wrapped in /api/local-media?path=...
 */
export function toMediaUrl(path: string | null | undefined): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (path.startsWith('/api/')) return path
  if (path.startsWith('blob:')) return path
  // Local filesystem path — serve via API route
  return `/api/local-media?path=${encodeURIComponent(path)}`
}
