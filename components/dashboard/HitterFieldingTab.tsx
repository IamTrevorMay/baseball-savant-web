'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { LahmanFieldingSeason } from '@/lib/lahman-stats'
import { modernTeamCode } from '@/lib/lahman-stats'

interface Props {
  batterId: number
  lahmanFielding?: LahmanFieldingSeason[]
}

type SubTab = 'overview' | 'oaa_detail' | 'catch_arm' | 'framing'

interface DefensiveData {
  oaa: any[]
  outfield_oaa: any[]
  catch_probability: any[]
  arm_strength: any[]
  run_value: any[]
  catcher_framing: any[]
}

function fmt(v: any, dec = 0): string {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  if (isNaN(n)) return String(v)
  return dec === 0 ? Math.round(n).toLocaleString() : n.toFixed(dec)
}

function colorOAA(v: any): string {
  if (v === null || v === undefined) return 'text-zinc-500'
  const n = Number(v)
  if (isNaN(n)) return 'text-zinc-500'
  if (n >= 10) return 'text-emerald-300'
  if (n > 0) return 'text-emerald-400'
  if (n === 0) return 'text-zinc-400'
  if (n > -10) return 'text-red-400'
  return 'text-red-300'
}

function colorRuns(v: any): string {
  if (v === null || v === undefined) return 'text-zinc-500'
  const n = Number(v)
  if (isNaN(n)) return 'text-zinc-500'
  if (n >= 5) return 'text-emerald-300'
  if (n > 0) return 'text-emerald-400'
  if (n === 0) return 'text-zinc-400'
  if (n > -5) return 'text-red-400'
  return 'text-red-300'
}

