'use client'
import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import FilterEngine, { ActiveFilter, applyFiltersToData } from '@/components/FilterEngine'
import ReportTile, { TileConfig, defaultTile } from '@/components/reports/ReportTile'

interface RosterPlayer { id: number; name: string; position: string }

const TEAMS = ['AZ','ATL','BAL','BOS','CHC','CWS','CIN','CLE','COL','DET','HOU','KC','LAA','LAD','MIA','MIL','MIN','NYM','NYY','OAK','PHI','PIT','SD','SF','SEA','STL','TB','TEX','TOR','WSH']

type Step = 'choose_scope' | 'choose_type' | 'choose_subject' | 'report'
type Scope = 'team' | 'player'
type SubjectType = 'hitting' | 'pitching'

function defaultTiles(): TileConfig[] {
  return [
    { ...defaultTile('t1'), viz: 'heatmap', title: 'Location' },
    { ...defaultTile('t2'), viz: 'scatter', scatterMode: 'movement', title: 'Movement' },
    { ...defaultTile('t3'), viz: 'bar', barMetric: 'usage', title: 'Arsenal' },
    { ...defaultTile('t4'), viz: 'table', tableMode: 'arsenal', title: 'Stats' },
  ]
}

function ReportsPageInner() {
  // Wizard state
  const [step, setStep] = useState<Step>('choose_scope')
  const [scope, setScope] = useState<Scope | null>(null)
  const [subjectType, setSubjectType] = useState<SubjectType | null>(null)

  // Team mode
  const [selectedTeam, setSelectedTeam] = useState('')
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const [activeRoster, setActiveRoster] = useState<RosterPlayer[]>([])
  const [rosterIndex, setRosterIndex] = useState(0)

  // Player mode
  const [playerSearch, setPlayerSearch] = useState('')
  const [playerResults, setPlayerResults] = useState<any[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: number; name: string } | null>(null)

  // Report state
  const [globalFilters, setGlobalFilters] = useState<ActiveFilter[]>([])
  const [tiles, setTiles] = useState<TileConfig[]>(defaultTiles())
  const [rawData, setRawData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [optionsCache, setOptionsCache] = useState<Record<string, string[]>>({})
  const [columns, setColumns] = useState(4)
  const [exporting, setExporting] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const searchParams = useSearchParams()

  // Save/Load template state
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)

  // Scope selection
  function chooseScope(s: Scope) {
    setScope(s)
    setStep('choose_type')
  }

  function chooseType(t: SubjectType) {
    setSubjectType(t)
    setStep('choose_subject')
  }

  // Search players (min 2 chars to avoid timeout on broad queries)
  async function handlePlayerSearch(q: string) {
    setPlayerSearch(q)
    if (q.trim().length < 2) { setPlayerResults([]); return }
    const ptype = subjectType === 'hitting' ? 'hitter' : 'pitcher'
    try {
      const { data, error } = await supabase.rpc('search_all_players', { search_term: q.trim(), player_type: ptype, result_limit: 8 })
      if (error) { console.warn('Player search error:', error.message); setPlayerResults([]); return }
      setPlayerResults(data || [])
    } catch (e) { console.warn('Player search failed:', e); setPlayerResults([]) }
  }

  function selectPlayer(p: any) {
    setSelectedPlayer({ id: p.player_id, name: p.player_name })
    setPlayerSearch('')
    setPlayerResults([])
    setTiles(defaultTiles())
    setGlobalFilters([])
    loadPlayerData(p.player_id)
    setStep('report')
  }

  // Load team roster
  async function handleTeamSelect(team: string) {
    setSelectedTeam(team)
    if (!team) return
    setLoading(true)
    try {
      const res = await fetch(`/api/roster?team=${team}`)
      const data = await res.json()
      if (data.roster) {
        setRoster(data.roster)
        const pitcherPositions = ['SP', 'RP', 'P']
        const filtered = subjectType === 'pitching'
          ? data.roster.filter((p: RosterPlayer) => pitcherPositions.includes(p.position))
          : data.roster.filter((p: RosterPlayer) => !pitcherPositions.includes(p.position))
        setActiveRoster(filtered)
        setRosterIndex(0)
        setTiles(defaultTiles())
        setGlobalFilters([])
        if (filtered.length > 0) {
          await loadPlayerData(filtered[0].id)
        }
        setStep('report')
      }
    } catch (e) { console.error('Roster fetch failed:', e) }
    setLoading(false)
  }

  // Load pitch data
  async function loadPlayerData(playerId: number) {
    setLoading(true)
    const col = subjectType === "hitting" ? "batter" : "pitcher"
    try {
      const res = await fetch(`/api/player-data?id=${playerId}&col=${col}`)
      const json = await res.json()
      if (json.error) { console.error("Load error:", json.error); setLoading(false); return }
      const allRows = json.rows || []
      enrichData(allRows)
      setRawData(allRows)
      buildOptions(allRows)
    } catch (e) { console.error("Load failed:", e) }
    setLoading(false)
  }

  function enrichData(rows: any[]) {
    rows.forEach((p: any) => {
      if (p.vz0 != null && p.vy0 != null && p.az != null && p.ay != null && p.release_extension != null) {
        const t = (-p.vy0 - Math.sqrt(p.vy0 * p.vy0 - 2 * p.ay * (50 - p.release_extension))) / p.ay
        p.vaa = Math.atan2(p.vz0 + p.az * t, -(p.vy0 + p.ay * t)) * (180 / Math.PI)
      }
      if (p.vx0 != null && p.vy0 != null && p.ax != null && p.ay != null && p.release_extension != null) {
        const t = (-p.vy0 - Math.sqrt(p.vy0 * p.vy0 - 2 * p.ay * (50 - p.release_extension))) / p.ay
        p.haa = Math.atan2(p.vx0 + p.ax * t, -(p.vy0 + p.ay * t)) * (180 / Math.PI)
      }
      if (p.pfx_x != null) p.pfx_x_in = +(p.pfx_x * 12).toFixed(1)
      if (p.pfx_z != null) p.pfx_z_in = +(p.pfx_z * 12).toFixed(1)
      if (p.inning_topbot === 'Top') p.vs_team = p.away_team
      else if (p.inning_topbot === 'Bot') p.vs_team = p.home_team
      // Derived: count
      if (p.balls != null && p.strikes != null) p.count = `${p.balls}-${p.strikes}`
      // Derived: base situation
      const r1 = p.on_1b != null, r2 = p.on_2b != null, r3 = p.on_3b != null
      if (!r1 && !r2 && !r3) p.base_situation = 'Bases Empty'
      else if (r1 && !r2 && !r3) p.base_situation = 'Runner on 1st'
      else if (!r1 && r2 && !r3) p.base_situation = 'Runner on 2nd'
      else if (!r1 && !r2 && r3) p.base_situation = 'Runner on 3rd'
      else if (r1 && r2 && !r3) p.base_situation = 'Runners 1st & 2nd'
      else if (r1 && !r2 && r3) p.base_situation = 'Runners 1st & 3rd'
      else if (!r1 && r2 && r3) p.base_situation = 'Runners 2nd & 3rd'
      else if (r1 && r2 && r3) p.base_situation = 'Bases Loaded'
    })
  }

  function buildOptions(rows: any[]) {
    const bo = (col: string) => [...new Set(rows.map((r: any) => r[col]).filter(Boolean))].map(String).sort()
    setOptionsCache({
      game_year: bo('game_year').sort().reverse(), pitch_name: bo('pitch_name'), pitch_type: bo('pitch_type'),
      stand: bo('stand'), p_throws: bo('p_throws'), balls: ['0', '1', '2', '3'], strikes: ['0', '1', '2'],
      outs_when_up: ['0', '1', '2'], inning: Array.from({ length: 18 }, (_, i) => String(i + 1)),
      type: bo('type'), events: bo('events'), description: bo('description'), bb_type: bo('bb_type'),
      home_team: bo('home_team'), away_team: bo('away_team'), vs_team: bo('vs_team'),
      zone: Array.from({ length: 14 }, (_, i) => String(i + 1)),
    })
  }

  // Navigate roster
  async function goToRosterPlayer(idx: number) {
    if (idx < 0 || idx >= activeRoster.length) return
    setRosterIndex(idx)
    setGlobalFilters([])
    await loadPlayerData(activeRoster[idx].id)
  }

  const filteredData = useMemo(() => {
    if (globalFilters.length === 0) return rawData
    return applyFiltersToData(rawData, globalFilters)
  }, [rawData, globalFilters])

  function updateTile(id: string, config: TileConfig) { setTiles(t => t.map(tile => tile.id === id ? config : tile)) }
  function removeTile(id: string) { setTiles(t => t.filter(tile => tile.id !== id)) }
  function addTile() { if (tiles.length < 16) setTiles(t => [...t, defaultTile('t' + Date.now())]) }

  // PDF Export
  async function exportPDF() {
    if (!gridRef.current || exporting) return
    setExporting(true)
    try {
      const html2canvas = (await import('html2canvas-pro')).default
      const { jsPDF } = await import('jspdf')
      const canvas = await html2canvas(gridRef.current, { backgroundColor: '#09090b', scale: 2 })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      // Header
      pdf.setFontSize(14)
      pdf.setTextColor(255, 255, 255)
      pdf.setFillColor(9, 9, 11)
      pdf.rect(0, 0, pageW, pageH, 'F')
      pdf.text(currentPlayerName || 'Report', 10, 12)
      pdf.setFontSize(8)
      pdf.setTextColor(150, 150, 150)
      pdf.text(`${subjectType || ''} · ${filteredData.length.toLocaleString()} pitches · Triton`, 10, 18)
      // Tile grid image
      const marginTop = 22
      const availH = pageH - marginTop - 5
      const ratio = canvas.width / canvas.height
      let imgW = pageW - 10
      let imgH = imgW / ratio
      if (imgH > availH) { imgH = availH; imgW = imgH * ratio }
      pdf.addImage(imgData, 'PNG', 5, marginTop, imgW, imgH)
      pdf.save(`${(currentPlayerName || 'report').replace(/\s+/g, '_')}_report.pdf`)
    } catch (e) { console.error('PDF export failed:', e) }
    setExporting(false)
  }

  // Load templates list
  async function loadTemplates() {
    const { data } = await supabase.from('report_templates').select('id, name').order('created_at', { ascending: false })
    if (data) setTemplates(data)
  }

  // Save template
  async function saveTemplate() {
    if (!templateName.trim() || saving) return
    setSaving(true)
    await supabase.from('report_templates').upsert({
      name: templateName.trim(),
      scope: scope || 'player',
      subject_type: subjectType || 'pitching',
      tiles_config: tiles,
      global_filters: globalFilters,
      columns,
    }, { onConflict: 'name' })
    setShowSaveModal(false)
    setTemplateName('')
    setSaving(false)
    loadTemplates()
  }

  // Load template
  async function loadTemplate(id: string) {
    const { data } = await supabase.from('report_templates').select('*').eq('id', id).single()
    if (data) {
      setTiles(data.tiles_config || defaultTiles())
      setGlobalFilters(data.global_filters || [])
      setColumns(data.columns || 4)
    }
  }

  // Handle query params for "Generate Report" from player page
  useEffect(() => {
    const playerId = searchParams.get('playerId')
    const playerName = searchParams.get('playerName')
    const type = searchParams.get('type') as SubjectType | null
    if (playerId && playerName) {
      setScope('player')
      setSubjectType(type || 'pitching')
      setSelectedPlayer({ id: Number(playerId), name: playerName })
      setTiles(defaultTiles())
      setGlobalFilters([])
      loadPlayerData(Number(playerId))
      setStep('report')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load templates on mount
  useEffect(() => { loadTemplates() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function goBack() {
    if (step === 'report') setStep('choose_subject')
    else if (step === 'choose_subject') setStep('choose_type')
    else if (step === 'choose_type') setStep('choose_scope')
  }

  const currentPlayerName = scope === 'team' && activeRoster.length > 0
    ? activeRoster[rosterIndex]?.name
    : selectedPlayer?.name || ''

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <nav className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center px-6 gap-6">
        <a href="/" className="font-bold text-emerald-400 text-sm hover:text-emerald-300 transition">Triton</a>
        <div className="flex gap-4 text-xs text-zinc-500">
          <a href="/" className="hover:text-zinc-300 transition">Home</a>
          <a href="/pitchers" className="hover:text-zinc-300 transition">Pitchers</a>
          <a href="/reports" className="text-emerald-400">Reports</a>
          <a href="/explore" className="hover:text-zinc-300 transition">Explore</a>
          <a href="/analyst" className="hover:text-zinc-300 transition">Analyst</a>
        </div>
      </nav>

      {/* ── Wizard Steps ─────────────────────────────────────────────── */}
      {step !== 'report' && (
        <div className="max-w-lg mx-auto py-20 px-6">
          {step !== 'choose_scope' && (
            <button onClick={goBack} className="text-[12px] text-zinc-500 hover:text-zinc-300 mb-6 transition flex items-center gap-1">
              &larr; Back
            </button>
          )}

          {step === 'choose_scope' && (
            <div className="space-y-6 text-center">
              <h1 className="text-2xl font-bold text-white">Reports Builder</h1>
              <p className="text-zinc-500 text-sm">Build custom scouting reports with configurable tiles</p>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <button onClick={() => chooseScope('team')}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 hover:border-emerald-600 transition group">
                  <div className="text-3xl mb-3">&#127951;</div>
                  <div className="text-lg font-bold text-white group-hover:text-emerald-400 transition">Team</div>
                  <div className="text-[12px] text-zinc-500 mt-1">Scout an entire roster</div>
                </button>
                <button onClick={() => chooseScope('player')}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 hover:border-emerald-600 transition group">
                  <div className="text-3xl mb-3">&#9917;</div>
                  <div className="text-lg font-bold text-white group-hover:text-emerald-400 transition">Player</div>
                  <div className="text-[12px] text-zinc-500 mt-1">Scout a single player</div>
                </button>
              </div>
            </div>
          )}

          {step === 'choose_type' && (
            <div className="space-y-6 text-center">
              <h1 className="text-2xl font-bold text-white">{scope === 'team' ? 'Team' : 'Player'} Report</h1>
              <p className="text-zinc-500 text-sm">What are you scouting?</p>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <button onClick={() => chooseType('pitching')}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 hover:border-emerald-600 transition group">
                  <div className="text-lg font-bold text-white group-hover:text-emerald-400 transition">Pitching</div>
                  <div className="text-[12px] text-zinc-500 mt-1">{scope === 'team' ? 'All pitchers on roster' : 'Search for a pitcher'}</div>
                </button>
                <button onClick={() => chooseType('hitting')}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 hover:border-emerald-600 transition group">
                  <div className="text-lg font-bold text-white group-hover:text-emerald-400 transition">Hitting</div>
                  <div className="text-[12px] text-zinc-500 mt-1">{scope === 'team' ? 'All position players' : 'Search for a hitter'}</div>
                </button>
              </div>
            </div>
          )}

          {step === 'choose_subject' && scope === 'team' && (
            <div className="space-y-6 text-center">
              <h1 className="text-2xl font-bold text-white">Select Team</h1>
              <div className="grid grid-cols-5 gap-2 pt-4">
                {TEAMS.map(t => (
                  <button key={t} onClick={() => handleTeamSelect(t)}
                    className={`px-3 py-2.5 rounded-lg text-sm font-bold transition border ${
                      selectedTeam === t ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-emerald-600 hover:text-white'
                    }`}>{t}</button>
                ))}
              </div>
              {loading && <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" /></div>}
            </div>
          )}

          {step === 'choose_subject' && scope === 'player' && (
            <div className="space-y-6 text-center">
              <h1 className="text-2xl font-bold text-white">Search {subjectType === 'pitching' ? 'Pitcher' : 'Hitter'}</h1>
              <div className="relative max-w-sm mx-auto">
                <input type="text" value={playerSearch} onChange={e => handlePlayerSearch(e.target.value)}
                  placeholder={`Search ${subjectType === 'pitching' ? 'pitcher' : 'hitter'} name...`}
                  className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none" />
                {playerResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto">
                    {playerResults.map((p: any) => (
                      <button key={p.player_id} onClick={() => selectPlayer(p)}
                        className="w-full text-left px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition border-b border-zinc-700/50 last:border-0">
                        <span className="font-medium">{p.player_name}</span>
                        <span className="text-zinc-500 ml-2">{p.player_position} &middot; {p.pitch_count?.toLocaleString()} pitches</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Report View ──────────────────────────────────────────────── */}
      {step === 'report' && (
        <>
          {/* Report Header Bar */}
          <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-2">
            <div className="max-w-[95vw] mx-auto flex items-center gap-4 flex-wrap">
              <button onClick={goBack} className="text-[12px] text-zinc-500 hover:text-zinc-300 transition">&larr; Back</button>

              {/* Current player info */}
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">{currentPlayerName}</h2>
                <span className="text-[11px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                  {subjectType === 'pitching' ? 'Pitching' : 'Hitting'}
                </span>
              </div>

              {/* Roster navigation for team mode */}
              {scope === 'team' && activeRoster.length > 1 && (
                <div className="flex items-center gap-2">
                  <button onClick={() => goToRosterPlayer(rosterIndex - 1)} disabled={rosterIndex === 0}
                    className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-zinc-400 hover:text-white disabled:opacity-30 transition">&larr; Prev</button>
                  <select value={rosterIndex} onChange={e => goToRosterPlayer(Number(e.target.value))}
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none">
                    {activeRoster.map((p, i) => (
                      <option key={p.id} value={i}>{p.name} ({p.position})</option>
                    ))}
                  </select>
                  <span className="text-[11px] text-zinc-600">{rosterIndex + 1}/{activeRoster.length}</span>
                  <button onClick={() => goToRosterPlayer(rosterIndex + 1)} disabled={rosterIndex >= activeRoster.length - 1}
                    className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-zinc-400 hover:text-white disabled:opacity-30 transition">Next &rarr;</button>
                </div>
              )}

              {/* Grid columns */}
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[11px] text-zinc-500">Grid:</span>
                {[1, 2, 3, 4].map(c => (
                  <button key={c} onClick={() => setColumns(c)}
                    className={`w-6 h-6 rounded text-[11px] font-medium transition ${columns === c ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>{c}</button>
                ))}
              </div>

              {/* Save/Load/Export */}
              <div className="flex items-center gap-1.5">
                <button onClick={() => setShowSaveModal(true)}
                  className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-zinc-400 hover:text-white transition">Save</button>
                {templates.length > 0 && (
                  <select defaultValue="" onChange={e => { if (e.target.value) loadTemplate(e.target.value); e.target.value = '' }}
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-400 focus:outline-none">
                    <option value="" disabled>Load...</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                <button onClick={exportPDF} disabled={exporting}
                  className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 rounded text-[11px] text-white font-medium transition disabled:opacity-50">
                  {exporting ? 'Exporting...' : 'Export PDF'}
                </button>
              </div>

              {loading && <div className="w-4 h-4 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />}
              <span className="text-[11px] text-zinc-600">{filteredData.length.toLocaleString()} pitches</span>
            </div>
          </div>

          {/* Global Filters */}
          <FilterEngine activeFilters={globalFilters} onFiltersChange={setGlobalFilters} optionsCache={optionsCache} />

          {/* Save Template Modal */}
          {showSaveModal && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowSaveModal(false)}>
              <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-80" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-white mb-3">Save Report Template</h3>
                <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)}
                  placeholder="Template name..." autoFocus
                  onKeyDown={e => e.key === 'Enter' && saveTemplate()}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 focus:border-emerald-600 focus:outline-none mb-4" />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowSaveModal(false)}
                    className="px-3 py-1.5 bg-zinc-800 text-zinc-400 rounded text-xs hover:text-white transition">Cancel</button>
                  <button onClick={saveTemplate} disabled={!templateName.trim() || saving}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-500 transition disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tile Grid */}
          <div className="max-w-[95vw] mx-auto px-6 py-4">
            <div ref={gridRef} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
              {tiles.map(tile => (
                <div key={tile.id} style={{ minHeight: columns === 1 ? 350 : columns === 2 ? 300 : 250 }}>
                  <ReportTile
                    config={tile}
                    data={filteredData}
                    optionsCache={optionsCache}
                    onUpdate={c => updateTile(tile.id, c)}
                    onRemove={() => removeTile(tile.id)}
                  />
                </div>
              ))}
            </div>
            {tiles.length < 16 && (
              <button onClick={addTile}
                className="mt-3 w-full py-3 border-2 border-dashed border-zinc-800 rounded-lg text-zinc-600 hover:border-emerald-600 hover:text-emerald-400 transition text-sm font-medium">
                + Add Tile ({tiles.length}/16)
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <ReportsPageInner />
    </Suspense>
  )
}
