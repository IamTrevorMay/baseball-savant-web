'use client'
import { useState, useEffect, useMemo, useRef, useCallback, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import FilterEngine, { applyFiltersToData, FILTER_CATALOG, type ActiveFilter } from '@/components/FilterEngine'
import ReportTile, { type TileConfig, defaultTile } from '@/components/reports/ReportTile'
import PushToCompeteModal from '@/components/reports/PushToCompeteModal'
import PdfOrientationToggle, { type PdfOrientation } from '@/components/reports/PdfOrientationToggle'
import { enrichData } from '@/lib/enrichData'
import { buildOptionsCache } from '@/lib/reports/reportOptions'

// Default mode of the Reports Builder: a scouting report for one player, or the
// same report run for every checked player on a team's active roster.
// Data scoping, outermost first: player + time period (fetched) → global filters → tile filters.

type Level = 'MLB' | 'MiLB'
type SubjectType = 'hitting' | 'pitching'
interface Subject { id: number; name: string; position?: string }
interface TeamOption { value: string; label: string; short: string }

interface LevelConfig {
  dataRoute: string
  templateTable: string
  firstSeason: number
  teamNoun: string
  search: (q: string, type: SubjectType) => PromiseLike<{ data: any; error: { message: string } | null }>
  rosterUrl: (team: string) => string
}

const MLB_TEAMS = ['AZ','ATL','BAL','BOS','CHC','CWS','CIN','CLE','COL','DET','HOU','KC','LAA','LAD','MIA','MIL','MIN','NYM','NYY','OAK','PHI','PIT','SD','SF','SEA','STL','TB','TEX','TOR','WSH']

const LEVELS: Record<Level, LevelConfig> = {
  MLB: {
    dataRoute: '/api/player-data',
    templateTable: 'report_templates',
    firstSeason: 2015,
    teamNoun: 'team',
    search: (q, type) => supabase.rpc('search_all_players', { search_term: q, player_type: type === 'hitting' ? 'hitter' : 'pitcher', result_limit: 8 }),
    rosterUrl: team => `/api/roster?team=${team}`,
  },
  MiLB: {
    // milb_pitches is Triple-A only (2023+), so team runs offer AAA clubs only
    dataRoute: '/api/milb/player-data',
    templateTable: 'milb_report_templates',
    firstSeason: 2023,
    teamNoun: 'AAA team',
    search: (q, type) => supabase.rpc(type === 'hitting' ? 'search_milb_batters' : 'search_milb_players', { search_term: q, result_limit: 8 }),
    rosterUrl: team => `/api/milb/roster?teamId=${team}`,
  },
}

const PITCHER_POSITIONS = ['P', 'SP', 'RP']
// Two-way players (TWP) belong on both the hitter and pitcher rosters.
function fitsRole(position: string | undefined, type: SubjectType): boolean {
  if (position === 'TWP') return true
  const isPitcher = PITCHER_POSITIONS.includes(position || '')
  return type === 'pitching' ? isPitcher : !isPitcher
}

const THIS_YEAR = new Date().getFullYear()
// No games before March, so an off-season visit defaults to last season.
const DEFAULT_SEASON = new Date().getMonth() < 2 ? THIS_YEAR - 1 : THIS_YEAR
const MAX_CACHED_PLAYERS = 40
const RENDER_SETTLE_MS = 600

function defaultTiles(): TileConfig[] {
  return [
    { ...defaultTile('t1'), viz: 'heatmap', title: 'Location' },
    { ...defaultTile('t2'), viz: 'scatter', scatterMode: 'movement', title: 'Movement' },
    { ...defaultTile('t3'), viz: 'bar', barMetric: 'usage', title: 'Arsenal' },
    { ...defaultTile('t4'), viz: 'table', tableMode: 'arsenal', title: 'Stats' },
  ]
}

function seasonsLabel(seasons: number[]): string {
  if (!seasons.length) return 'All seasons'
  const s = [...seasons].sort((a, b) => a - b)
  const contiguous = s.every((y, i) => i === 0 || y === s[i - 1] + 1)
  return s.length > 1 && contiguous ? `${s[0]}–${s[s.length - 1]}` : s.join(', ')
}

function periodLabel(seasons: number[], startDate: string, endDate: string): string {
  const dates = startDate && endDate ? `${startDate} to ${endDate}`
    : startDate ? `from ${startDate}`
    : endDate ? `through ${endDate}`
    : ''
  return [seasonsLabel(seasons), dates].filter(Boolean).join(' · ')
}

/** The time period as filters, for consumers that re-apply filters to a full history (Compete). */
function periodAsFilters(seasons: number[], startDate: string, endDate: string): ActiveFilter[] {
  const out: ActiveFilter[] = []
  const yearDef = FILTER_CATALOG.find(f => f.key === 'game_year')
  if (seasons.length && yearDef) out.push({ def: yearDef, values: seasons.map(String) })
  const dateDef = FILTER_CATALOG.find(f => f.key === 'game_date')
  if ((startDate || endDate) && dateDef) out.push({ def: dateDef, startDate, endDate })
  return out
}

function waitFor(cond: () => boolean, timeoutMs = 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      if (cond()) resolve()
      else if (Date.now() - start > timeoutMs) reject(new Error('Timed out waiting for report data'))
      else setTimeout(tick, 50)
    }
    tick()
  })
}