export default function HitterFieldingTab({ batterId, lahmanFielding }: Props) {
  const [data, setData] = useState<DefensiveData | null>(null)
  const [loading, setLoading] = useState(true)
  const [subTab, setSubTab] = useState<SubTab>('overview')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const tables = [
        'defensive_oaa',
        'defensive_oaa_outfield',
        'defensive_catch_probability',
        'defensive_arm_strength',
        'defensive_run_value',
        'defensive_catcher_framing',
      ] as const

      const results = await Promise.all(
        tables.map(t =>
          supabase.from(t).select('*').eq('player_id', batterId).order('season', { ascending: false })
        )
      )

      setData({
        oaa: results[0].data || [],
        outfield_oaa: results[1].data || [],
        catch_probability: results[2].data || [],
        arm_strength: results[3].data || [],
        run_value: results[4].data || [],
        catcher_framing: results[5].data || [],
      })
      setLoading(false)
    }
    load()
  }, [batterId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    )
  }

  const hasOAA = data && data.oaa.length > 0
  const hasOutfieldOAA = data && data.outfield_oaa.length > 0
  const hasCatchProb = data && data.catch_probability.length > 0
  const hasArm = data && data.arm_strength.length > 0
  const hasRunValue = data && data.run_value.length > 0
  const hasFraming = data && data.catcher_framing.length > 0
  const hasStatcast = hasOAA || hasOutfieldOAA || hasCatchProb || hasArm || hasRunValue || hasFraming

  // Lahman seasons pre-2016
  const lahmanPre = lahmanFielding?.filter(f => f.year < 2016).sort((a, b) => b.year - a.year) || []

  const SUB_TABS: { key: SubTab; label: string; show: boolean }[] = [
    { key: 'overview', label: 'Overview', show: true },
    { key: 'oaa_detail', label: 'OAA Detail', show: !!(hasOAA || hasOutfieldOAA) },
    { key: 'catch_arm', label: 'Catch / Arm', show: !!(hasCatchProb || hasArm) },
    { key: 'framing', label: 'Framing', show: !!hasFraming },
  ]

  const th = "text-left text-[11px] font-medium px-3 py-2 border-b border-zinc-800 text-zinc-500 whitespace-nowrap bg-zinc-900 sticky top-0"
  const td = "px-3 py-1.5 text-[11px] whitespace-nowrap font-mono"

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-1 mb-4">
        {SUB_TABS.filter(t => t.show).map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              subTab === t.key ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {!hasStatcast && lahmanPre.length === 0 && (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-lg mb-2">No defensive data available</p>
          <p className="text-sm">Statcast defensive metrics are available from 2016 onward.</p>
        </div>
      )}

      {/* Overview */}
      {subTab === 'overview' && (
        <div className="space-y-6">
          {hasRunValue && (
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-2">Fielding Run Value</h3>
              <div className="overflow-auto rounded-lg border border-zinc-800">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={th}>Year</th><th className={th}>Team</th>
                      <th className={th}>Total</th><th className={th}>Range</th>
                      <th className={th}>Arm</th><th className={th}>DP</th>
                      <th className={th}>Catching</th><th className={th}>Framing</th>
                      <th className={th}>Throwing</th><th className={th}>Blocking</th>
                      <th className={th}>Outs</th><th className={th}>PA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.run_value.map((r, i) => (
                      <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className={`${td} text-zinc-300`}>{r.season}</td>
                        <td className={`${td} text-zinc-400`}>{r.team || '—'}</td>
                        <td className={`${td} ${colorRuns(r.total_runs)}`}>{fmt(r.total_runs)}</td>
                        <td className={`${td} ${colorRuns(r.range_runs)}`}>{fmt(r.range_runs)}</td>
                        <td className={`${td} ${colorRuns(r.arm_runs)}`}>{fmt(r.arm_runs)}</td>
                        <td className={`${td} ${colorRuns(r.dp_runs)}`}>{fmt(r.dp_runs)}</td>
                        <td className={`${td} ${colorRuns(r.catching_runs)}`}>{fmt(r.catching_runs)}</td>
                        <td className={`${td} ${colorRuns(r.framing_runs)}`}>{fmt(r.framing_runs)}</td>
                        <td className={`${td} ${colorRuns(r.throwing_runs)}`}>{fmt(r.throwing_runs)}</td>
                        <td className={`${td} ${colorRuns(r.blocking_runs)}`}>{fmt(r.blocking_runs)}</td>
                        <td className={`${td} text-zinc-400`}>{fmt(r.outs_total)}</td>
                        <td className={`${td} text-zinc-400`}>{fmt(r.tot_pa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {hasOAA && (
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-2">Outs Above Average</h3>
              <div className="overflow-auto rounded-lg border border-zinc-800">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={th}>Year</th><th className={th}>Team</th><th className={th}>Pos</th>
                      <th className={th}>OAA</th><th className={th}>FRP</th>
                      <th className={th}>Actual%</th><th className={th}>Expected%</th><th className={th}>Diff%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.oaa.map((r, i) => (
                      <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className={`${td} text-zinc-300`}>{r.season}</td>
                        <td className={`${td} text-zinc-400`}>{r.team || '—'}</td>
                        <td className={`${td} text-zinc-400`}>{r.position || '—'}</td>
                        <td className={`${td} ${colorOAA(r.outs_above_average)}`}>{fmt(r.outs_above_average)}</td>
                        <td className={`${td} ${colorRuns(r.fielding_runs_prevented)}`}>{fmt(r.fielding_runs_prevented)}</td>
                        <td className={`${td} text-sky-400`}>{fmt(r.actual_success_rate, 1)}</td>
                        <td className={`${td} text-sky-400`}>{fmt(r.estimated_success_rate, 1)}</td>
                        <td className={`${td} ${colorOAA(r.diff_success_rate)}`}>{fmt(r.diff_success_rate, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Lahman historical fielding */}
          {lahmanPre.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-2">Historical Fielding (pre-Statcast)</h3>
              <div className="overflow-auto rounded-lg border border-zinc-800">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={th}>Year</th><th className={th}>Team</th><th className={th}>Pos</th>
                      <th className={th}>G</th><th className={th}>PO</th><th className={th}>A</th>
                      <th className={th}>E</th><th className={th}>DP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lahmanPre.map((r, i) => (
                      <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className={`${td} text-zinc-300`}>{r.year}</td>
                        <td className={`${td} text-zinc-400`}>{modernTeamCode(r.team_id)}</td>
                        <td className={`${td} text-zinc-400`}>{r.pos || '—'}</td>
                        <td className={`${td} text-zinc-400`}>{r.g}</td>
                        <td className={`${td} text-zinc-300`}>{r.po}</td>
                        <td className={`${td} text-zinc-300`}>{r.a}</td>
                        <td className={`${td} ${r.e > 10 ? 'text-red-400' : 'text-zinc-300'}`}>{r.e}</td>
                        <td className={`${td} text-zinc-300`}>{r.dp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* OAA Detail */}
      {subTab === 'oaa_detail' && (
        <div className="space-y-6">
          {hasOAA && (
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-2">Directional OAA Splits</h3>
              <div className="overflow-auto rounded-lg border border-zinc-800">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={th}>Year</th><th className={th}>OAA</th>
                      <th className={th}>In Front</th><th className={th}>3B Side</th>
                      <th className={th}>1B Side</th><th className={th}>Behind</th>
                      <th className={th}>vs RHH</th><th className={th}>vs LHH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.oaa.map((r, i) => (
                      <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className={`${td} text-zinc-300`}>{r.season}</td>
                        <td className={`${td} ${colorOAA(r.outs_above_average)}`}>{fmt(r.outs_above_average)}</td>
                        <td className={`${td} ${colorOAA(r.oaa_infront)}`}>{fmt(r.oaa_infront)}</td>
                        <td className={`${td} ${colorOAA(r.oaa_lateral_3b)}`}>{fmt(r.oaa_lateral_3b)}</td>
                        <td className={`${td} ${colorOAA(r.oaa_lateral_1b)}`}>{fmt(r.oaa_lateral_1b)}</td>
                        <td className={`${td} ${colorOAA(r.oaa_behind)}`}>{fmt(r.oaa_behind)}</td>
                        <td className={`${td} ${colorOAA(r.oaa_rhh)}`}>{fmt(r.oaa_rhh)}</td>
                        <td className={`${td} ${colorOAA(r.oaa_lhh)}`}>{fmt(r.oaa_lhh)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {hasOutfieldOAA && (
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-2">Outfield Directional OAA</h3>
              <div className="overflow-auto rounded-lg border border-zinc-800">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={th}>Year</th><th className={th}>Attempts</th><th className={th}>OAA</th>
                      <th className={th}>Back-L</th><th className={th}>Back</th><th className={th}>Back-R</th>
                      <th className={th}>Back All</th>
                      <th className={th}>In-L</th><th className={th}>In</th><th className={th}>In-R</th>
                      <th className={th}>In All</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.outfield_oaa.map((r, i) => (
                      <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className={`${td} text-zinc-300`}>{r.season}</td>
                        <td className={`${td} text-zinc-400`}>{fmt(r.attempts)}</td>
                        <td className={`${td} ${colorOAA(r.oaa)}`}>{fmt(r.oaa)}</td>
                        <td className={`${td} ${colorOAA(r.oaa_back_left)}`}>{fmt(r.oaa_back_left)}</td>
                        <td className={`${td} ${colorOAA(r.oaa_back)}`}>{fmt(r.oaa_back)}</td>
                        <td className={`${td} ${colorOAA(r.oaa_back_right)}`}>{fmt(r.oaa_back_right)}</td>
                        <td className={`${td} ${colorOAA(r.oaa_back_all)}`}>{fmt(r.oaa_back_all)}</td>
                        <td className={`${td} ${colorOAA(r.oaa_in_left)}`}>{fmt(r.oaa_in_left)}</td>
                        <td className={`${td} ${colorOAA(r.oaa_in)}`}>{fmt(r.oaa_in)}</td>
                        <td className={`${td} ${colorOAA(r.oaa_in_right)}`}>{fmt(r.oaa_in_right)}</td>
                        <td className={`${td} ${colorOAA(r.oaa_in_all)}`}>{fmt(r.oaa_in_all)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Catch / Arm */}
      {subTab === 'catch_arm' && (
        <div className="space-y-6">
          {hasCatchProb && (
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-2">Catch Probability</h3>
              <div className="overflow-auto rounded-lg border border-zinc-800">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={th}>Year</th><th className={th}>OAA</th>
                      <th className={th}>5-Star</th><th className={th}>5★ Opps</th><th className={th}>5★%</th>
                      <th className={th}>4-Star</th><th className={th}>4★ Opps</th><th className={th}>4★%</th>
                      <th className={th}>3-Star</th><th className={th}>3★ Opps</th><th className={th}>3★%</th>
                      <th className={th}>2-Star</th><th className={th}>2★ Opps</th><th className={th}>2★%</th>
                      <th className={th}>1-Star</th><th className={th}>1★ Opps</th><th className={th}>1★%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.catch_probability.map((r, i) => (
                      <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className={`${td} text-zinc-300`}>{r.season}</td>
                        <td className={`${td} ${colorOAA(r.oaa)}`}>{fmt(r.oaa)}</td>
                        <td className={`${td} text-emerald-400`}>{fmt(r.five_star_plays)}</td>
                        <td className={`${td} text-zinc-400`}>{fmt(r.five_star_opps)}</td>
                        <td className={`${td} text-emerald-400`}>{fmt(r.five_star_pct, 1)}</td>
                        <td className={`${td} text-teal-400`}>{fmt(r.four_star_plays)}</td>
                        <td className={`${td} text-zinc-400`}>{fmt(r.four_star_opps)}</td>
                        <td className={`${td} text-teal-400`}>{fmt(r.four_star_pct, 1)}</td>
                        <td className={`${td} text-sky-400`}>{fmt(r.three_star_plays)}</td>
                        <td className={`${td} text-zinc-400`}>{fmt(r.three_star_opps)}</td>
                        <td className={`${td} text-sky-400`}>{fmt(r.three_star_pct, 1)}</td>
                        <td className={`${td} text-amber-400`}>{fmt(r.two_star_plays)}</td>
                        <td className={`${td} text-zinc-400`}>{fmt(r.two_star_opps)}</td>
                        <td className={`${td} text-amber-400`}>{fmt(r.two_star_pct, 1)}</td>
                        <td className={`${td} text-orange-400`}>{fmt(r.one_star_plays)}</td>
                        <td className={`${td} text-zinc-400`}>{fmt(r.one_star_opps)}</td>
                        <td className={`${td} text-orange-400`}>{fmt(r.one_star_pct, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {hasArm && (
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-2">Arm Strength</h3>
              <div className="overflow-auto rounded-lg border border-zinc-800">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={th}>Year</th><th className={th}>Team</th><th className={th}>Pos</th>
                      <th className={th}>Throws</th><th className={th}>Max Arm</th><th className={th}>Overall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.arm_strength.map((r, i) => (
                      <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className={`${td} text-zinc-300`}>{r.season}</td>
                        <td className={`${td} text-zinc-400`}>{r.team || '—'}</td>
                        <td className={`${td} text-zinc-400`}>{r.position || '—'}</td>
                        <td className={`${td} text-zinc-400`}>{fmt(r.total_throws)}</td>
                        <td className={`${td} text-amber-400`}>{fmt(r.max_arm_strength, 1)}</td>
                        <td className={`${td} text-amber-400`}>{fmt(r.arm_overall, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Framing */}
      {subTab === 'framing' && hasFraming && (
        <div>
          <h3 className="text-sm font-medium text-zinc-300 mb-2">Catcher Framing</h3>
          <div className="overflow-auto rounded-lg border border-zinc-800">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Year</th><th className={th}>Team</th>
                  <th className={th}>Pitches</th><th className={th}>Shadow</th>
                  <th className={th}>Framing Runs</th><th className={th}>Strike Rate+</th>
                </tr>
              </thead>
              <tbody>
                {data!.catcher_framing.map((r, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className={`${td} text-zinc-300`}>{r.season}</td>
                    <td className={`${td} text-zinc-400`}>{r.team || '—'}</td>
                    <td className={`${td} text-zinc-400`}>{fmt(r.pitches)}</td>
                    <td className={`${td} text-zinc-400`}>{fmt(r.pitches_shadow)}</td>
                    <td className={`${td} ${colorRuns(r.rv_total)}`}>{fmt(r.rv_total, 1)}</td>
                    <td className={`${td} ${colorOAA(r.pct_total)}`}>{fmt(r.pct_total, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
