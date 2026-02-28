'use client'
import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ResearchNav from '@/components/ResearchNav'
import FilterEngine, { ActiveFilter, applyFiltersToData, FILTER_CATALOG } from '@/components/FilterEngine'
import ReportTile, { TileConfig, defaultTile } from '@/components/reports/ReportTile'
import { computeStuffProfile, generateSimilarStuffFilters, applyOverlayRules, type StuffProfile, type OverlayRule } from '@/lib/overlayEngine'
import { enrichData } from '@/lib/enrichData'
import OverlayTemplateBuilder from '@/components/reports/OverlayTemplateBuilder'

interface RosterPlayer { id: number; name: string; position: string }

const TEAMS = ['AZ','ATL','BAL','BOS','CHC','CWS','CIN','CLE','COL','DET','HOU','KC','LAA','LAD','MIA','MIL','MIN','NYM','NYY','OAK','PHI','PIT','SD','SF','SEA','STL','TB','TEX','TOR','WSH']

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
  // Core state — no wizard, always in builder mode
  const [scope, setScope] = useState<Scope>('player')
  const [subjectType, setSubjectType] = useState<SubjectType>('hitting')

  // Team mode
  const [selectedTeam, setSelectedTeam] = useState('')
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const [activeRoster, setActiveRoster] = useState<RosterPlayer[]>([])
  const [rosterIndex, setRosterIndex] = useState(0)

  // Player mode — inline subject search
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: number; name: string } | null>(null)
  const [subjectSearch, setSubjectSearch] = useState('')
  const [subjectResults, setSubjectResults] = useState<any[]>([])
  const [showSubjectDropdown, setShowSubjectDropdown] = useState(false)

  // Modifier target (opposite of subject type)
  const [modifierTarget, setModifierTarget] = useState<{ id: number; name: string } | null>(null)
  const [modifierTargetSearch, setModifierTargetSearch] = useState('')
  const [modifierTargetResults, setModifierTargetResults] = useState<any[]>([])
  const [modifierTargetData, setModifierTargetData] = useState<any[]>([])

  // Report state
  const [globalFilters, setGlobalFilters] = useState<ActiveFilter[]>([])
  const [tiles, setTiles] = useState<TileConfig[]>(defaultTiles())
  const [rawData, setRawData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [optionsCache, setOptionsCache] = useState<Record<string, string[]>>({})
  const [columns, setColumns] = useState(typeof window !== 'undefined' && window.innerWidth < 768 ? 1 : 4)
  const [exporting, setExporting] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const searchParams = useSearchParams()
  const subjectSearchRef = useRef<HTMLDivElement>(null)
  const modifierSearchRef = useRef<HTMLDivElement>(null)

  // Report title/subtitle
  const [reportTitle, setReportTitle] = useState('')
  const [reportSubtitle, setReportSubtitle] = useState('')

  // Save/Load template state
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)

  // Modifier (overlay) state
  const [reportMode, setReportMode] = useState<'default' | 'vs_similar_stuff' | string>('default')
  const [pitcherStuffProfile, setPitcherStuffProfile] = useState<StuffProfile | null>(null)
  const [overlayFiltersPerTile, setOverlayFiltersPerTile] = useState<Record<string, ActiveFilter[]> | null>(null)
  const [overlayTemplates, setOverlayTemplates] = useState<{ id: string; name: string }[]>([])
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(null)
  const [showOverlayBuilder, setShowOverlayBuilder] = useState(false)

  // Push to Compete state
  const [showPushModal, setShowPushModal] = useState(false)
  const [competeAthletes, setCompeteAthletes] = useState<any[]>([])
  const [pushTarget, setPushTarget] = useState('')
  const [pushTitle, setPushTitle] = useState('')
  const [pushDesc, setPushDesc] = useState('')
  const [pushing, setPushing] = useState(false)
  const [pushError, setPushError] = useState('')

  // --- Toggle handlers ---
  function handleSubjectTypeChange(newType: SubjectType) {
    if (newType === subjectType) return
    setSubjectType(newType)
    setSelectedPlayer(null)
    setSelectedTeam('')
    setRoster([])
    setActiveRoster([])
    setRosterIndex(0)
    setRawData([])
    setGlobalFilters([])
    setSubjectSearch('')
    setSubjectResults([])
    setModifierTarget(null)
    setModifierTargetSearch('')
    setModifierTargetResults([])
    setModifierTargetData([])
    setPitcherStuffProfile(null)
    setOverlayFiltersPerTile(null)
    setReportMode('default')
    setActiveOverlayId(null)
  }

  function handleScopeChange(newScope: Scope) {
    if (newScope === scope) return
    setScope(newScope)
    setSelectedPlayer(null)
    setSelectedTeam('')
    setRoster([])
    setActiveRoster([])
    setRosterIndex(0)
    setRawData([])
    setGlobalFilters([])
    setSubjectSearch('')
    setSubjectResults([])
    setModifierTarget(null)
    setModifierTargetSearch('')
    setModifierTargetResults([])
    setModifierTargetData([])
    setPitcherStuffProfile(null)
    setOverlayFiltersPerTile(null)
    setReportMode('default')
    setActiveOverlayId(null)
  }

  // --- Subject search (inline in header) ---
  async function handleSubjectSearch(q: string) {
    setSubjectSearch(q)
    if (q.trim().length < 2) { setSubjectResults([]); setShowSubjectDropdown(false); return }
    const ptype = subjectType === 'hitting' ? 'hitter' : 'pitcher'
    try {
      const { data, error } = await supabase.rpc('search_all_players', { search_term: q.trim(), player_type: ptype, result_limit: 8 })
      if (error) { console.warn('Player search error:', error.message); setSubjectResults([]); return }
      setSubjectResults(data || [])
      setShowSubjectDropdown(true)
    } catch (e) { console.warn('Player search failed:', e); setSubjectResults([]) }
  }

  function selectPlayer(p: any) {
    setSelectedPlayer({ id: p.player_id, name: p.player_name })
    setSubjectSearch('')
    setSubjectResults([])
    setShowSubjectDropdown(false)
    setTiles(defaultTiles())
    setGlobalFilters([])
    loadPlayerData(p.player_id)
  }

  // --- Modifier target search (opposite of subject type) ---
  async function handleModifierTargetSearch(q: string) {
    setModifierTargetSearch(q)
    if (q.trim().length < 2) { setModifierTargetResults([]); return }
    // Opposite: hitter subject → search pitchers, pitcher subject → search hitters
    const ptype = subjectType === 'hitting' ? 'pitcher' : 'hitter'
    try {
      const { data, error } = await supabase.rpc('search_all_players', { search_term: q.trim(), player_type: ptype, result_limit: 8 })
      if (error) { console.warn('Modifier target search error:', error.message); setModifierTargetResults([]); return }
      setModifierTargetResults(data || [])
    } catch (e) { console.warn('Modifier target search failed:', e); setModifierTargetResults([]) }
  }

  async function selectModifierTarget(p: any) {
    const target = { id: p.player_id, name: p.player_name }
    setModifierTarget(target)
    setModifierTargetSearch('')
    setModifierTargetResults([])
    // Load target's data
    const col = subjectType === 'hitting' ? 'pitcher' : 'batter'
    try {
      const res = await fetch(`/api/player-data?id=${target.id}&col=${col}`)
      const json = await res.json()
      const rows = json.rows || []
      enrichData(rows)
      setModifierTargetData(rows)
      // Compute stuff profile from target's data
      const profile = computeStuffProfile(rows)
      setPitcherStuffProfile(profile)
    } catch (e) { console.error('Failed to load modifier target data:', e) }
  }

  function clearModifierTarget() {
    setModifierTarget(null)
    setModifierTargetSearch('')
    setModifierTargetResults([])
    setModifierTargetData([])
    // Recompute stuff profile from subject's own data
    if (rawData.length > 0) {
      setPitcherStuffProfile(computeStuffProfile(rawData))
    } else {
      setPitcherStuffProfile(null)
    }
  }

  // --- Team mode ---
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

  // Compute modifier filters when stuff profile or tiles change
  useEffect(() => {
    if (reportMode === 'vs_similar_stuff' && pitcherStuffProfile) {
      const result = generateSimilarStuffFilters(pitcherStuffProfile, tiles)
      const map: Record<string, ActiveFilter[]> = {}
      result.forEach(r => { map[r.tileId] = r.overlayFilters })
      setOverlayFiltersPerTile(map)
    } else if (activeOverlayId && activeOverlayId !== 'vs_similar_stuff') {
      supabase.from('overlay_templates').select('*').eq('id', activeOverlayId).single().then(({ data: tmpl }) => {
        if (tmpl && pitcherStuffProfile) {
          const sourceData = modifierTargetData.length > 0 ? modifierTargetData : rawData
          const result = applyOverlayRules(tmpl.rules as OverlayRule[], sourceData, tiles)
          const map: Record<string, ActiveFilter[]> = {}
          result.forEach(r => { map[r.tileId] = r.overlayFilters })
          setOverlayFiltersPerTile(map)
        }
      })
    } else {
      setOverlayFiltersPerTile(null)
    }
  }, [reportMode, pitcherStuffProfile, tiles, activeOverlayId, modifierTargetData]) // eslint-disable-line react-hooks/exhaustive-deps

  // Inject modifier filters into tiles for rendering
  const effectiveTiles = useMemo(() => {
    if (!overlayFiltersPerTile) return tiles
    return tiles.map(tile => ({
      ...tile,
      filters: [...tile.filters, ...(overlayFiltersPerTile[tile.id] || [])]
    }))
  }, [tiles, overlayFiltersPerTile])

  // Count unique pitches displayed across all tiles (accounts for overlay/modifier filters)
  const displayedPitchCount = useMemo(() => {
    if (!overlayFiltersPerTile) return filteredData.length
    const seen = new Set<any>()
    effectiveTiles.forEach(tile => {
      const tileFiltered = tile.filters.length > 0 ? applyFiltersToData(filteredData, tile.filters) : filteredData
      tileFiltered.forEach((row: any) => seen.add(row))
    })
    return seen.size
  }, [filteredData, effectiveTiles, overlayFiltersPerTile])

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
      pdf.setFontSize(14)
      pdf.setTextColor(255, 255, 255)
      pdf.setFillColor(9, 9, 11)
      pdf.rect(0, 0, pageW, pageH, 'F')
      pdf.text(reportTitle || currentPlayerName || 'Report', 10, 12)
      pdf.setFontSize(8)
      pdf.setTextColor(150, 150, 150)
      pdf.text(reportSubtitle || `${subjectType || ''} · ${displayedPitchCount.toLocaleString()} pitches · Triton`, 10, 18)
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
      scope,
      subject_type: subjectType,
      tiles_config: tiles,
      global_filters: globalFilters,
      columns,
    }, { onConflict: 'name' })
    setShowSaveModal(false)
    setTemplateName('')
    setSaving(false)
    loadTemplates()
  }

  // Delete template
  async function deleteTemplate(id: string) {
    await supabase.from('report_templates').delete().eq('id', id)
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

  // Push to Compete
  async function openPushModal() {
    setShowPushModal(true)
    setPushTitle(currentPlayerName ? `${currentPlayerName} Report` : 'Scouting Report')
    setPushDesc('')
    setPushTarget('')
    setPushError('')
    try {
      const res = await fetch('/api/compete/athletes')
      const data = await res.json()
      setCompeteAthletes(data.athletes || [])
    } catch { setCompeteAthletes([]) }
  }

  async function pushToCompete() {
    if (!pushTarget || !pushTitle.trim()) return
    setPushing(true)
    setPushError('')
    try {
      const res = await fetch('/api/compete/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athlete_id: pushTarget,
          title: pushTitle.trim(),
          description: pushDesc.trim() || null,
          player_name: currentPlayerName || null,
          subject_type: subjectType,
          metadata: {
            tiles,
            filters: globalFilters,
            player_id: selectedPlayer?.id || null,
            columns,
          },
        }),
      })
      const data = await res.json()
      if (data.error) { setPushError(data.error); setPushing(false); return }
      setShowPushModal(false)
    } catch { setPushError('Failed to push report') }
    setPushing(false)
  }

  // Handle query params for "Generate Report" from player page
  useEffect(() => {
    const playerId = searchParams.get('playerId')
    const playerName = searchParams.get('playerName')
    const type = searchParams.get('type') as SubjectType | null
    if (!playerId || !playerName) return

    const templateIdParam = searchParams.get('templateId')
    const modeParam = searchParams.get('mode') || 'default'
    const yearsParam = searchParams.get('years')
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    const oppTypeParam = searchParams.get('oppType')
    const oppIdParam = searchParams.get('oppId')
    const oppNameParam = searchParams.get('oppName')

    setScope('player')
    setSubjectType(type || 'pitching')
    setSelectedPlayer({ id: Number(playerId), name: playerName })
    setReportMode(modeParam)

    async function hydrateReport() {
      if (templateIdParam) {
        const { data: tmpl } = await supabase.from('report_templates').select('*').eq('id', templateIdParam).single()
        if (tmpl) {
          setTiles(tmpl.tiles_config || defaultTiles())
          setColumns(tmpl.columns || 4)
        } else {
          setTiles(defaultTiles())
        }
      } else {
        setTiles(defaultTiles())
      }

      const extraFilters: ActiveFilter[] = []

      if (yearsParam) {
        const yearDef = FILTER_CATALOG.find(f => f.key === 'game_year')!
        extraFilters.push({ def: yearDef, values: yearsParam.split(',') })
      }

      if (startDateParam || endDateParam) {
        const dateDef = FILTER_CATALOG.find(f => f.key === 'game_date')!
        extraFilters.push({ def: dateDef, startDate: startDateParam || '', endDate: endDateParam || '' })
      }

      if (oppTypeParam && oppIdParam) {
        if (oppTypeParam === 'team') {
          const teamDef = FILTER_CATALOG.find(f => f.key === 'vs_team')!
          extraFilters.push({ def: teamDef, values: [oppIdParam] })
        } else if (oppTypeParam === 'hitter') {
          const batterDef = FILTER_CATALOG.find(f => f.key === 'batter_name')!
          extraFilters.push({ def: batterDef, values: [oppNameParam || oppIdParam] })
        }
      }

      setGlobalFilters(extraFilters)

      if (modeParam === 'vs_similar_stuff' && type === 'pitching') {
        const pitcherRes = await fetch(`/api/player-data?id=${playerId}&col=pitcher`)
        const pitcherJson = await pitcherRes.json()
        const pitcherRows = pitcherJson.rows || []
        enrichData(pitcherRows)
        const profile = computeStuffProfile(pitcherRows)
        setPitcherStuffProfile(profile)

        if (oppTypeParam === 'hitter' && oppIdParam) {
          const hitterRes = await fetch(`/api/player-data?id=${oppIdParam}&col=batter`)
          const hitterJson = await hitterRes.json()
          const hitterRows = hitterJson.rows || []
          enrichData(hitterRows)
          setRawData(hitterRows)
          buildOptions(hitterRows)
        } else {
          setRawData(pitcherRows)
          buildOptions(pitcherRows)
        }
      } else {
        const col = (type || 'pitching') === "hitting" ? "batter" : "pitcher"
        const res = await fetch(`/api/player-data?id=${playerId}&col=${col}`)
        const json = await res.json()
        const rows = json.rows || []
        enrichData(rows)
        setRawData(rows)
        buildOptions(rows)
      }

      setLoading(false)
    }

    setLoading(true)
    hydrateReport()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load templates on mount
  useEffect(() => {
    loadTemplates()
    supabase.from('overlay_templates').select('id, name').order('created_at', { ascending: false }).then(({ data }) => {
      if (data) setOverlayTemplates(data)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (subjectSearchRef.current && !subjectSearchRef.current.contains(e.target as Node)) {
        setShowSubjectDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentPlayerName = scope === 'team' && activeRoster.length > 0
    ? activeRoster[rosterIndex]?.name
    : selectedPlayer?.name || ''

  const hasSubject = scope === 'team' ? activeRoster.length > 0 : !!selectedPlayer

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <ResearchNav active="/reports" />

      {/* ── Header Bar ────────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-3 md:px-6 py-2">
        <div className="max-w-[95vw] mx-auto flex flex-col gap-2 md:gap-0">

          {/* Row 1: Toggles + Subject */}
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            {/* Pitchers / Hitters toggle */}
            <div className="flex rounded-lg overflow-hidden border border-zinc-700">
              <button onClick={() => handleSubjectTypeChange('pitching')}
                className={`px-3 py-1.5 md:py-1 text-xs md:text-[11px] font-medium transition ${subjectType === 'pitching' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                Pitchers
              </button>
              <button onClick={() => handleSubjectTypeChange('hitting')}
                className={`px-3 py-1.5 md:py-1 text-xs md:text-[11px] font-medium transition ${subjectType === 'hitting' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                Hitters
              </button>
            </div>

            {/* Player / Team toggle */}
            <div className="flex rounded-lg overflow-hidden border border-zinc-700">
              <button onClick={() => handleScopeChange('player')}
                className={`px-3 py-1.5 md:py-1 text-xs md:text-[11px] font-medium transition ${scope === 'player' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                Player
              </button>
              <button onClick={() => handleScopeChange('team')}
                className={`px-3 py-1.5 md:py-1 text-xs md:text-[11px] font-medium transition ${scope === 'team' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                Team
              </button>
            </div>

            {/* Subject: Player search OR Team dropdown + roster nav */}
            {scope === 'player' ? (
              <div ref={subjectSearchRef} className="relative flex-1 min-w-[160px] max-w-xs">
                <input type="text"
                  value={subjectSearch}
                  onChange={e => handleSubjectSearch(e.target.value)}
                  onFocus={() => { if (subjectResults.length > 0) setShowSubjectDropdown(true) }}
                  placeholder={selectedPlayer ? selectedPlayer.name : `Search ${subjectType === 'pitching' ? 'pitcher' : 'hitter'}...`}
                  className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs md:text-[11px] text-white placeholder-zinc-500 focus:border-emerald-600 focus:outline-none" />
                {showSubjectDropdown && subjectResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                    {subjectResults.map((p: any) => (
                      <button key={p.player_id} onClick={() => selectPlayer(p)}
                        className="w-full text-left px-3 py-2.5 md:py-2 text-xs md:text-[11px] text-zinc-300 hover:bg-zinc-700 hover:text-white transition border-b border-zinc-700/50 last:border-0">
                        <span className="font-medium">{p.player_name}</span>
                        <span className="text-zinc-500 ml-2">{p.player_position} &middot; {p.pitch_count?.toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <select value={selectedTeam} onChange={e => handleTeamSelect(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs md:text-[11px] text-white focus:outline-none">
                  <option value="">Select team...</option>
                  {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {activeRoster.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => goToRosterPlayer(rosterIndex - 1)} disabled={rosterIndex === 0}
                      className="px-2 py-1.5 md:px-1.5 md:py-1 bg-zinc-800 border border-zinc-700 rounded text-xs md:text-[11px] text-zinc-400 hover:text-white disabled:opacity-30 transition">&larr;</button>
                    <select value={rosterIndex} onChange={e => goToRosterPlayer(Number(e.target.value))}
                      className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 md:py-1 text-xs md:text-[11px] text-white focus:outline-none max-w-[140px]">
                      {activeRoster.map((p, i) => (
                        <option key={p.id} value={i}>{p.name} ({p.position})</option>
                      ))}
                    </select>
                    <span className="text-[10px] text-zinc-600">{rosterIndex + 1}/{activeRoster.length}</span>
                    <button onClick={() => goToRosterPlayer(rosterIndex + 1)} disabled={rosterIndex >= activeRoster.length - 1}
                      className="px-2 py-1.5 md:px-1.5 md:py-1 bg-zinc-800 border border-zinc-700 rounded text-xs md:text-[11px] text-zinc-400 hover:text-white disabled:opacity-30 transition">&rarr;</button>
                  </div>
                )}
              </div>
            )}

            {loading && <div className="w-4 h-4 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />}
            <span className="text-[11px] text-zinc-600 ml-auto md:ml-0">{displayedPitchCount.toLocaleString()} pitches</span>
          </div>

          {/* Row 2: Templates, Modifier, Grid, Actions */}
          <div className="flex items-center gap-2 md:gap-3 flex-wrap md:mt-1.5">
            {/* Templates dropdown */}
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

            <div className="w-px h-5 bg-zinc-800 hidden md:block" />

            {/* Modifier dropdown */}
            <select
              value={reportMode === 'vs_similar_stuff' ? 'vs_similar_stuff' : (activeOverlayId || 'none')}
              onChange={e => {
                const val = e.target.value
                if (val === 'none') {
                  setReportMode('default')
                  setActiveOverlayId(null)
                  clearModifierTarget()
                } else if (val === 'vs_similar_stuff') {
                  setReportMode('vs_similar_stuff')
                  setActiveOverlayId(null)
                  const sourceData = modifierTargetData.length > 0 ? modifierTargetData : rawData
                  if (sourceData.length > 0) {
                    setPitcherStuffProfile(computeStuffProfile(sourceData))
                  }
                } else if (val === '__build__') {
                  setShowOverlayBuilder(true)
                  e.target.value = reportMode === 'vs_similar_stuff' ? 'vs_similar_stuff' : (activeOverlayId || 'none')
                } else {
                  setReportMode(val)
                  setActiveOverlayId(val)
                  const sourceData = modifierTargetData.length > 0 ? modifierTargetData : rawData
                  if (sourceData.length > 0) {
                    setPitcherStuffProfile(computeStuffProfile(sourceData))
                  }
                }
              }}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs md:text-[11px] text-zinc-400 focus:outline-none"
            >
              <option value="none">No Modifier</option>
              <option value="vs_similar_stuff">vs. Stuff</option>
              {overlayTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              <option value="__build__">Build Modifier...</option>
            </select>

            {/* Modifier target search */}
            <div ref={modifierSearchRef} className="relative">
              {modifierTarget ? (
                <div className="flex items-center gap-1.5 px-2 py-1.5 md:py-1 bg-amber-900/30 border border-amber-700/50 rounded-lg">
                  <span className="text-xs md:text-[11px] text-amber-400 font-medium">{modifierTarget.name}</span>
                  <button onClick={clearModifierTarget} className="text-amber-500 hover:text-amber-300 transition text-sm md:text-xs">&times;</button>
                </div>
              ) : (
                <>
                  <input type="text"
                    value={modifierTargetSearch}
                    onChange={e => handleModifierTargetSearch(e.target.value)}
                    placeholder={`vs. ${subjectType === 'hitting' ? 'pitcher' : 'hitter'}...`}
                    className="w-36 md:w-44 px-3 py-1.5 bg-zinc-800 border border-amber-700/50 rounded-lg text-xs md:text-[11px] text-amber-400 placeholder-amber-700/60 focus:border-amber-500 focus:outline-none" />
                  {modifierTargetResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-amber-700/50 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                      {modifierTargetResults.map((p: any) => (
                        <button key={p.player_id} onClick={() => selectModifierTarget(p)}
                          className="w-full text-left px-3 py-2.5 md:py-2 text-xs md:text-[11px] text-amber-300 hover:bg-zinc-700 hover:text-amber-200 transition border-b border-zinc-700/50 last:border-0">
                          <span className="font-medium">{p.player_name}</span>
                          <span className="text-amber-600 ml-2">{p.player_position} &middot; {p.pitch_count?.toLocaleString()}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Mode badge */}
            {reportMode !== 'default' && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                reportMode === 'vs_similar_stuff'
                  ? 'bg-amber-900/40 border border-amber-700/50 text-amber-400'
                  : 'bg-purple-900/40 border border-purple-700/50 text-purple-400'
              }`}>
                {reportMode === 'vs_similar_stuff' ? 'vs. Stuff' : overlayTemplates.find(t => t.id === activeOverlayId)?.name || 'Modifier'}
              </span>
            )}

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
              <button onClick={exportPDF} disabled={exporting}
                className="px-2.5 py-1.5 md:px-2 md:py-1 bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 rounded text-xs md:text-[11px] text-white font-medium transition disabled:opacity-50">
                {exporting ? '...' : 'PDF'}
              </button>
              <button onClick={openPushModal}
                className="px-2.5 py-1.5 md:px-2 md:py-1 bg-amber-700 hover:bg-amber-600 border border-amber-600 rounded text-xs md:text-[11px] text-white font-medium transition hidden sm:inline-flex">
                Push
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Global Filters */}
      {hasSubject && <FilterEngine activeFilters={globalFilters} onFiltersChange={setGlobalFilters} optionsCache={optionsCache} />}

      {/* Save Template Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowSaveModal(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 md:p-6 w-[90vw] max-w-80 mx-4" onClick={e => e.stopPropagation()}>
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

      {/* Push to Compete Modal */}
      {showPushModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowPushModal(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 md:p-6 w-[90vw] max-w-96 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-3">Push to Compete</h3>
            <p className="text-[11px] text-zinc-500 mb-4">Share this report with an athlete on Compete.</p>
            {pushError && <p className="text-[11px] text-red-400 mb-3">{pushError}</p>}
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-zinc-500 mb-1 block">Athlete</label>
                <select value={pushTarget} onChange={e => setPushTarget(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:border-amber-500 focus:outline-none">
                  <option value="">Select athlete...</option>
                  {competeAthletes.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.profiles?.full_name || a.profiles?.email || 'Unknown'} {a.position ? `(${a.position})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 mb-1 block">Title</label>
                <input value={pushTitle} onChange={e => setPushTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 mb-1 block">Description (optional)</label>
                <textarea value={pushDesc} onChange={e => setPushDesc(e.target.value)} rows={2}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowPushModal(false)}
                className="px-3 py-1.5 bg-zinc-800 text-zinc-400 rounded text-xs hover:text-white transition">Cancel</button>
              <button onClick={pushToCompete} disabled={!pushTarget || !pushTitle.trim() || pushing}
                className="px-3 py-1.5 bg-amber-600 text-white rounded text-xs hover:bg-amber-500 transition disabled:opacity-50">
                {pushing ? 'Pushing...' : 'Push Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modifier Template Builder */}
      {showOverlayBuilder && (
        <OverlayTemplateBuilder
          onClose={() => setShowOverlayBuilder(false)}
          onSaved={() => {
            supabase.from('overlay_templates').select('id, name').order('created_at', { ascending: false }).then(({ data }) => {
              if (data) setOverlayTemplates(data)
            })
          }}
        />
      )}

      {/* ── Empty State / Tile Grid ───────────────────────────────────── */}
      {!hasSubject && !loading ? (
        <div className="flex flex-col items-center justify-center py-20 md:py-32 text-center px-6">
          <div className="text-4xl mb-4 opacity-30">&#9776;</div>
          <h2 className="text-lg font-semibold text-zinc-500 mb-2">Reports Builder</h2>
          <p className="text-sm text-zinc-600 max-w-sm">
            {scope === 'player'
              ? `Search for a ${subjectType === 'pitching' ? 'pitcher' : 'hitter'} above to build a scouting report.`
              : 'Select a team above to begin scouting.'}
          </p>
        </div>
      ) : (
        <div className="max-w-[95vw] mx-auto px-3 md:px-6 py-3 md:py-4">
          {/* Editable Report Title / Subtitle */}
          <div ref={gridRef}>
          <div className="mb-3 text-center">
            <input type="text" value={reportTitle} onChange={e => setReportTitle(e.target.value)}
              placeholder={currentPlayerName || 'Report Title'}
              className="bg-transparent text-base md:text-lg font-bold text-white text-center w-full mx-auto block focus:outline-none placeholder-zinc-600" />
            <input type="text" value={reportSubtitle} onChange={e => setReportSubtitle(e.target.value)}
              placeholder={`${subjectType === 'pitching' ? 'Pitching' : 'Hitting'} Report · ${displayedPitchCount.toLocaleString()} pitches`}
              className="bg-transparent text-[11px] text-zinc-500 text-center w-full mx-auto block focus:outline-none placeholder-zinc-700 mt-0.5" />
          </div>
          <div className="grid gap-2 md:gap-3" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
            {effectiveTiles.map(tile => (
              <div key={tile.id} style={{ minHeight: columns === 1 ? 320 : columns === 2 ? 280 : 250 }}>
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
          </div>
          {tiles.length < 16 && (
            <button onClick={addTile}
              className="mt-3 w-full py-4 md:py-3 border-2 border-dashed border-zinc-800 rounded-lg text-zinc-600 hover:border-emerald-600 hover:text-emerald-400 transition text-sm font-medium">
              + Add Tile ({tiles.length}/16)
            </button>
          )}
        </div>
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
