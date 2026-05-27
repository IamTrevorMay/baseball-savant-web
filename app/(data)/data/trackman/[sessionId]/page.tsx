import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type Session = {
  id: string
  source: string
  session_date: string | null
  session_name: string | null
  tm_session_id: string | null
  pitch_count: number
  received_at: string
  raw_file_path: string | null
  raw_meta: Record<string, unknown> | null
}

type Pitch = {
  id: string
  pitch_uid: string | null
  pitch_no: number | null
  pitch_time: string | null
  pitcher_name: string | null
  pitcher_throws: string | null
  tagged_pitch_type: string | null
  pitch_call: string | null
  balls: number | null
  strikes: number | null
  rel_speed: number | null
  spin_rate: number | null
  spin_axis: number | null
  tilt: string | null
  rel_height: number | null
  rel_side: number | null
  extension: number | null
  induced_vert_break: number | null
  horz_break: number | null
  plate_loc_height: number | null
  plate_loc_side: number | null
}

async function loadSession(id: string) {
  const { data: session } = await supabaseAdmin
    .from('trackman_sessions')
    .select('id, source, session_date, session_name, tm_session_id, pitch_count, received_at, raw_file_path, raw_meta')
    .eq('id', id)
    .maybeSingle()
  if (!session) return null

  const { data: pitches } = await supabaseAdmin
    .from('trackman_pitches')
    .select(
      'id, pitch_uid, pitch_no, pitch_time, pitcher_name, pitcher_throws, tagged_pitch_type, pitch_call, balls, strikes, rel_speed, spin_rate, spin_axis, tilt, rel_height, rel_side, extension, induced_vert_break, horz_break, plate_loc_height, plate_loc_side',
    )
    .eq('session_id', id)
    .order('pitch_no', { ascending: true, nullsFirst: false })
    .order('pitch_time', { ascending: true, nullsFirst: false })
    .limit(2000)

  return {
    session: session as Session,
    pitches: (pitches ?? []) as Pitch[],
  }
}

