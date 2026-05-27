import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

async function loadCounts() {
  const [sessionsQ, pitchesQ, lastVisionQ] = await Promise.all([
    supabaseAdmin.from('trackman_sessions').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('trackman_pitches').select('id', { count: 'exact', head: true }),
    supabaseAdmin
      .from('trackman_sessions')
      .select('received_at')
      .eq('source', 'vision_live')
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return {
    sessionCount: sessionsQ.count ?? 0,
    pitchCount: pitchesQ.count ?? 0,
    lastVisionAt: (lastVisionQ.data as { received_at: string } | null)?.received_at ?? null,
  }
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
  return `${Math.floor(hr / 24)}d ago`
}

type Card = {
  href: string
  title: string
  desc: string
  color: 'indigo' | 'emerald' | 'sky' | 'amber' | 'zinc'
  badge?: string
  badgeTone?: 'live' | 'coming' | 'stub'
  meta?: { label: string; value: string }[]
  available: boolean
  icon: React.ReactNode
}

const COLOR: Record<Card['color'], { hoverBg: string; iconBg: string; iconText: string; hoverBorder: string }> = {
  indigo:  { hoverBg: 'hover:bg-indigo-500/5',  iconBg: 'bg-indigo-500/15',  iconText: 'text-indigo-300',  hoverBorder: 'hover:border-indigo-500/40' },
  emerald: { hoverBg: 'hover:bg-emerald-500/5', iconBg: 'bg-emerald-500/15', iconText: 'text-emerald-300', hoverBorder: 'hover:border-emerald-500/40' },
  sky:     { hoverBg: 'hover:bg-sky-500/5',     iconBg: 'bg-sky-500/15',     iconText: 'text-sky-300',     hoverBorder: 'hover:border-sky-500/40' },
  amber:   { hoverBg: 'hover:bg-amber-500/5',   iconBg: 'bg-amber-500/15',   iconText: 'text-amber-300',   hoverBorder: 'hover:border-amber-500/40' },
  zinc:    { hoverBg: '',                       iconBg: 'bg-zinc-800',       iconText: 'text-zinc-500',    hoverBorder: '' },
}

const BADGE_TONE: Record<NonNullable<Card['badgeTone']>, string> = {
  live:   'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  coming: 'bg-zinc-700/40 text-zinc-500 border-zinc-600',
  stub:   'bg-amber-500/15 text-amber-300 border-amber-500/30',
}

export default async function DataHubPage() {
  const counts = await loadCounts()

  const cards: Card[] = [
    {
      href: '/data/console',
      title: 'Console',
      desc: 'Ingest health, raw retention, recent sessions, error log.',
      color: 'indigo',
      badge: 'core',
      badgeTone: 'live',
      available: true,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" /><polyline points="7 9 10 12 7 15" /><line x1="13" y1="15" x2="17" y2="15" />
        </svg>
      ),
    },
    {
      href: '/data/trackman',
      title: 'TrackMan',
      desc: 'Browse Vision sessions, drill into per-pitch data, filter by date / pitcher / type.',
      color: 'emerald',
      badge: 'live',
      badgeTone: 'live',
      available: true,
      meta: [
        { label: 'Sessions', value: counts.sessionCount.toLocaleString() },
        { label: 'Pitches',  value: counts.pitchCount.toLocaleString() },
        { label: 'Last',     value: fmtRelative(counts.lastVisionAt) },
      ],
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
        </svg>
      ),
    },
    {
      href: '#',
      title: 'TrackMan Webhook',
      desc: 'Push delivery from TrackMan. Endpoint stubbed; awaiting payload contract.',
      color: 'amber',
      badge: 'stub',
      badgeTone: 'stub',
      available: false,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 16.98h-5.99c-1.66 0-3.01-1.34-3.01-3s1.34-3 3.01-3H18M6 8.99H4.5C2.57 8.99 1 10.56 1 12.49s1.57 3.5 3.5 3.5H6" />
        </svg>
      ),
    },
    {
      href: '#',
      title: 'TrackMan FTP',
      desc: 'Nightly reconciliation sweep. Credentials + payload pending.',
      color: 'sky',
      badge: 'stub',
      badgeTone: 'stub',
      available: false,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5" /><path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6" />
        </svg>
      ),
    },
    {
      href: '#',
      title: 'Future integration',
      desc: 'Rapsodo, HitTrax, etc. land here as new sources come online.',
      color: 'zinc',
      badge: 'soon',
      badgeTone: 'coming',
      available: false,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      ),
    },
  ]

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-12">
      <header className="flex items-end justify-between mb-10">
        <div>
          <h1 className="font-[family-name:var(--font-bebas)] text-5xl uppercase text-indigo-400 tracking-widest">Data</h1>
          <p className="text-sm text-zinc-500 mt-1">All integration-sourced data, raw retention, and ad-hoc query.</p>
        </div>
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">← Launcher</Link>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map(card => {
          const c = COLOR[card.color]
          const disabled = !card.available
          const inner = (
            <div className={`bg-zinc-900 border border-zinc-800 rounded-xl p-5 h-full transition-all ${
              disabled ? 'opacity-50 cursor-not-allowed' : `${c.hoverBg} ${c.hoverBorder} cursor-pointer`
            }`}>
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-full ${c.iconBg} ${c.iconText} flex items-center justify-center shrink-0`}>
                  {card.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-[family-name:var(--font-bebas)] text-xl uppercase text-white tracking-wider">{card.title}</h2>
                    {card.badge && card.badgeTone && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${BADGE_TONE[card.badgeTone]}`}>
                        {card.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">{card.desc}</p>
                  {card.meta && card.meta.length > 0 && (
                    <div className="flex gap-4 mt-3">
                      {card.meta.map(m => (
                        <div key={m.label}>
                          <div className="text-[10px] uppercase tracking-wider text-zinc-600">{m.label}</div>
                          <div className="text-sm text-zinc-300 tabular-nums">{m.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
          return disabled ? (
            <div key={card.title}>{inner}</div>
          ) : (
            <Link key={card.title} href={card.href} className="block">
              {inner}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
