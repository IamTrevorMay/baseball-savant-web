'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { loadGlossary, colName, colDesc } from '@/lib/glossary'
import { SidebarCheckboxes, Chips, RangeInput } from '@/components/FilterComponents'
import VizPanel from '@/components/VizPanel'

interface RangeFilter { min: string; max: string }
type CatFilter = string[] | null
const emptyRange: RangeFilter = { min: '', max: '' }

interface Filters {
  player_name: CatFilter; pitch_type: CatFilter; pitch_name: CatFilter
  home_team: CatFilter; away_team: CatFilter; stand: CatFilter; p_throws: CatFilter
  type: CatFilter; events: CatFilter; description: CatFilter; bb_type: CatFilter
  game_type: CatFilter; inning_topbot: CatFilter
  if_fielding_alignment: CatFilter; of_fielding_alignment: CatFilter
  balls: CatFilter; strikes: CatFilter; outs_when_up: CatFilter; inning: CatFilter
  zone: CatFilter; game_year: CatFilter
  release_speed: RangeFilter; effective_speed: RangeFilter; release_spin_rate: RangeFilter
  spin_axis: RangeFilter; release_extension: RangeFilter; release_pos_x: RangeFilter
  release_pos_z: RangeFilter; release_pos_y: RangeFilter; arm_angle: RangeFilter
  pfx_x: RangeFilter; pfx_z: RangeFilter; plate_x: RangeFilter; plate_z: RangeFilter
  api_break_x_arm: RangeFilter; api_break_z_with_gravity: RangeFilter
  api_break_x_batter_in: RangeFilter; launch_speed: RangeFilter; launch_angle: RangeFilter
  hit_distance_sc: RangeFilter; bat_speed: RangeFilter; swing_length: RangeFilter
  attack_angle: RangeFilter; attack_direction: RangeFilter; swing_path_tilt: RangeFilter
  sz_top: RangeFilter; sz_bot: RangeFilter; delta_run_exp: RangeFilter
  delta_home_win_exp: RangeFilter; estimated_ba_using_speedangle: RangeFilter
  estimated_woba_using_speedangle: RangeFilter; estimated_slg_using_speedangle: RangeFilter
  woba_value: RangeFilter; home_score: RangeFilter; away_score: RangeFilter
  age_pit: RangeFilter; age_bat: RangeFilter; n_thruorder_pitcher: RangeFilter
  game_date_start: string; game_date_end: string
}

const defaultFilters: Filters = {
  player_name:null,pitch_type:null,pitch_name:null,home_team:null,away_team:null,
  stand:null,p_throws:null,type:null,events:null,description:null,bb_type:null,
  game_type:null,inning_topbot:null,if_fielding_alignment:null,of_fielding_alignment:null,
  balls:null,strikes:null,outs_when_up:null,inning:null,zone:null,game_year:null,
  release_speed:{...emptyRange},effective_speed:{...emptyRange},release_spin_rate:{...emptyRange},
  spin_axis:{...emptyRange},release_extension:{...emptyRange},release_pos_x:{...emptyRange},
  release_pos_z:{...emptyRange},release_pos_y:{...emptyRange},arm_angle:{...emptyRange},
  pfx_x:{...emptyRange},pfx_z:{...emptyRange},plate_x:{...emptyRange},plate_z:{...emptyRange},
  api_break_x_arm:{...emptyRange},api_break_z_with_gravity:{...emptyRange},
  api_break_x_batter_in:{...emptyRange},launch_speed:{...emptyRange},launch_angle:{...emptyRange},
  hit_distance_sc:{...emptyRange},bat_speed:{...emptyRange},swing_length:{...emptyRange},
  attack_angle:{...emptyRange},attack_direction:{...emptyRange},swing_path_tilt:{...emptyRange},
  sz_top:{...emptyRange},sz_bot:{...emptyRange},delta_run_exp:{...emptyRange},
  delta_home_win_exp:{...emptyRange},estimated_ba_using_speedangle:{...emptyRange},
  estimated_woba_using_speedangle:{...emptyRange},estimated_slg_using_speedangle:{...emptyRange},
  woba_value:{...emptyRange},home_score:{...emptyRange},away_score:{...emptyRange},
  age_pit:{...emptyRange},age_bat:{...emptyRange},n_thruorder_pitcher:{...emptyRange},
  game_date_start:'',game_date_end:''
}

