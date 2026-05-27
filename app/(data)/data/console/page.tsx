import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type IngestLogRow = {
  id: string
  source: string
  started_at: string
  finished_at: string | null
  pitches_inserted: number
  pitches_skipped: number
  files_seen: number
  files_downloaded: number
  error_text: string | null
}

type SessionRow = {
  id: string
  source: string
  session_date: string | null
  session_name: string | null
  tm_session_id: string | null
  pitch_count: number
  received_at: string
}

async function loadDashboard() {
  const [sessionsCountQ, pitchesCountQ, lastVisionQ, lastErrorQ, recentSessionsQ, recentLogsQ] = await Promise.all([
    supabaseAdmin.from('trackman_sessions').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('trackman_pitches').select('id', { count: 'exact', head: true }),
    supabaseAdmin
      .from('trackman_sessions')
      .select('received_at')
      .eq('source', 'vision_live')
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('trackman_ingest_log')
      .select('id, source, started_at, error_text')
      .not('error_text', 'is', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('trackman_sessions')
      .select('id, source, session_date, session_name, tm_session_id, pitch_count, received_at')
      .order('received_at', { ascending: false })
      .limit(10),
    supabaseAdmin
      .from('trackman_ingest_log')
      .select('id, source, started_at, finished_at, pitches_inserted, pitches_skipped, files_seen, files_downloaded, error_text')
      .order('started_at', { ascending: false })
      .limit(10),
  ])

  return {
    sessionsCount: sessionsCountQ.count ?? 0,
    pitchesCount: pitchesCountQ.count ?? 0,
    lastVisionAt: (lastVisionQ.data as { received_at: string } | null)?.received_at ?? null,
    lastError: lastErrorQ.data as { id: string; source: string; started_at: string; error_text: string } | null,
    recentSessions: (recentSessionsQ.data ?? []) as SessionRow[],
    recentLogs: (recentLogsQ.data ?? []) as IngestLogRow[],
  }
}

function fmtTs(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function fmtRelative(iso: string | null) {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
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

export default async function ConsolePage() {
  const d = await loadDashboard()

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <header className="flex items-end justify-between mb-8">
        <div>
          <div className="text-xs text-zinc-500 mb-1"><Link href="/data" className="hover:text-zinc-300">Data</Link> / Console</div>
          <h1 className="font-[family-name:var(--font-bebas)] text-4xl uppercase text-indigo-400 tracking-widest">Console</h1>
          <p className="text-sm text-zinc-500 mt-1">Ingest health, raw retention, and recent activity across all integrations.</p>
        </div>
        <Link href="/data" className="text-xs text-zinc-500 hover:text-zinc-300">← Data</Link>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatTile label="Sessions" value={d.sessionsCount.toLocaleString()} sub="all sources" />
        <StatTile label="Pitches" value={d.pitchesCount.toLocaleString()} sub="all sources" />
        <StatTile label="Last Vision ingest" value={fmtRelative(d.lastVisionAt)} sub={fmtTs(d.lastVisionAt)} />
        <StatTile
          label="Last error"
          value={d.lastError ? fmtRelative(d.lastError.started_at) : 'none'}
          sub={d.lastError ? `${d.lastError.source}: ${d.lastError.error_text.slice(0, 60)}` : 'clean'}
          tone={d.lastError ? 'error' : 'ok'}
        />
      </div>

      <section className="mb-8">
        <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Integrations</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <IntegrationCard name="TrackMan — Triton Vision" status="live" desc="Sniff-based pipeline. End-of-session push to /api/trackman/ingest." />
          <IntegrationCard name="TrackMan — Webhook" status="stub" desc="Awaiting payload contract from TrackMan. Endpoint not yet exposed." />
          <IntegrationCard name="TrackMan — FTP nightly" status="stub" desc="Reconciliation cron not yet built. Credentials pending." />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Recent sessions</h2>
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
              {d.recentSessions.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-zinc-500">No sessions yet.</td></tr>
              )}
              {d.recentSessions.map(s => (
                <tr key={s.id} className="border-t border-zinc-800 hover:bg-zinc-800/40">
                  <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">
                    <Link href={`/data/trackman/${s.id}`} className="hover:text-indigo-300">{fmtTs(s.received_at)}</Link>
                  </td>
                  <td className="px-3 py-2"><SourcePill source={s.source} /></td>
                  <td className="px-3 py-2 text-zinc-400">{s.session_date ?? '—'}</td>
                  <td className="px-3 py-2 text-zinc-300">{s.session_name ?? '—'}</td>
                  <td className="px-3 py-2 text-zinc-500 font-mono text-xs">{s.tm_session_id ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">{s.pitch_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Ingest log</h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Started</th>
                <th className="text-left px-3 py-2 font-medium">Source</th>
                <th className="text-left px-3 py-2 font-medium">Finished</th>
                <th className="text-right px-3 py-2 font-medium">Files</th>
                <th className="text-right px-3 py-2 font-medium">Inserted</th>
                <th className="text-right px-3 py-2 font-medium">Skipped</th>
                <th className="text-left px-3 py-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {d.recentLogs.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-zinc-500">No runs logged.</td></tr>
              )}
              {d.recentLogs.map(r => (
                <tr key={r.id} className="border-t border-zinc-800">
                  <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">{fmtTs(r.started_at)}</td>
                  <td className="px-3 py-2"><SourcePill source={r.source} /></td>
                  <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{r.finished_at ? fmtRelative(r.finished_at) : 'running'}</td>
                  <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">{r.files_downloaded}/{r.files_seen}</td>
                  <td className="px-3 py-2 text-right text-emerald-300 tabular-nums">{r.pitches_inserted}</td>
                  <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">{r.pitches_skipped}</td>
                  <td className="px-3 py-2 text-red-300 text-xs">{r.error_text ? r.error_text.slice(0, 80) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'error' }) {
  const valueColor = tone === 'error' ? 'text-red-300' : tone === 'ok' ? 'text-emerald-300' : 'text-white'
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1 truncate">{sub}</div>}
    </div>
  )
}

function IntegrationCard({ name, status, desc }: { name: string; status: 'live' | 'stub'; desc: string }) {
  const statusCls = status === 'live'
    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    : 'bg-zinc-700/40 text-zinc-400 border-zinc-600'
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-zinc-200">{name}</div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${statusCls}`}>{status}</span>
      </div>
      <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
    </div>
  )
}
