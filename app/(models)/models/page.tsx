import Link from 'next/link'

const MODULES = [
  {
    name: 'Matchup Intelligence',
    code: 'PAIE',
    description: 'Pitcher vs batter recommendations — damage zones, chase targeting, fatigue detection, count-aware pitch selection.',
    href: '/models/matchup',
    active: true,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="5" />
        <circle cx="16" cy="16" r="5" />
        <line x1="11.5" y1="4.5" x2="19.5" y2="12.5" />
      </svg>
    ),
  },
  {
    name: 'Hitter Approach',
    code: 'HAIE',
    description: 'Optimal hitting strategy — sit-on zones, take-until rules, chase avoidance, two-strike mode.',
    href: '/models/hitter',
    active: false,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22V2M2 12h20M7 7l10 10M17 7L7 17" />
      </svg>
    ),
  },
  {
    name: 'Pitcher Usage Risk',
    code: 'PURI',
    description: 'Workload dashboard — acute:chronic ratio, velocity trends, rest days, high-leverage usage.',
    href: '/models/risk',
    active: false,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    name: 'Game Calling',
    code: 'CGCIE',
    description: 'Sequence-aware pitch selection — repetition detection, hitter expectation disruption.',
    href: '/models/gamecall',
    active: false,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
]

export default function ModelsPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Triton Models</h1>
        <p className="text-zinc-500 text-sm">Event modeling and probability engines for pitching, hitting, and game strategy.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {MODULES.map(mod => (
          <div key={mod.code} className="relative">
            {mod.active ? (
              <Link
                href={mod.href}
                className="block bg-zinc-900 border border-zinc-800 hover:border-purple-500/40 rounded-lg p-5 transition group"
              >
                <ModuleContent mod={mod} />
              </Link>
            ) : (
              <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-5 opacity-50">
                <ModuleContent mod={mod} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ModuleContent({ mod }: { mod: typeof MODULES[number] }) {
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
          {mod.icon}
        </div>
        {mod.active ? (
          <span className="text-[9px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-medium uppercase tracking-wider">Active</span>
        ) : (
          <span className="text-[9px] bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full font-medium uppercase tracking-wider">Coming Soon</span>
        )}
      </div>
      <h3 className="text-sm font-bold text-white mb-0.5">{mod.name}</h3>
      <span className="text-[10px] text-purple-400/70 font-mono">{mod.code}</span>
      <p className="text-xs text-zinc-500 mt-2 leading-relaxed">{mod.description}</p>
    </>
  )
}