const TABLE_COLS = [
  'player_name','pitch_name','game_date','release_speed','release_spin_rate',
  'pfx_x','pfx_z','plate_x','plate_z','events','description',
  'launch_speed','launch_angle','hit_distance_sc','balls','strikes',
  'outs_when_up','inning','stand','p_throws','home_team','away_team',
  'estimated_ba_using_speedangle','estimated_woba_using_speedangle',
  'bat_speed','swing_length','arm_angle','release_extension',
  'api_break_x_arm','api_break_z_with_gravity','zone','bb_type',
  'effective_speed','spin_axis','release_pos_x','release_pos_z',
  'sz_top','sz_bot','inning_topbot','game_year'
]

const SECTIONS = [
  { id:'players', label:'Players', icon:'👤' },
  { id:'date', label:'Date & Season', icon:'📅' },
  { id:'teams', label:'Teams', icon:'⚾' },
  { id:'pitch_info', label:'Pitch Info', icon:'🎯' },
  { id:'pitch_movement', label:'Pitch Movement', icon:'↗️' },
  { id:'release', label:'Release Point', icon:'💪' },
  { id:'location', label:'Pitch Location', icon:'📍' },
  { id:'count', label:'Count & Situation', icon:'📊' },
  { id:'outcome', label:'Pitch Outcome', icon:'📋' },
  { id:'batted_ball', label:'Batted Ball', icon:'🏏' },
  { id:'swing', label:'Swing Metrics', icon:'⚡' },
  { id:'expected', label:'Expected Stats', icon:'🧮' },
  { id:'game_state', label:'Game State', icon:'🏟️' },
  { id:'handedness', label:'Handedness', icon:'🤚' },
  { id:'alignment', label:'Defensive Alignment', icon:'🛡️' },
  { id:'age', label:'Player Age', icon:'🎂' },
]