function fmtTs(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function fmtNum(n: number | null, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toFixed(digits)
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

const CALL_COLOR: Record<string, string> = {
  StrikeCalled:   'text-emerald-300',
  StrikeSwinging: 'text-emerald-300',
  BallCalled:     'text-zinc-400',
  BallinDirt:     'text-zinc-400',
  HitByPitch:     'text-amber-300',
  FoulBall:       'text-zinc-300',
  FoulBallNotFieldable: 'text-zinc-300',
  FoulBallFieldable:    'text-zinc-300',
  InPlay:         'text-cyan-300',
}

function PitchCallText({ call }: { call: string | null }) {
  if (!call) return <span className="text-zinc-600">—</span>
  return <span className={CALL_COLOR[call] || 'text-zinc-300'}>{call}</span>
}

type RouteParams = Promise<{ sessionId: string }>

export default async function SessionPitchesPage({ params }: { params: RouteParams }) {
  const { sessionId } = await params
  const result = await loadSession(sessionId)
  if (!result) notFound()
  const { session, pitches } = result

  // Quick aggregates
  const pitchersSet = new Set<string>()
  const typesMap: Record<string, number> = {}
  let speeds: number[] = []
  let spins: number[] = []
  for (const p of pitches) {
    if (p.pitcher_name) pitchersSet.add(p.pitcher_name)
    const t = p.tagged_pitch_type || 'Unknown'
    typesMap[t] = (typesMap[t] || 0) + 1
    if (p.rel_speed != null) speeds.push(p.rel_speed)
    if (p.spin_rate != null) spins.push(p.spin_rate)
  }
  const avgSpeed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null
  const avgSpin  = spins.length ? spins.reduce((a, b) => a + b, 0) / spins.length : null
  const typeRows = Object.entries(typesMap).sort((a, b) => b[1] - a[1])

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8">
      <header className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs text-zinc-500 mb-1">
            <Link href="/data" className="hover:text-zinc-300">Data</Link>
            {' / '}
            <Link href="/data/trackman" className="hover:text-zinc-300">TrackMan</Link>
            {' / Session'}
          </div>
          <div className="flex items-center gap-3">
            <h1 className="font-[family-name:var(--font-bebas)] text-3xl uppercase text-emerald-400 tracking-widest">
              {session.session_name || session.tm_session_id || session.id.slice(0, 8)}
            </h1>
            <SourcePill source={session.source} />
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            Received {fmtTs(session.received_at)}
            {session.session_date && <> · session date {session.session_date}</>}
            {session.tm_session_id && <> · TM id <span className="font-mono">{session.tm_session_id}</span></>}
          </div>
        </div>
        <Link href="/data/trackman" className="text-xs text-zinc-500 hover:text-zinc-300">← Sessions</Link>
      </header>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatTile label="Pitches" value={pitches.length.toLocaleString()} sub={`of ${session.pitch_count} recorded`} />
        <StatTile label="Pitchers" value={pitchersSet.size.toLocaleString()} sub="distinct" />
        <StatTile label="Pitch types" value={typeRows.length.toLocaleString()} sub="tagged" />
        <StatTile label="Avg velo" value={avgSpeed != null ? `${avgSpeed.toFixed(1)} mph` : '—'} sub={`${speeds.length} pitches`} />
        <StatTile label="Avg spin" value={avgSpin != null ? `${Math.round(avgSpin)} rpm` : '—'} sub={`${spins.length} pitches`} />
      </div>

      {/* Pitch type breakdown */}
      {typeRows.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Pitch mix</h2>
          <div className="flex flex-wrap gap-2">
            {typeRows.map(([type, count]) => (
              <div key={type} className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs">
                <span className="text-zinc-300">{type}</span>
                <span className="text-zinc-500 ml-2 tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pitches table */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Pitches</h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-900/80 text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="text-right px-2 py-2 font-medium">#</th>
                <th className="text-left  px-2 py-2 font-medium">Pitcher</th>
                <th className="text-left  px-2 py-2 font-medium">Hand</th>
                <th className="text-left  px-2 py-2 font-medium">Type</th>
                <th className="text-left  px-2 py-2 font-medium">Call</th>
                <th className="text-right px-2 py-2 font-medium">Count</th>
                <th className="text-right px-2 py-2 font-medium">Velo</th>
                <th className="text-right px-2 py-2 font-medium">Spin</th>
                <th className="text-right px-2 py-2 font-medium">Tilt</th>
                <th className="text-right px-2 py-2 font-medium">IVB</th>
                <th className="text-right px-2 py-2 font-medium">HB</th>
                <th className="text-right px-2 py-2 font-medium">Ext</th>
                <th className="text-right px-2 py-2 font-medium">Rel ht</th>
                <th className="text-right px-2 py-2 font-medium">Rel sd</th>
                <th className="text-right px-2 py-2 font-medium">Plate H</th>
                <th className="text-right px-2 py-2 font-medium">Plate S</th>
              </tr>
            </thead>
            <tbody>
              {pitches.length === 0 && (
                <tr><td colSpan={16} className="px-3 py-10 text-center text-zinc-500">No pitches recorded in this session.</td></tr>
              )}
              {pitches.map(p => (
                <tr key={p.id} className="border-t border-zinc-800 hover:bg-zinc-800/40">
                  <td className="px-2 py-1.5 text-right text-zinc-500 tabular-nums">{p.pitch_no ?? '—'}</td>
                  <td className="px-2 py-1.5 text-zinc-300 whitespace-nowrap">{p.pitcher_name ?? '—'}</td>
                  <td className="px-2 py-1.5 text-zinc-500">{p.pitcher_throws ?? '—'}</td>
                  <td className="px-2 py-1.5 text-zinc-300">{p.tagged_pitch_type ?? '—'}</td>
                  <td className="px-2 py-1.5"><PitchCallText call={p.pitch_call} /></td>
                  <td className="px-2 py-1.5 text-right text-zinc-500 tabular-nums">{p.balls ?? 0}-{p.strikes ?? 0}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-100 tabular-nums">{fmtNum(p.rel_speed, 1)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-300 tabular-nums">{p.spin_rate != null ? Math.round(p.spin_rate) : '—'}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400 tabular-nums">{p.tilt ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-300 tabular-nums">{fmtNum(p.induced_vert_break, 1)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-300 tabular-nums">{fmtNum(p.horz_break, 1)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400 tabular-nums">{fmtNum(p.extension, 2)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400 tabular-nums">{fmtNum(p.rel_height, 2)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400 tabular-nums">{fmtNum(p.rel_side, 2)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400 tabular-nums">{fmtNum(p.plate_loc_height, 2)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400 tabular-nums">{fmtNum(p.plate_loc_side, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pitches.length === 2000 && (
          <p className="text-xs text-zinc-500 mt-2">Showing first 2000 pitches. Pagination not yet wired.</p>
        )}
      </section>

      {/* Raw meta (collapsed by default) */}
      {(session.raw_file_path || session.raw_meta) && (
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Raw session metadata</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-xs">
            {session.raw_file_path && (
              <div className="mb-2">
                <span className="text-zinc-500">raw_file_path: </span>
                <span className="font-mono text-zinc-300">{session.raw_file_path}</span>
              </div>
            )}
            {session.raw_meta && (
              <pre className="text-zinc-400 overflow-auto font-mono whitespace-pre-wrap">{JSON.stringify(session.raw_meta, null, 2)}</pre>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="text-xl font-semibold mt-0.5 text-white">{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-0.5 truncate">{sub}</div>}
    </div>
  )
}
