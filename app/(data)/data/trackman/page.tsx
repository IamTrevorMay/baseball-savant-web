import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type SessionRow = {
  id: string
  source: string
  session_date: string | null
  session_name: string | null
  tm_session_id: string | null
  pitch_count: number
  received_at: string
}

const ALL_SOURCES = ['vision_live', 'webhook', 'ftp_reconcile', 'ftp_backfill'] as const

async function loadSessions(source: string | null, days: number) {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  let q = supabaseAdmin
    .from('trackman_sessions')
    .select('id, source, session_date, session_name, tm_session_id, pitch_count, received_at')
    .gte('received_at', sinceIso)
    .order('received_at', { ascending: false })
    .limit(200)
  if (source) q = q.eq('source', source)
  const { data } = await q
  return (data ?? []) as SessionRow[]
}

function fmtTs(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

const SOURCE_COLOR: Record<string, string> = {
  vision_live:    'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  webhook:        'bg-amber-500/15 text-amber-300 border-amber-500/30',
  ftp_reconcile:  'bg-sky-500/15 text-sky-300 border-sky-500/30',
  ftp_backfill:   'bg-zinc-700/40 text-zinc-300 border-zinc-600',
}

function SourcePill({ source }: { source: string }) {
  const cls = SOURCE_COLOR[source] || 'bg-zinc-700/40 text-zinc-300 border-zinc-600'
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>{source}</span>
}

type SearchParams = Promise<{ source?: string; days?: string }>

export default async function TrackmanSessionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const source = params.source && ALL_SOURCES.includes(params.source as typeof ALL_SOURCES[number]) ? params.source : null
  const days = Number.isFinite(Number(params.days)) ? Math.max(1, Math.min(365, Number(params.days))) : 30
  const rows = await loadSessions(source, days)
  const totalPitches = rows.reduce((acc, r) => acc + (r.pitch_count || 0), 0)

  const sourceTabs: { value: string | null; label: string }[] = [
    { value: null, label: 'All' },
    { value: 'vision_live', label: 'Vision' },
    { value: 'webhook', label: 'Webhook' },
    { value: 'ftp_reconcile', label: 'FTP' },
    { value: 'ftp_backfill', label: 'Backfill' },
  ]

  const dayOptions = [7, 30, 90, 365]

  const buildHref = (s: string | null, d: number) => {
    const sp = new URLSearchParams()
    if (s) sp.set('source', s)
    sp.set('days', String(d))
    const qs = sp.toString()
    return qs ? `/data/trackman?${qs}` : '/data/trackman'
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <header className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs text-zinc-500 mb-1"><Link href="/data" className="hover:text-zinc-300">Data</Link> / TrackMan</div>
          <h1 className="font-[family-name:var(--font-bebas)] text-4xl uppercase text-emerald-400 tracking-widest">TrackMan</h1>
          <p className="text-sm text-zinc-500 mt-1">Sessions across all ingest sources. Click a row to drill into pitches.</p>
        </div>
        <Link href="/data" className="text-xs text-zinc-500 hover:text-zinc-300">← Data</Link>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex gap-1">
          {sourceTabs.map(t => {
            const active = (t.value ?? null) === source
            return (
              <Link
                key={t.label}
                href={buildHref(t.value, days)}
                className={`text-xs px-2.5 py-1 rounded border transition ${
                  active ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {t.label}
              </Link>
            )
          })}
        </div>
        <div className="flex gap-1">
          {dayOptions.map(d => (
            <Link
              key={d}
              href={buildHref(source, d)}
              className={`text-xs px-2.5 py-1 rounded border transition ${
                d === days ? 'bg-zinc-700 text-white border-zinc-600' : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              {d}d
            </Link>
          ))}
        </div>
        <div className="ml-auto text-xs text-zinc-500 tabular-nums">
          {rows.length} sessions · {totalPitches.toLocaleString()} pitches
        </div>
      </div>

      {/* Sessions table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Received</th>
              <th className="text-left px-3 py-2 font-medium">Source</th>
              <th className="text-left px-3 py-2 font-medium">Session date</th>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">TM session ID</th>
              <th className="text-right px-3 py-2 font-medium">Pitches</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-zinc-500">No sessions in this window.</td></tr>
            )}
            {rows.map(s => (
              <tr key={s.id} className="border-t border-zinc-800 hover:bg-zinc-800/40 cursor-pointer">
                <td className="px-0 py-0" colSpan={6}>
                  <Link href={`/data/trackman/${s.id}`} className="grid grid-cols-[1.5fr_0.8fr_1fr_1.5fr_2fr_0.6fr] items-center px-3 py-2">
                    <span className="text-zinc-300 whitespace-nowrap">{fmtTs(s.received_at)}</span>
                    <span><SourcePill source={s.source} /></span>
                    <span className="text-zinc-400">{s.session_date ?? '—'}</span>
                    <span className="text-zinc-300 truncate">{s.session_name ?? '—'}</span>
                    <span className="text-zinc-500 font-mono text-xs truncate">{s.tm_session_id ?? '—'}</span>
                    <span className="text-right text-zinc-300 tabular-nums">{s.pitch_count}</span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