export default function ExplorePage() {
  const [loading, setLoading] = useState(true)
  const [dbInfo, setDbInfo] = useState({ total: 0, lastDate: '' })
  const [opts, setOpts] = useState<Record<string, string[]>>({})
  const [filters, setFilters] = useState<Filters>({...defaultFilters})
  const [selPlayers, setSelPlayers] = useState<string[]>([])
  const [allPlayers, setAllPlayers] = useState<string[]>([])
  const [pQuery, setPQuery] = useState('')
  const [showSug, setShowSug] = useState(false)
  const [results, setResults] = useState<any[]>([])
  const [resCount, setResCount] = useState(0)
  const [status, setStatus] = useState('')
  const [sideOpen, setSideOpen] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [updateMsg, setUpdateMsg] = useState("")
  const [openSec, setOpenSec] = useState<Set<string>>(new Set(['players']))
  const [sortCol, setSortCol] = useState('')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')
  const [page, setPage] = useState(0)
  const perPage = 100
  const sugRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    init()
    const h = (e: MouseEvent) => { if (sugRef.current && !sugRef.current.contains(e.target as Node)) setShowSug(false) }
    document.addEventListener('click', h); return () => document.removeEventListener('click', h)
  }, [])

  async function init() {
    await loadGlossary()
    const { count } = await supabase.from('pitches').select('*', { count:'exact', head:true })
    const { data: ld } = await supabase.from('pitches').select('game_date').order('game_date', { ascending:false }).limit(1)
    setDbInfo({ total: count||0, lastDate: ld?.[0]?.game_date||'Unknown' })
    const o: Record<string,string[]> = {}
    for (const col of ['pitch_type','pitch_name','type','events','description','bb_type','game_type','stand','p_throws','home_team','away_team','inning_topbot','if_fielding_alignment','of_fielding_alignment']) {
      const { data } = await supabase.rpc('get_distinct_values', { col_name: col })
      if (data) o[col] = data.map((r:any)=>r.value).filter(Boolean).sort()
    }
    o.teams = [...new Set([...(o.home_team||[]),...(o.away_team||[])])].sort()
    o.balls=['0','1','2','3']; o.strikes=['0','1','2']; o.outs_when_up=['0','1','2']
    o.inning = Array.from({length:18},(_,i)=>String(i+1))
    o.zone = Array.from({length:14},(_,i)=>String(i+1))
    const { data: yd } = await supabase.rpc('get_distinct_values', { col_name:'game_year' })
    if (yd) o.game_year = yd.map((r:any)=>r.value).filter(Boolean).sort().reverse()
    setOpts(o)
    const { data: pd } = await supabase.from('player_summary').select('player_name').order('player_name')
    if (pd) setAllPlayers(pd.map((r:any)=>r.player_name).filter(Boolean))
    setLoading(false)
  }

  async function applyFilters() {
    setStatus('Querying...'); setPage(0)
    let q = supabase.from('pitches').select('*', { count:'exact' })
    if (selPlayers.length>0) q=q.in('player_name',selPlayers)
    if (filters.game_date_start) q=q.gte('game_date',filters.game_date_start)
    if (filters.game_date_end) q=q.lte('game_date',filters.game_date_end)
    const cats:[keyof Filters,string][] = [
      ['pitch_type','pitch_type'],['pitch_name','pitch_name'],['type','type'],
      ['events','events'],['description','description'],['bb_type','bb_type'],
      ['game_type','game_type'],['stand','stand'],['p_throws','p_throws'],
      ['inning_topbot','inning_topbot'],['home_team','home_team'],['away_team','away_team'],
      ['if_fielding_alignment','if_fielding_alignment'],['of_fielding_alignment','of_fielding_alignment'],
    ]
    for (const [fk,col] of cats) { const v=filters[fk] as CatFilter; if(v&&v.length>0) q=q.in(col,v) }
    const ints:[keyof Filters,string][] = [
      ['balls','balls'],['strikes','strikes'],['outs_when_up','outs_when_up'],
      ['inning','inning'],['zone','zone'],['game_year','game_year']
    ]
    for (const [fk,col] of ints) { const v=filters[fk] as CatFilter; if(v&&v.length>0) q=q.in(col,v.map(Number)) }
    const ranges:[keyof Filters,string][] = [
      ['release_speed','release_speed'],['effective_speed','effective_speed'],
      ['release_spin_rate','release_spin_rate'],['spin_axis','spin_axis'],
      ['release_extension','release_extension'],['release_pos_x','release_pos_x'],
      ['release_pos_z','release_pos_z'],['release_pos_y','release_pos_y'],
      ['arm_angle','arm_angle'],['pfx_x','pfx_x'],['pfx_z','pfx_z'],
      ['plate_x','plate_x'],['plate_z','plate_z'],
      ['api_break_x_arm','api_break_x_arm'],['api_break_z_with_gravity','api_break_z_with_gravity'],
      ['api_break_x_batter_in','api_break_x_batter_in'],
      ['launch_speed','launch_speed'],['launch_angle','launch_angle'],
      ['hit_distance_sc','hit_distance_sc'],['bat_speed','bat_speed'],
      ['swing_length','swing_length'],['attack_angle','attack_angle'],
      ['attack_direction','attack_direction'],['swing_path_tilt','swing_path_tilt'],
      ['sz_top','sz_top'],['sz_bot','sz_bot'],
      ['delta_run_exp','delta_run_exp'],['delta_home_win_exp','delta_home_win_exp'],
      ['estimated_ba_using_speedangle','estimated_ba_using_speedangle'],
      ['estimated_woba_using_speedangle','estimated_woba_using_speedangle'],
      ['estimated_slg_using_speedangle','estimated_slg_using_speedangle'],
      ['woba_value','woba_value'],['home_score','home_score'],['away_score','away_score'],
      ['age_pit','age_pit'],['age_bat','age_bat'],['n_thruorder_pitcher','n_thruorder_pitcher'],
    ]
    for (const [fk,col] of ranges) { const r=filters[fk] as RangeFilter; if(r?.min) q=q.gte(col,parseFloat(r.min)); if(r?.max) q=q.lte(col,parseFloat(r.max)) }
    q=q.order('game_date', { ascending: false }).limit(2000)
    const { data,count,error } = await q
    if (error) setStatus('Error: '+error.message)
    else { setResults(data||[]); setResCount(count||0); setStatus(`${(count||0).toLocaleString()} total results`) }
  }

  function clearAll() { setFilters({...defaultFilters}); setSelPlayers([]); setPQuery(''); setStatus(''); setResults([]); setResCount(0) }
  function togCat(k:keyof Filters,v:string) {
    setFilters(p => { const c=(p[k] as CatFilter)||[]; const u=c.includes(v)?c.filter(x=>x!==v):[...c,v]; return {...p,[k]:u.length>0?u:null} })
  }
  function setRng(k:keyof Filters,f:'min'|'max',v:string) {
    setFilters(p => ({...p,[k]:{...(p[k] as RangeFilter),[f]:v}}))
  }
  function togSec(id:string) { setOpenSec(p => { const n=new Set(p); if(n.has(id)) n.delete(id); else n.add(id); return n }) }
  function cntFilters():number {
    let c=selPlayers.length; if(filters.game_date_start)c++; if(filters.game_date_end)c++
    Object.entries(filters).forEach(([k,v])=>{ if(k.startsWith('game_date'))return; if(Array.isArray(v)&&v.length>0)c+=v.length; if(v&&typeof v==='object'&&'min' in v){if(v.min)c++;if(v.max)c++} })
    return c
  }
  async function runUpdate() {
    setUpdating(true); setUpdateMsg("Fetching from Baseball Savant...")
    try {
      const end = new Date().toISOString().split("T")[0]
      const start = new Date(Date.now() - 7*24*60*60*1000).toISOString().split("T")[0]
      const res = await fetch("/api/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start_date: start, end_date: end }) })
      const data = await res.json()
      if (data.error) setUpdateMsg("Error: " + data.error)
      else setUpdateMsg(data.message)
    } catch (e: any) { setUpdateMsg("Error: " + e.message) }
    setTimeout(() => setUpdateMsg(""), 5000)
    setUpdating(false)
  }
  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
    setPage(0)
  }
  const pSugs = allPlayers.filter(p=>p.toLowerCase().includes(pQuery.toLowerCase())&&!selPlayers.includes(p)).slice(0,10)
  function fmt(v:any):string { if(v===null||v===undefined)return'—'; if(typeof v==='number'&&!Number.isInteger(v))return v.toFixed(2); return String(v) }

  const sortedResults = sortCol ? [...results].sort((a,b) => {
    let av=a[sortCol], bv=b[sortCol]
    if(av==null&&bv==null)return 0; if(av==null)return 1; if(bv==null)return -1
    if(typeof av==='string') return sortDir==='asc'?av.localeCompare(bv):bv.localeCompare(av)
    return sortDir==='asc'?av-bv:bv-av
  }) : results
  const pageData = sortedResults.slice(page*perPage, (page+1)*perPage)
  const totalPages = Math.ceil(sortedResults.length / perPage)

  function renderSection(id: string) {
    switch(id) {
      case 'players': return (
        <div ref={sugRef}>
          <div className="flex flex-wrap gap-1 mb-2">
            {selPlayers.map(p=>(
              <span key={p} className="bg-emerald-900/40 border border-emerald-700/40 text-emerald-300 px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                {p}<button onClick={()=>setSelPlayers(pr=>pr.filter(x=>x!==p))} className="hover:text-white text-emerald-500">×</button>
              </span>
            ))}
          </div>
          <div className="relative">
            <input type="text" value={pQuery} onChange={e=>{setPQuery(e.target.value);setShowSug(true)}} onFocus={()=>pQuery&&setShowSug(true)}
              placeholder="Search player..." className="w-full p-2 bg-zinc-950 border border-zinc-700 rounded text-[12px] text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none"/>
            {showSug&&pSugs.length>0&&(
              <div className="absolute top-full left-0 right-0 bg-zinc-800 border border-zinc-700 rounded mt-1 max-h-40 overflow-y-auto z-50 shadow-xl">
                {pSugs.map(p=>(<div key={p} onClick={()=>{setSelPlayers(pr=>[...pr,p]);setPQuery('');setShowSug(false)}} className="px-2 py-1.5 text-[12px] cursor-pointer hover:bg-zinc-700 text-zinc-400 hover:text-white">{p}</div>))}
              </div>
            )}
          </div>
        </div>
      )
      case 'date': return (
        <div className="space-y-2">
          <Chips label="Season" items={opts.game_year||[]} selected={filters.game_year} onToggle={v=>togCat('game_year',v)}/>
          <div><label className="text-[11px] text-zinc-500 mb-1 block">Start Date</label>
            <input type="date" value={filters.game_date_start} onChange={e=>setFilters(p=>({...p,game_date_start:e.target.value}))} className="w-full p-1.5 bg-zinc-950 border border-zinc-700 rounded text-[12px] text-white focus:border-emerald-600 focus:outline-none"/></div>
          <div><label className="text-[11px] text-zinc-500 mb-1 block">End Date</label>
            <input type="date" value={filters.game_date_end} onChange={e=>setFilters(p=>({...p,game_date_end:e.target.value}))} className="w-full p-1.5 bg-zinc-950 border border-zinc-700 rounded text-[12px] text-white focus:border-emerald-600 focus:outline-none"/></div>
          <SidebarCheckboxes label="Game Type" items={opts.game_type||[]} selected={filters.game_type} onToggle={v=>togCat('game_type',v)}/>
        </div>
      )
      case 'teams': return (
        <div className="space-y-2">
          <SidebarCheckboxes label="Home Team" items={opts.teams||[]} selected={filters.home_team} onToggle={v=>togCat('home_team',v)}/>
          <SidebarCheckboxes label="Away Team" items={opts.teams||[]} selected={filters.away_team} onToggle={v=>togCat('away_team',v)}/>
        </div>
      )
      case 'pitch_info': return (
        <div className="space-y-2">
          <SidebarCheckboxes label="Pitch Type (Code)" items={opts.pitch_type||[]} selected={filters.pitch_type} onToggle={v=>togCat('pitch_type',v)}/>
          <SidebarCheckboxes label="Pitch Name" items={opts.pitch_name||[]} selected={filters.pitch_name} onToggle={v=>togCat('pitch_name',v)}/>
          <RangeInput label="Velocity (mph)" value={filters.release_speed} onChange={(f,v)=>setRng('release_speed',f,v)}/>
          <RangeInput label="Effective Speed" value={filters.effective_speed} onChange={(f,v)=>setRng('effective_speed',f,v)}/>
          <RangeInput label="Spin Rate (rpm)" value={filters.release_spin_rate} onChange={(f,v)=>setRng('release_spin_rate',f,v)}/>
          <RangeInput label="Spin Axis (°)" value={filters.spin_axis} onChange={(f,v)=>setRng('spin_axis',f,v)}/>
        </div>
      )
      case 'pitch_movement': return (
        <div className="space-y-2">
          <RangeInput label="H Break (in)" value={filters.pfx_x} onChange={(f,v)=>setRng('pfx_x',f,v)}/>
          <RangeInput label="V Break (in)" value={filters.pfx_z} onChange={(f,v)=>setRng('pfx_z',f,v)}/>
          <RangeInput label="Arm-Side Break" value={filters.api_break_x_arm} onChange={(f,v)=>setRng('api_break_x_arm',f,v)}/>
          <RangeInput label="Total Vert Break" value={filters.api_break_z_with_gravity} onChange={(f,v)=>setRng('api_break_z_with_gravity',f,v)}/>
          <RangeInput label="Batter-Side Break" value={filters.api_break_x_batter_in} onChange={(f,v)=>setRng('api_break_x_batter_in',f,v)}/>
        </div>
      )
      case 'release': return (
        <div className="space-y-2">
          <RangeInput label="Extension (ft)" value={filters.release_extension} onChange={(f,v)=>setRng('release_extension',f,v)}/>
          <RangeInput label="Pos X (ft)" value={filters.release_pos_x} onChange={(f,v)=>setRng('release_pos_x',f,v)}/>
          <RangeInput label="Pos Z (ft)" value={filters.release_pos_z} onChange={(f,v)=>setRng('release_pos_z',f,v)}/>
          <RangeInput label="Pos Y (ft)" value={filters.release_pos_y} onChange={(f,v)=>setRng('release_pos_y',f,v)}/>
          <RangeInput label="Arm Angle (°)" value={filters.arm_angle} onChange={(f,v)=>setRng('arm_angle',f,v)}/>
        </div>
      )
      case 'location': return (
        <div className="space-y-2">
          <RangeInput label="Plate X (ft)" value={filters.plate_x} onChange={(f,v)=>setRng('plate_x',f,v)}/>
          <RangeInput label="Plate Z (ft)" value={filters.plate_z} onChange={(f,v)=>setRng('plate_z',f,v)}/>
          <RangeInput label="Zone Top" value={filters.sz_top} onChange={(f,v)=>setRng('sz_top',f,v)}/>
          <RangeInput label="Zone Bot" value={filters.sz_bot} onChange={(f,v)=>setRng('sz_bot',f,v)}/>
          <Chips label="Zone (1-14)" items={opts.zone||[]} selected={filters.zone} onToggle={v=>togCat('zone',v)}/>
        </div>
      )
      case 'count': return (
        <div className="space-y-2">
          <Chips label="Balls" items={['0','1','2','3']} selected={filters.balls} onToggle={v=>togCat('balls',v)}/>
          <Chips label="Strikes" items={['0','1','2']} selected={filters.strikes} onToggle={v=>togCat('strikes',v)}/>
          <Chips label="Outs" items={['0','1','2']} selected={filters.outs_when_up} onToggle={v=>togCat('outs_when_up',v)}/>
          <SidebarCheckboxes label="Inning" items={opts.inning||[]} selected={filters.inning} onToggle={v=>togCat('inning',v)}/>
          <SidebarCheckboxes label="Half" items={opts.inning_topbot||[]} selected={filters.inning_topbot} onToggle={v=>togCat('inning_topbot',v)}/>
          <RangeInput label="Times Thru Order" value={filters.n_thruorder_pitcher} onChange={(f,v)=>setRng('n_thruorder_pitcher',f,v)}/>
        </div>
      )
      case 'outcome': return (
        <div className="space-y-2">
          <SidebarCheckboxes label="Pitch Result (B/S/X)" items={opts.type||[]} selected={filters.type} onToggle={v=>togCat('type',v)}/>
          <SidebarCheckboxes label="Description" items={opts.description||[]} selected={filters.description} onToggle={v=>togCat('description',v)}/>
          <SidebarCheckboxes label="Play Result" items={opts.events||[]} selected={filters.events} onToggle={v=>togCat('events',v)}/>
          <RangeInput label="Delta Run Exp" value={filters.delta_run_exp} onChange={(f,v)=>setRng('delta_run_exp',f,v)}/>
          <RangeInput label="Delta Win Exp" value={filters.delta_home_win_exp} onChange={(f,v)=>setRng('delta_home_win_exp',f,v)}/>
        </div>
      )
      case 'batted_ball': return (
        <div className="space-y-2">
          <SidebarCheckboxes label="Batted Ball Type" items={opts.bb_type||[]} selected={filters.bb_type} onToggle={v=>togCat('bb_type',v)}/>
          <RangeInput label="Exit Velo (mph)" value={filters.launch_speed} onChange={(f,v)=>setRng('launch_speed',f,v)}/>
          <RangeInput label="Launch Angle (°)" value={filters.launch_angle} onChange={(f,v)=>setRng('launch_angle',f,v)}/>
          <RangeInput label="Distance (ft)" value={filters.hit_distance_sc} onChange={(f,v)=>setRng('hit_distance_sc',f,v)}/>
        </div>
      )
      case 'swing': return (
        <div className="space-y-2">
          <RangeInput label="Bat Speed (mph)" value={filters.bat_speed} onChange={(f,v)=>setRng('bat_speed',f,v)}/>
          <RangeInput label="Swing Length (ft)" value={filters.swing_length} onChange={(f,v)=>setRng('swing_length',f,v)}/>
          <RangeInput label="Attack Angle (°)" value={filters.attack_angle} onChange={(f,v)=>setRng('attack_angle',f,v)}/>
          <RangeInput label="Attack Dir (°)" value={filters.attack_direction} onChange={(f,v)=>setRng('attack_direction',f,v)}/>
          <RangeInput label="Path Tilt (°)" value={filters.swing_path_tilt} onChange={(f,v)=>setRng('swing_path_tilt',f,v)}/>
        </div>
      )
      case 'expected': return (
        <div className="space-y-2">
          <RangeInput label="xBA" value={filters.estimated_ba_using_speedangle} onChange={(f,v)=>setRng('estimated_ba_using_speedangle',f,v)}/>
          <RangeInput label="xwOBA" value={filters.estimated_woba_using_speedangle} onChange={(f,v)=>setRng('estimated_woba_using_speedangle',f,v)}/>
          <RangeInput label="xSLG" value={filters.estimated_slg_using_speedangle} onChange={(f,v)=>setRng('estimated_slg_using_speedangle',f,v)}/>
          <RangeInput label="wOBA Value" value={filters.woba_value} onChange={(f,v)=>setRng('woba_value',f,v)}/>
        </div>
      )
      case 'game_state': return (
        <div className="space-y-2">
          <RangeInput label="Home Score" value={filters.home_score} onChange={(f,v)=>setRng('home_score',f,v)}/>
          <RangeInput label="Away Score" value={filters.away_score} onChange={(f,v)=>setRng('away_score',f,v)}/>
        </div>
      )
      case 'handedness': return (
        <div className="space-y-2">
          <SidebarCheckboxes label="Pitcher Hand" items={opts.p_throws||[]} selected={filters.p_throws} onToggle={v=>togCat('p_throws',v)}/>
          <SidebarCheckboxes label="Batter Side" items={opts.stand||[]} selected={filters.stand} onToggle={v=>togCat('stand',v)}/>
        </div>
      )
      case 'alignment': return (
        <div className="space-y-2">
          <SidebarCheckboxes label="IF Alignment" items={opts.if_fielding_alignment||[]} selected={filters.if_fielding_alignment} onToggle={v=>togCat('if_fielding_alignment',v)}/>
          <SidebarCheckboxes label="OF Alignment" items={opts.of_fielding_alignment||[]} selected={filters.of_fielding_alignment} onToggle={v=>togCat('of_fielding_alignment',v)}/>
        </div>
      )
      case 'age': return (
        <div className="space-y-2">
          <RangeInput label="Pitcher Age" value={filters.age_pit} onChange={(f,v)=>setRng('age_pit',f,v)}/>
          <RangeInput label="Batter Age" value={filters.age_bat} onChange={(f,v)=>setRng('age_bat',f,v)}/>
        </div>
      )
      default: return null
    }
  }

  if (loading) return (
    <div className="fixed inset-0 bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin mx-auto mb-6"/>
        <h3 className="text-lg font-medium text-white mb-2">Triton</h3>
        <p className="text-zinc-500 text-sm">Loading filters...</p>
      </div>
    </div>
  )

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-200 overflow-hidden">
      <header className="h-11 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={()=>setSideOpen(!sideOpen)} className="text-zinc-400 hover:text-white transition p-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>
          <a href="/" className="font-[family-name:var(--font-bebas)] text-orange-500 hover:text-orange-400 text-sm uppercase tracking-wider transition">TRITON APEX</a>
          <a href="/home" className="font-[family-name:var(--font-bebas)] text-emerald-400 tracking-wide text-sm hover:text-emerald-300 transition ml-2">Research</a>
          <span className="text-xs text-zinc-600">|</span>
          <span className="text-xs text-zinc-500">Data Explorer</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[11px] text-zinc-600 font-mono">{dbInfo.total.toLocaleString()} pitches · through {dbInfo.lastDate}</span>
          <a href="/home" className="text-[11px] text-zinc-500 hover:text-emerald-400 transition">Home</a>
          <a href="/pitchers" className="text-[11px] text-zinc-500 hover:text-emerald-400 transition">Pitchers</a>
          <a href="/hitters" className="text-[11px] text-zinc-500 hover:text-emerald-400 transition">Hitters</a>
          <a href="/reports" className="text-[11px] text-zinc-500 hover:text-emerald-400 transition">Reports</a>
          <a href="/umpire" className="text-[11px] text-zinc-500 hover:text-emerald-400 transition">Umpires</a>
          <a href="/analyst" className="text-[11px] text-zinc-500 hover:text-emerald-400 transition">Analyst</a>
          <button onClick={runUpdate} disabled={updating} className="text-[11px] text-zinc-500 hover:text-emerald-400 transition disabled:text-zinc-700">{updating ? "Updating..." : "Update Data"}</button>
          {updateMsg && <span className="text-[11px] text-emerald-400">{updateMsg}</span>}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className={`${sideOpen?'w-[280px]':'w-0'} bg-zinc-900/80 border-r border-zinc-800 transition-all duration-200 overflow-hidden shrink-0 flex flex-col`}>
          <div className="px-3 py-2.5 border-b border-zinc-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Filters</span>
              {cntFilters()>0&&<span className="bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center">{cntFilters()}</span>}
            </div>
            <button onClick={clearAll} className="text-[11px] text-zinc-600 hover:text-zinc-300 transition">Reset</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {SECTIONS.map(s=>(
              <div key={s.id} className="border-b border-zinc-800/50">
                <button onClick={()=>togSec(s.id)}
                  className={`w-full text-left px-3 py-2 text-[13px] flex items-center justify-between hover:bg-zinc-800/50 transition ${openSec.has(s.id)?'text-zinc-200':'text-zinc-500'}`}>
                  <span className="flex items-center gap-2"><span className="text-[11px] w-4 text-center">{s.icon}</span>{s.label}</span>
                  <svg className={`w-3 h-3 transition-transform ${openSec.has(s.id)?'rotate-180':''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                </button>
                {openSec.has(s.id)&&<div className="px-3 pb-3">{renderSection(s.id)}</div>}
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-zinc-800 space-y-2 shrink-0">
            <button onClick={applyFilters} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded text-sm font-medium transition">Apply Filters</button>
            {status&&<div className={`text-xs text-center py-1 ${status.includes('Error')?'text-red-400':'text-emerald-400'}`}>{status}</div>}
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="h-9 bg-zinc-900/50 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-4">
              <span className="text-[11px] text-zinc-500">
                Showing <span className="text-white font-medium">{pageData.length}</span> of <span className="text-white font-medium">{resCount.toLocaleString()}</span>
              </span>
              {selPlayers.length>0&&<span className="text-[11px] text-emerald-400">{selPlayers.join(', ')}</span>}
            </div>
            {totalPages>1&&(
              <div className="flex items-center gap-2">
                <button onClick={()=>setPage(Math.max(0,page-1))} disabled={page===0} className="px-2 py-0.5 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-400 disabled:opacity-30">←</button>
                <span className="text-[11px] text-zinc-500">{page+1}/{totalPages}</span>
                <button onClick={()=>setPage(Math.min(totalPages-1,page+1))} disabled={page>=totalPages-1} className="px-2 py-0.5 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-400 disabled:opacity-30">→</button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {results.length>0?(
              <>
                <table className="w-full">
                  <thead className="sticky top-0 z-10">
                    <tr>{TABLE_COLS.map(c=>(
                      <th key={c} onClick={()=>handleSort(c)} title={colDesc(c)}
                        className={`bg-zinc-900 text-left text-[11px] font-medium px-3 py-2 border-b border-zinc-800 whitespace-nowrap cursor-pointer hover:text-zinc-200 transition ${
                          sortCol===c?'text-emerald-400':'text-zinc-400'
                        }`}>
                        {colName(c)} {sortCol===c?(sortDir==='desc'?'↓':'↑'):''}
                      </th>
                    ))}</tr>
                  </thead>
                  <tbody>{pageData.map((row,i)=>(
                    <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                      {TABLE_COLS.map(c=>(
                        <td key={c} className={`px-3 py-1.5 text-[11px] whitespace-nowrap ${
                          c==='player_name'?'text-white font-medium cursor-pointer hover:text-emerald-400':
                          c==='release_speed'?'text-amber-400 font-mono':
                          c==='launch_speed'?'text-sky-400 font-mono':
                          c==='events'&&row[c]?'text-emerald-400':
                          typeof row[c]==='number'?'text-zinc-300 font-mono':'text-zinc-400'
                        }`}
                        onClick={()=>{ if(c==='player_name'&&row.pitcher) window.location.href=`/player/${row.pitcher}` }}>
                          {fmt(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}</tbody>
                </table>
                <VizPanel data={results} />
              </>
            ):(
              <div className="flex items-center justify-center h-full text-zinc-600">
                <div className="text-center"><p className="text-lg mb-2">No data loaded</p><p className="text-sm">Apply filters to search pitches</p></div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