const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()))

function addCanvasPage(pdf: any, canvas: HTMLCanvasElement) {
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  pdf.setFillColor(9, 9, 11)
  pdf.rect(0, 0, pageW, pageH, 'F')
  const margin = 5
  const ratio = canvas.width / canvas.height
  let w = pageW - margin * 2
  let h = w / ratio
  if (h > pageH - margin * 2) { h = pageH - margin * 2; w = h * ratio }
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pageW - w) / 2, margin, w, h)
}

interface Props {
  level: Level
  /** The page's Versus/Default toggle, rendered at the start of the header. */
  modeToggle: ReactNode
  /** False while the page shows Versus. The builder stays mounted so its report survives the switch. */
  active: boolean
}

export default function ScoutingReportBuilder({ level, modeToggle, active }: Props) {
  const cfg = LEVELS[level]

  // Subject — one player, or the checked players from a team's active roster
  const [subjectType, setSubjectType] = useState<SubjectType>('hitting')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [index, setIndex] = useState(0)
  const [teamRun, setTeamRun] = useState<string | null>(null)
  const current = subjects[index] || null

  // Player search
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchReqRef = useRef(0)

  // Time period — scopes the fetch
  const [seasons, setSeasons] = useState<number[]>([DEFAULT_SEASON])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const seasonOptions = useMemo(
    () => Array.from({ length: THIS_YEAR - cfg.firstSeason + 1 }, (_, i) => THIS_YEAR - i),
    [cfg.firstSeason]
  )

  // Team picker
  const [showTeamPicker, setShowTeamPicker] = useState(false)
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>(
    level === 'MLB' ? MLB_TEAMS.map(t => ({ value: t, label: t, short: t })) : []
  )
  const [pickerTeam, setPickerTeam] = useState('')
  const [pickerRoster, setPickerRoster] = useState<Subject[]>([])
  const [pickerChecked, setPickerChecked] = useState<Set<number>>(new Set())
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerError, setPickerError] = useState('')
  const rosterReqRef = useRef(0)

  // Report
  const [globalFilters, setGlobalFilters] = useState<ActiveFilter[]>([])
  const [tiles, setTiles] = useState<TileConfig[]>(defaultTiles())
  const [columns, setColumns] = useState(typeof window !== 'undefined' && window.innerWidth < 768 ? 1 : 4)
  const [reportLabel, setReportLabel] = useState('')
  const reportRef = useRef<HTMLDivElement>(null)

  // Templates
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([])
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [saving, setSaving] = useState(false)

  // Export / push
  const [exporting, setExporting] = useState<string | null>(null)
  const [showPush, setShowPush] = useState(false)
  const [pdfOrientation, setPdfOrientation] = useState<PdfOrientation>('portrait')

  // Data — cached per (player, role, period) so paging a roster back and forth is instant
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const cacheRef = useRef(new Map<string, Promise<any[]>>())
  const loadReqRef = useRef(0)
  const rowsKeyRef = useRef('')

  const col = subjectType === 'hitting' ? 'batter' : 'pitcher'
  const periodQuery = useMemo(() => {
    const p = new URLSearchParams()
    if (seasons.length) p.set('years', [...seasons].sort().join(','))
    if (startDate) p.set('startDate', startDate)
    if (endDate) p.set('endDate', endDate)
    return p.toString()
  }, [seasons, startDate, endDate])

  const keyFor = useCallback((s: Subject) => `${s.id}|${col}|${periodQuery}`, [col, periodQuery])

  const fetchRows = useCallback((s: Subject): Promise<any[]> => {
    const key = keyFor(s)
    const cached = cacheRef.current.get(key)
    if (cached) return cached
    const promise = (async () => {
      const res = await fetch(`${cfg.dataRoute}?id=${s.id}&col=${col}${periodQuery ? `&${periodQuery}` : ''}`)
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`)
      const out = json.rows || []
      enrichData(out)
      return out
    })()
    promise.catch(() => cacheRef.current.delete(key))
    cacheRef.current.set(key, promise)
    if (cacheRef.current.size > MAX_CACHED_PLAYERS) {
      const oldest = cacheRef.current.keys().next().value
      if (oldest !== undefined) cacheRef.current.delete(oldest)
    }
    return promise
  }, [cfg.dataRoute, col, periodQuery, keyFor])

  // Load the current player's rows; prefetch the next one in a team run
  useEffect(() => {
    if (!current) {
      setRows([]); setLoadError(''); setLoading(false); rowsKeyRef.current = ''
      return
    }
    const my = ++loadReqRef.current // discard out-of-order responses
    const key = keyFor(current)
    setLoading(true)
    setLoadError('')
    fetchRows(current)
      .then(r => {
        if (my !== loadReqRef.current) return
        setRows(r)
        rowsKeyRef.current = key
        const next = subjects[index + 1]
        if (next) fetchRows(next).catch(() => {})
      })
      .catch(e => {
        if (my !== loadReqRef.current) return
        setRows([])
        setLoadError(e.message || 'Load failed')
        rowsKeyRef.current = key
      })
      .finally(() => { if (my === loadReqRef.current) setLoading(false) })
  }, [current, index, subjects, fetchRows, keyFor])

  const optionsCache = useMemo(() => buildOptionsCache(rows), [rows])
  const filteredData = useMemo(
    () => globalFilters.length ? applyFiltersToData(rows, globalFilters) : rows,
    [rows, globalFilters]
  )

  // Plotly only resizes on window resize, so nudge it when this view is shown again
  useEffect(() => {
    if (!active) return
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    return () => cancelAnimationFrame(id)
  }, [active])

  // Close the search dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // --- Subject ---
  function changeSubjectType(t: SubjectType) {
    if (t === subjectType) return
    setSubjectType(t)
    clearSubjects()
    setSearch(''); setResults([]); setShowResults(false)
    setPickerTeam(''); setPickerRoster([]); setPickerChecked(new Set())
  }

  function clearSubjects() {
    setSubjects([]); setIndex(0); setTeamRun(null)
  }

  async function handleSearch(q: string) {
    setSearch(q)
    const my = ++searchReqRef.current
    if (q.trim().length < 2) { setResults([]); setShowResults(false); return }
    try {
      const { data, error } = await cfg.search(q.trim(), subjectType)
      if (my !== searchReqRef.current) return
      if (error) { console.warn('Player search error:', error.message); setResults([]); return }
      setResults(data || [])
      setShowResults(true)
    } catch (e) { console.warn('Player search failed:', e); setResults([]) }
  }

  function selectPlayer(p: any) {
    setSubjects([{ id: p.player_id, name: p.player_name, position: p.player_position }])
    setIndex(0)
    setTeamRun(null)
    setSearch(''); setResults([]); setShowResults(false)
  }

  function toggleSeason(y: number) {
    setSeasons(s => s.includes(y) ? s.filter(v => v !== y) : [...s, y])
  }

  // --- Team run ---
  async function openTeamPicker() {
    setShowTeamPicker(true)
    setPickerError('')
    if (level !== 'MiLB' || teamOptions.length) return
    try {
      const res = await fetch('/api/milb/teams')
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)
      setTeamOptions((data.teams || []).map((t: any) => ({
        value: String(t.id),
        label: t.parentOrg ? `${t.name} (${t.parentOrg})` : t.name,
        short: t.name,
      })))
    } catch (e: any) { setPickerError(e.message || 'Could not load teams') }
  }

  async function pickTeam(team: string) {
    setPickerTeam(team)
    setPickerRoster([])
    setPickerChecked(new Set())
    setPickerError('')
    if (!team) return
    const my = ++rosterReqRef.current
    setPickerLoading(true)
    try {
      const res = await fetch(cfg.rosterUrl(team))
      const data = await res.json()
      if (my !== rosterReqRef.current) return
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)
      const matched: Subject[] = (data.roster || [])
        .filter((p: any) => fitsRole(p.position, subjectType))
        .map((p: any) => ({ id: p.id, name: p.name, position: p.position }))
      setPickerRoster(matched)
      setPickerChecked(new Set(matched.map(p => p.id)))
    } catch (e: any) {
      if (my === rosterReqRef.current) setPickerError(e.message || 'Could not load roster')
    }
    if (my === rosterReqRef.current) setPickerLoading(false)
  }

  function togglePicked(id: number) {
    setPickerChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function runTeam() {
    const chosen = pickerRoster.filter(p => pickerChecked.has(p.id))
    if (!chosen.length) return
    setSubjects(chosen)
    setIndex(0)
    setTeamRun(teamOptions.find(t => t.value === pickerTeam)?.short || pickerTeam)
    setShowTeamPicker(false)
  }

  // --- Tiles ---
  function updateTile(id: string, config: TileConfig) { setTiles(t => t.map(tile => tile.id === id ? config : tile)) }
  function removeTile(id: string) { setTiles(t => t.filter(tile => tile.id !== id)) }
  function addTile() { if (tiles.length < 16) setTiles(t => [...t, defaultTile('t' + Date.now())]) }

  // --- Templates (tiles, global filters, grid — the time period is chosen per run) ---
  const loadTemplates = useCallback(async () => {
    const { data } = await supabase.from(cfg.templateTable).select('id, name').order('created_at', { ascending: false })
    if (data) setTemplates(data)
  }, [cfg.templateTable])

  useEffect(() => { loadTemplates() }, [loadTemplates])

  async function saveTemplate() {
    if (!templateName.trim() || saving) return
    setSaving(true)
    const { error } = await supabase.from(cfg.templateTable).upsert({
      name: templateName.trim(),
      scope: teamRun ? 'team' : 'player',
      subject_type: subjectType,
      tiles_config: tiles,
      global_filters: globalFilters,
      columns,
    }, { onConflict: 'name' })
    if (error) console.error('Template save failed:', error.message)
    setShowSaveModal(false)
    setTemplateName('')
    setSaving(false)
    loadTemplates()
  }

  async function deleteTemplate(id: string) {
    await supabase.from(cfg.templateTable).delete().eq('id', id)
    loadTemplates()
  }

  async function loadTemplate(id: string) {
    const { data } = await supabase.from(cfg.templateTable).select('*').eq('id', id).single()
    if (data) {
      setTiles(data.tiles_config || defaultTiles())
      setGlobalFilters(data.global_filters || [])
      setColumns(data.columns || 4)
    }
  }

  // --- PDF: one page per player; a team run steps through the roster and captures each ---
  async function exportPDF() {
    if (!reportRef.current || exporting || !current) return
    const startIndex = index
    setExporting(subjects.length > 1 ? `1/${subjects.length}` : '...')
    try {
      const html2canvas = (await import('html2canvas-pro')).default
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: pdfOrientation, unit: 'mm', format: 'letter' })
      for (let i = 0; i < subjects.length; i++) {
        if (subjects.length > 1) {
          setExporting(`${i + 1}/${subjects.length}`)
          setIndex(i)
          const key = keyFor(subjects[i])
          await waitFor(() => rowsKeyRef.current === key)
          await nextFrame()
          await nextFrame()
          await new Promise(r => setTimeout(r, RENDER_SETTLE_MS)) // let Plotly finish drawing
        }
        const canvas = await html2canvas(reportRef.current!, { backgroundColor: '#09090b', scale: 2 })
        if (i > 0) pdf.addPage()
        addCanvasPage(pdf, canvas)
      }
      const base = teamRun ? `${teamRun}_${subjectType === 'hitting' ? 'hitters' : 'pitchers'}` : current.name
      pdf.save(`${base.replace(/[^a-zA-Z0-9]+/g, '_')}_report.pdf`)
    } catch (e) { console.error('PDF export failed:', e) }
    setIndex(startIndex)
    setExporting(null)
  }

  const roleNoun = subjectType === 'hitting' ? 'hitter' : 'pitcher'
  const meta = [
    `${subjectType === 'hitting' ? 'Hitting' : 'Pitching'} Report`,
    current?.position,
    teamRun && subjects.length > 1 ? `${teamRun} · ${index + 1} of ${subjects.length}` : teamRun,
    periodLabel(seasons, startDate, endDate),
    current ? `${filteredData.length.toLocaleString()} pitches` : null,
  ].filter(Boolean).join(' · ')

  const chip = (on: boolean) =>
    `px-2 py-1 md:px-1.5 md:py-0.5 rounded text-[11px] md:text-[10px] font-medium transition ${on ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'}`

  return (
    <>
      {/* ── Header Bar ────────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-3 md:px-6 py-2">
        <div className="max-w-[95vw] mx-auto flex flex-col gap-2 md:gap-0">

          {/* Row 1: Mode, subject type, player search / team run */}
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            {modeToggle}

            <div className="flex rounded-lg overflow-hidden border border-zinc-700">
              {(['hitting', 'pitching'] as SubjectType[]).map(t => (
                <button key={t} onClick={() => changeSubjectType(t)} disabled={!!exporting}
                  className={`px-3 py-1.5 md:py-1 text-xs md:text-[11px] font-medium transition ${subjectType === t ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                  {t === 'hitting' ? 'Hitters' : 'Pitchers'}
                </button>
              ))}
            </div>

            <div ref={searchRef} className="relative flex-1 min-w-[160px] max-w-xs">
              <input type="text"
                value={search}
                onChange={e => handleSearch(e.target.value)}
                onFocus={() => { if (results.length > 0) setShowResults(true) }}
                disabled={!!exporting}
                placeholder={current && !teamRun ? current.name : `Search ${roleNoun}...`}
                className={`w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs md:text-[11px] text-white focus:border-emerald-600 focus:outline-none ${current && !teamRun ? 'placeholder-zinc-200' : 'placeholder-zinc-500'}`} />
              {showResults && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                  {results.map((p: any) => (
                    <button key={p.player_id} onClick={() => selectPlayer(p)}
                      className="w-full text-left px-3 py-2.5 md:py-2 text-xs md:text-[11px] text-zinc-300 hover:bg-zinc-700 hover:text-white transition border-b border-zinc-700/50 last:border-0">
                      <span className="font-medium">{p.player_name}</span>
                      <span className="text-zinc-500 ml-2">{p.player_position} &middot; {p.pitch_count?.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={openTeamPicker} disabled={!!exporting}
              className="px-2.5 py-1.5 md:px-2 md:py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs md:text-[11px] text-zinc-300 hover:text-white hover:border-emerald-600 transition disabled:opacity-50">
              Run for {cfg.teamNoun}&hellip;
            </button>

            {teamRun && (
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-1.5 px-2 py-1 md:py-0.5 bg-emerald-900/30 border border-emerald-700/50 rounded text-xs md:text-[11px] text-emerald-300 font-medium">
                  {teamRun}
                  <button onClick={clearSubjects} disabled={!!exporting} title="End team run"
                    className="text-emerald-500 hover:text-emerald-200 transition">&times;</button>
                </span>
                {subjects.length > 1 && <>
                  <button onClick={() => setIndex(i => i - 1)} disabled={index === 0 || !!exporting}
                    className="px-2 py-1.5 md:px-1.5 md:py-1 bg-zinc-800 border border-zinc-700 rounded text-xs md:text-[11px] text-zinc-400 hover:text-white disabled:opacity-30 transition">&larr;</button>
                  <select value={index} onChange={e => setIndex(Number(e.target.value))} disabled={!!exporting}
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 md:py-1 text-xs md:text-[11px] text-white focus:outline-none max-w-[160px]">
                    {subjects.map((p, i) => (
                      <option key={p.id} value={i}>{p.name}{p.position ? ` (${p.position})` : ''}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-zinc-600">{index + 1}/{subjects.length}</span>
                  <button onClick={() => setIndex(i => i + 1)} disabled={index >= subjects.length - 1 || !!exporting}
                    className="px-2 py-1.5 md:px-1.5 md:py-1 bg-zinc-800 border border-zinc-700 rounded text-xs md:text-[11px] text-zinc-400 hover:text-white disabled:opacity-30 transition">&rarr;</button>
                </>}
              </div>
            )}

            {loading && <div className="w-4 h-4 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />}
            {current && <span className="text-[11px] text-zinc-600 ml-auto md:ml-0">{filteredData.length.toLocaleString()} pitches</span>}
          </div>

          {/* Row 2: Time period, templates, grid, actions */}
          <div className="flex items-center gap-2 md:gap-3 flex-wrap md:mt-1.5">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[11px] text-zinc-500 mr-0.5">Seasons:</span>
              <button onClick={() => setSeasons([])} disabled={!!exporting} className={chip(seasons.length === 0)}>All</button>
              {seasonOptions.map(y => (
                <button key={y} onClick={() => toggleSeason(y)} disabled={!!exporting} className={chip(seasons.includes(y))}>{y}</button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <span className="text-[11px] text-zinc-500">Dates:</span>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={!!exporting}
                className="px-1.5 py-1 md:py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[11px] md:text-[10px] text-white focus:border-emerald-600 focus:outline-none [color-scheme:dark]" />
              <span className="text-[10px] text-zinc-600">to</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} disabled={!!exporting}
                className="px-1.5 py-1 md:py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[11px] md:text-[10px] text-white focus:border-emerald-600 focus:outline-none [color-scheme:dark]" />
              {(startDate || endDate) && (
                <button onClick={() => { setStartDate(''); setEndDate('') }} disabled={!!exporting} title="Clear dates"
                  className="text-zinc-500 hover:text-zinc-300 transition text-sm md:text-xs">&times;</button>
              )}
            </div>

            <div className="w-px h-5 bg-zinc-800 hidden md:block" />

            <select defaultValue="" onChange={e => {
              const val = e.target.value
              if (val === '__default') { setTiles(defaultTiles()); setGlobalFilters([]) }
              else if (val) { loadTemplate(val) }
              e.target.value = ''
            }}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs md:text-[11px] text-zinc-400 focus:outline-none">
              <option value="" disabled>Templates</option>
              <option value="__default">Default</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>

            {/* Grid columns */}
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[11px] text-zinc-500 hidden md:inline">Grid:</span>
              {[1, 2, 3, 4].map(c => (
                <button key={c} onClick={() => setColumns(c)}
                  className={`w-7 h-7 md:w-6 md:h-6 rounded text-xs md:text-[11px] font-medium transition ${columns === c ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>{c}</button>
              ))}
            </div>

            {/* Save/Delete/Export */}
            <div className="flex items-center gap-1.5">
              <button onClick={() => setShowSaveModal(true)}
                className="px-2.5 py-1.5 md:px-2 md:py-1 bg-zinc-800 border border-zinc-700 rounded text-xs md:text-[11px] text-zinc-400 hover:text-white transition">Save</button>
              {templates.length > 0 && (
                <select defaultValue="" onChange={e => { if (e.target.value) { deleteTemplate(e.target.value); e.target.value = '' } }}
                  className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-red-400/60 hover:text-red-400 focus:outline-none w-8" title="Delete template">
                  <option value="" disabled>&times;</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              <PdfOrientationToggle value={pdfOrientation} onChange={setPdfOrientation} disabled={!!exporting} />
              <button onClick={exportPDF} disabled={!!exporting || !current}
                title={subjects.length > 1 ? `One page per player (${subjects.length})` : undefined}
                className="px-2.5 py-1.5 md:px-2 md:py-1 bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 rounded text-xs md:text-[11px] text-white font-medium transition disabled:opacity-50">
                {exporting ? `PDF ${exporting}` : subjects.length > 1 ? `PDF (${subjects.length})` : 'PDF'}
              </button>
              {level === 'MLB' && (
                <button onClick={() => setShowPush(true)} disabled={!current || !!exporting}
                  className="px-2.5 py-1.5 md:px-2 md:py-1 bg-amber-700 hover:bg-amber-600 border border-amber-600 rounded text-xs md:text-[11px] text-white font-medium transition hidden sm:inline-flex disabled:opacity-50">
                  Push
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Global Filters — applied to every tile, before each tile's own filters */}
      <FilterEngine activeFilters={globalFilters} onFiltersChange={setGlobalFilters} optionsCache={optionsCache} />

      {/* ── Report ────────────────────────────────────────────────────── */}
      <div className="max-w-[95vw] mx-auto px-3 md:px-6 py-3 md:py-4">
        {!current && (
          <p className="mb-3 text-center text-[11px] text-zinc-600">
            Search for a {roleNoun} or run the report for a {cfg.teamNoun} to load data. Tiles can be built now.
          </p>
        )}
        {loadError && <p className="mb-3 text-center text-[11px] text-red-400">Couldn&apos;t load {current?.name}: {loadError}</p>}

        <div ref={reportRef}>
          <div className="mb-3 text-center">
            <div className="text-base md:text-lg font-bold text-white">{current?.name || `${subjectType === 'hitting' ? 'Hitter' : 'Pitcher'} Report`}</div>
            {(reportLabel || !exporting) && (
              <input type="text" value={reportLabel} onChange={e => setReportLabel(e.target.value)}
                placeholder="Add a report title (optional)"
                className="bg-transparent text-xs text-zinc-300 text-center w-full mx-auto block focus:outline-none placeholder-zinc-700" />
            )}
            <div className="text-[11px] text-zinc-500 mt-0.5">{meta}</div>
          </div>
          <div className="grid gap-2 md:gap-3" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
            {tiles.map(tile => (
              <div key={tile.id} style={{ minHeight: columns === 1 ? 320 : columns === 2 ? 280 : 250 }}>
                <ReportTile
                  config={tile}
                  data={filteredData}
                  optionsCache={optionsCache}
                  onUpdate={c => updateTile(tile.id, c)}
                  onRemove={() => removeTile(tile.id)}
                  subjectType={subjectType}
                  level={level}
                />
              </div>
            ))}
          </div>
        </div>
        {tiles.length < 16 && (
          <button onClick={addTile}
            className="mt-3 w-full py-4 md:py-3 border-2 border-dashed border-zinc-800 rounded-lg text-zinc-600 hover:border-emerald-600 hover:text-emerald-400 transition text-sm font-medium">
            + Add Tile ({tiles.length}/16)
          </button>
        )}
      </div>

      {/* Team Picker Modal */}
      {showTeamPicker && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowTeamPicker(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 md:p-6 w-[90vw] max-w-md mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">Run report for a {cfg.teamNoun}</h3>
            <p className="text-[11px] text-zinc-500 mb-3">
              Active-roster {roleNoun}s. Each gets this report with the current tiles, filters, and time period.
            </p>
            <select value={pickerTeam} onChange={e => pickTeam(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:border-emerald-600 focus:outline-none">
              <option value="">Select {cfg.teamNoun}...</option>
              {teamOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>

            {pickerError && <p className="text-[11px] text-red-400 mt-3">{pickerError}</p>}
            {pickerLoading && <div className="w-4 h-4 mt-3 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />}
            {!pickerLoading && pickerTeam && !pickerError && pickerRoster.length === 0 && (
              <p className="text-[11px] text-zinc-500 mt-3">No active {roleNoun}s on this roster.</p>
            )}

            {pickerRoster.length > 0 && <>
              <div className="flex items-center justify-between mt-3 mb-1.5">
                <span className="text-[11px] text-zinc-500">{pickerChecked.size}/{pickerRoster.length} selected</span>
                <div className="flex gap-2">
                  <button onClick={() => setPickerChecked(new Set(pickerRoster.map(p => p.id)))} className="text-[11px] text-zinc-400 hover:text-white transition">All</button>
                  <button onClick={() => setPickerChecked(new Set())} className="text-[11px] text-zinc-400 hover:text-white transition">None</button>
                </div>
              </div>
              <div className="overflow-y-auto flex-1 min-h-0 border border-zinc-800 rounded">
                {pickerRoster.map(p => (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 cursor-pointer border-b border-zinc-800/60 last:border-0">
                    <input type="checkbox" checked={pickerChecked.has(p.id)} onChange={() => togglePicked(p.id)} className="accent-emerald-500 w-3.5 h-3.5" />
                    <span className="text-xs text-zinc-200 flex-1">{p.name}</span>
                    <span className="text-[10px] text-zinc-500">{p.position}</span>
                  </label>
                ))}
              </div>
            </>}

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowTeamPicker(false)}
                className="px-3 py-1.5 bg-zinc-800 text-zinc-400 rounded text-xs hover:text-white transition">Cancel</button>
              <button onClick={runTeam} disabled={pickerChecked.size === 0}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-500 transition disabled:opacity-50">
                Run report ({pickerChecked.size})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Template Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowSaveModal(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 md:p-6 w-[90vw] max-w-80 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">Save Report Template</h3>
            <p className="text-[11px] text-zinc-500 mb-3">Saves tiles, filters, and grid. The time period is chosen each run.</p>
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

      {showPush && current && (
        <PushToCompeteModal
          playerName={current.name}
          playerId={current.id}
          subjectType={subjectType}
          tiles={tiles}
          filters={[...periodAsFilters(seasons, startDate, endDate), ...globalFilters]}
          columns={columns}
          onClose={() => setShowPush(false)}
        />
      )}
    </>
  )
}
