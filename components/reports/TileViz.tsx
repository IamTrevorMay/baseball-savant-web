'use client'
import { useMemo, useState } from 'react'
import Plot from '../PlotWrapper'
import { COLORS, getPitchColor } from '../chartConfig'

// Shared zone shapes for strike zone
const ZONE_SHAPES = [
  { type: 'rect' as const, x0: -0.708, x1: 0.708, y0: 1.5, y1: 3.5, line: { color: '#fff', width: 2 } },
  { type: 'line' as const, x0: -0.236, x1: -0.236, y0: 1.5, y1: 3.5, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
  { type: 'line' as const, x0: 0.236, x1: 0.236, y0: 1.5, y1: 3.5, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
  { type: 'line' as const, x0: -0.708, x1: 0.708, y0: 2.167, y1: 2.167, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
  { type: 'line' as const, x0: -0.708, x1: 0.708, y0: 2.833, y1: 2.833, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
  { type: 'path' as const, path: 'M -0.708 0.15 L 0 0 L 0.708 0.15', line: { color: 'rgba(255,255,255,0.3)', width: 2 } },
]
const SPECTRUM: [number,string][] = [
  [0,'#1a3d7c'],[0.05,'#2166ac'],[0.15,'#3388b8'],[0.25,'#4ba8c4'],
  [0.35,'#6cc4a0'],[0.45,'#c8e64a'],[0.55,'#f0e830'],[0.65,'#f5a020'],
  [0.75,'#e06010'],[0.85,'#c42a0c'],[0.92,'#9e0000'],[1,'#7a0000'],
]

type MetricKey = 'frequency'|'ba'|'slg'|'woba'|'xba'|'xwoba'|'xslg'|'ev'|'la'|'whiff_pct'|'chase_pct'|'swing_pct'
const METRIC_LABELS: Record<MetricKey, string> = {
  frequency:'Frequency', ba:'BA', slg:'SLG', woba:'wOBA',
  xba:'xBA', xwoba:'xwOBA', xslg:'xSLG', ev:'Exit Velo', la:'Launch Angle', whiff_pct:'Whiff%', chase_pct:'Chase%', swing_pct:'Swing%',
}

function calcMetric(pitches: any[], metric: MetricKey): number|null {
  if (!pitches.length) return null
  switch(metric) {
    case 'frequency': return pitches.length
    case 'ba': {
      const ab = pitches.filter(p=>p.events&&!['walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf'].includes(p.events))
      const h = ab.filter(p=>['single','double','triple','home_run'].includes(p.events))
      return ab.length ? h.length/ab.length : null
    }
    case 'slg': {
      const ab = pitches.filter(p=>p.events&&!['walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf'].includes(p.events))
      if(!ab.length) return null
      const tb = ab.reduce((s,p)=>s+(p.events==='single'?1:p.events==='double'?2:p.events==='triple'?3:p.events==='home_run'?4:0),0)
      return tb/ab.length
    }
    case 'woba': { const v=pitches.map(p=>p.woba_value).filter((x:any)=>x!=null); return v.length?v.reduce((a:number,b:number)=>a+b,0)/v.length:null }
    case 'xba': { const v=pitches.map(p=>p.estimated_ba_using_speedangle).filter((x:any)=>x!=null); return v.length?v.reduce((a:number,b:number)=>a+b,0)/v.length:null }
    case 'xwoba': { const v=pitches.map(p=>p.estimated_woba_using_speedangle).filter((x:any)=>x!=null); return v.length?v.reduce((a:number,b:number)=>a+b,0)/v.length:null }
    case 'xslg': { const v=pitches.map(p=>p.estimated_slg_using_speedangle).filter((x:any)=>x!=null); return v.length?v.reduce((a:number,b:number)=>a+b,0)/v.length:null }
    case 'ev': { const v=pitches.map(p=>p.launch_speed).filter((x:any)=>x!=null); return v.length?v.reduce((a:number,b:number)=>a+b,0)/v.length:null }
    case 'la': { const v=pitches.map(p=>p.launch_angle).filter((x:any)=>x!=null); return v.length?v.reduce((a:number,b:number)=>a+b,0)/v.length:null }
    case 'whiff_pct': {
      const sw=pitches.filter(p=>{const d=(p.description||'').toLowerCase();return d.includes('swinging_strike')||d.includes('foul')||d.includes('hit_into_play')||d.includes('foul_tip')})
      const wh=pitches.filter(p=>(p.description||'').toLowerCase().includes('swinging_strike'))
      return sw.length?wh.length/sw.length:null
    }
    case 'chase_pct': {
      const oz=pitches.filter(p=>p.zone>9);const sw=oz.filter(p=>{const s=(p.description||'').toLowerCase();return s.includes('swinging_strike')||s.includes('foul')||s.includes('hit_into_play')})
      return oz.length?sw.length/oz.length:null
    }
    case 'swing_pct': {
      const sw=pitches.filter(p=>{const d=(p.description||'').toLowerCase();return d.includes('swinging_strike')||d.includes('foul')||d.includes('hit_into_play')||d.includes('foul_tip')})
      return pitches.length?sw.length/pitches.length:null
    }
    default: return null
  }
}
function fmtMetric(v:number|null,m:MetricKey):string {
  if(v===null) return '\u2014'
  if(m==='frequency') return String(v)
  if(['ba','slg','woba','xba','xwoba','xslg'].includes(m)) return v.toFixed(3)
  if(m==='ev') return v.toFixed(1)
  if(m==='la') return v.toFixed(1)+'\u00b0'
  if(m==='whiff_pct'||m==='chase_pct'||m==='swing_pct') return (v*100).toFixed(1)+'%'
  return v.toFixed(2)
}

// Bat annotation shapes for batter side
function batShapes(stand: 'L'|'R'|null): any[] {
  if (!stand) return []
  // Bat on the side the hitter stands — angled toward the plate
  const x = stand === 'R' ? -1.2 : 1.2
  const dx = stand === 'R' ? 0.35 : -0.35
  return [{
    type: 'line' as const,
    x0: x, x1: x + dx,
    y0: 1.0, y1: 2.8,
    line: { color: 'rgba(180,140,80,0.4)', width: 4 },
  }, {
    type: 'line' as const,
    x0: x + dx, x1: x + dx * 1.15,
    y0: 2.8, y1: 3.2,
    line: { color: 'rgba(180,140,80,0.25)', width: 3 },
  }]
}

// ── HEATMAP ──────────────────────────────────────────────────────────────────
export function TileHeatmap({data,metric='frequency',stand=null}:{data:any[];metric?:MetricKey;stand?:'L'|'R'|null}) {
  const f = data.filter(d=>d.plate_x!=null&&d.plate_z!=null)
  if(f.length<5) return <div className="flex-1 flex items-center justify-center text-zinc-600 text-[11px]">Not enough data</div>
  let trace: any
  if(metric==="frequency") {
    trace = {x:f.map(d=>d.plate_x),y:f.map(d=>d.plate_z),type:"histogram2dcontour",colorscale:SPECTRUM,ncontours:25,contours:{coloring:"heatmap"},line:{width:0},showscale:false,hovertemplate:"%{z:.0f} pitches<extra></extra>"}
  } else {
    const nb=16,xR=[-1.76,1.76],yR=[0.24,4.06],xS=(xR[1]-xR[0])/nb,yS=(yR[1]-yR[0])/nb
    const bins:any[][][]=Array.from({length:nb},()=>Array.from({length:nb},()=>[]))
    f.forEach(d=>{const xi=Math.min(Math.max(Math.floor((d.plate_x-xR[0])/xS),0),nb-1),yi=Math.min(Math.max(Math.floor((d.plate_z-yR[0])/yS),0),nb-1);bins[yi][xi].push(d)})
    const z=bins.map(row=>row.map(cell=>calcMetric(cell,metric)))
    // Chase%: null out bins inside the strike zone (can't chase in-zone pitches)
    if(metric==='chase_pct'){for(let r=0;r<nb;r++){for(let c=0;c<nb;c++){const bx=xR[0]+(c+.5)*xS,by=yR[0]+(r+.5)*yS;if(bx>=-0.708&&bx<=0.708&&by>=1.5&&by<=3.5)z[r][c]=null}}}
    for(let pass=0;pass<2;pass++){for(let r=0;r<nb;r++){for(let c=0;c<nb;c++){if(z[r][c]===null){
      // Don't interpolate into strike zone for chase%
      if(metric==='chase_pct'){const bx=xR[0]+(c+.5)*xS,by=yR[0]+(r+.5)*yS;if(bx>=-0.708&&bx<=0.708&&by>=1.5&&by<=3.5)continue}
      const neighbors:number[]=[];for(let dr=-1;dr<=1;dr++){for(let dc=-1;dc<=1;dc++){if(dr===0&&dc===0)continue;const nr=r+dr,nc=c+dc;if(nr>=0&&nr<nb&&nc>=0&&nc<nb&&z[nr][nc]!==null)neighbors.push(z[nr][nc]!)}};if(neighbors.length>=2)z[r][c]=neighbors.reduce((a,b)=>a+b,0)/neighbors.length}}}}
    trace={x:Array.from({length:nb},(_,i)=>xR[0]+(i+.5)*xS),y:Array.from({length:nb},(_,i)=>yR[0]+(i+.5)*yS),z,type:"heatmap",colorscale:SPECTRUM,showscale:false,zsmooth:"best",connectgaps:true,hoverongaps:false,hovertemplate:`${METRIC_LABELS[metric]}: %{z:.3f}<extra></extra>`}
  }
  const zVals = metric==="frequency" ? null : (trace.z as (number|null)[][])?.flat().filter((v:any):v is number=>v!==null)
  const zMin = zVals?.length ? Math.min(...zVals) : 0
  const zMax = zVals?.length ? Math.max(...zVals) : 1
  const fmtZ = (v:number) => metric==="frequency" ? String(Math.round(v)) : ["ba","slg","woba","xba","xwoba","xslg"].includes(metric) ? v.toFixed(3) : v.toFixed(1)
  return (
    <div className="relative w-full h-full">
      <Plot data={[trace]} layout={{paper_bgcolor:"transparent",plot_bgcolor:COLORS.bg,font:{color:COLORS.text,size:9},margin:{t:5,r:5,b:5,l:5},xaxis:{range:[-1.76,1.76],showticklabels:false,showgrid:false,zeroline:false,fixedrange:true},yaxis:{range:[0.24,4.06],showticklabels:false,showgrid:false,zeroline:false,scaleanchor:"x",fixedrange:true},shapes:[...(metric==='chase_pct'?[{type:'rect' as const,x0:-0.708,x1:0.708,y0:1.5,y1:3.5,fillcolor:'#09090b',line:{color:'#fff',width:2},layer:'above' as const},...ZONE_SHAPES.slice(1)]:[...ZONE_SHAPES]),...batShapes(stand)],autosize:true}} style={{width:"100%",height:"100%"}} />
      {zVals && zVals.length > 0 && (
        <div className="absolute bottom-1 left-1 flex items-center gap-1 bg-zinc-900/80 rounded px-1 py-0.5">
          <span className="text-[8px] text-zinc-400 font-mono">{fmtZ(zMin)}</span>
          <div className="w-12 h-1.5 rounded-full" style={{background:"linear-gradient(to right, #1a3d7c, #2166ac, #4ba8c4, #c8e64a, #f0e830, #e06010, #9e0000, #7a0000)"}} />
          <span className="text-[8px] text-zinc-400 font-mono">{fmtZ(zMax)}</span>
        </div>
      )}
    </div>
  )
}

// ── SCATTER ───────────────────────────────────────────────────────────────────
export type ScatterMode = 'location'|'movement'|'ev_la'
export function TileScatter({data,mode='location'}:{data:any[];mode?:ScatterMode}) {
  const groups:Record<string,any[]>={}
  const valid = data.filter(d => {
    if(mode==='location') return d.plate_x!=null&&d.plate_z!=null
    if(mode==='movement') return d.pfx_x!=null&&d.pfx_z!=null
    return d.launch_speed!=null&&d.launch_angle!=null
  })
  if(!valid.length) return <div className="flex-1 flex items-center justify-center text-zinc-600 text-[11px]">No data</div>
  valid.forEach(d=>{const k=d.pitch_name||'Unknown';if(!groups[k]) groups[k]=[];groups[k].push(d)})
  const xKey = mode==='location'?'plate_x':mode==='movement'?'pfx_x':'launch_speed'
  const yKey = mode==='location'?'plate_z':mode==='movement'?'pfx_z':'launch_angle'
  const xMul = mode==='movement'?12:1
  const yMul = mode==='movement'?12:1
  const traces = Object.entries(groups).map(([name,pts])=>{
    const customdata = pts.map(d => [d.player_name || "", d.release_speed ? d.release_speed.toFixed(1) : ""])
    const hoverTpl = mode==="location"
      ? `${name}<br>%{customdata[0]}<br>Velo: %{customdata[1]} mph<br>X: %{x:.1f}\"<br>Z: %{y:.1f}\"<extra></extra>`
      : mode==="movement"
      ? `${name}<br>%{customdata[0]}<br>Velo: %{customdata[1]} mph<br>HB: %{x:.1f}\"<br>IVB: %{y:.1f}\"<extra></extra>`
      : `${name}<br>%{customdata[0]}<br>Velo: %{customdata[1]} mph<br>EV: %{x:.1f}<br>LA: %{y:.1f}u00b0<extra></extra>`
    return {
      x:pts.map(d=>d[xKey]*xMul),y:pts.map(d=>d[yKey]*yMul),customdata,
      type:"scatter" as any,mode:"markers",marker:{size:3,color:getPitchColor(name),opacity:.5},
      name,hovertemplate:hoverTpl,
    }
  })
  const xTitle = mode==='location'?'':mode==='movement'?'H Break (in)':'Exit Velo'
  const yTitle = mode==='location'?'':mode==='movement'?'IVB (in)':'Launch Angle'
  const shapes = mode==='location'?ZONE_SHAPES:[]
  const xRange = mode==='location'?[-1.76,1.76]:undefined
  const yRange = mode==='location'?[0.24,4.06]:undefined
  return <Plot data={traces} layout={{paper_bgcolor:'transparent',plot_bgcolor:COLORS.bg,font:{color:COLORS.text,size:9},margin:{t:10,r:10,b:mode==='location'?5:30,l:mode==='location'?5:35},xaxis:{title:xTitle,range:xRange,showticklabels:mode!=='location',showgrid:mode!=='location',gridcolor:COLORS.grid,zeroline:mode==='movement',zerolinecolor:'#52525b',fixedrange:true,tickfont:{size:8}},yaxis:{title:yTitle,range:yRange,showticklabels:mode!=='location',showgrid:mode!=='location',gridcolor:COLORS.grid,zeroline:mode==='movement',zerolinecolor:'#52525b',scaleanchor:mode==='location'?'x':undefined,fixedrange:true,tickfont:{size:8}},shapes,showlegend:false,autosize:true}} style={{width:'100%',height:'100%'}} />
}

// ── BAR CHART ─────────────────────────────────────────────────────────────────
export type BarMetric = 'usage'|'whiff'|'velo'|'spin'|'csw'|'zone'|'chase'|'swing'|'ev'|'xwoba'
const BAR_LABELS:Record<BarMetric,string> = {usage:'Usage%',whiff:'Whiff%',velo:'Avg Velo',spin:'Avg Spin',csw:'CSW%',zone:'Zone%',chase:'Chase%',swing:'Swing%',ev:'Avg EV',xwoba:'xwOBA'}
export function TileBar({data,metric='usage'}:{data:any[];metric?:BarMetric}) {
  const types = [...new Set(data.map(d=>d.pitch_name).filter(Boolean))].sort()
  if(!types.length) return <div className="flex-1 flex items-center justify-center text-zinc-600 text-[11px]">No data</div>
  const vals = types.map(pt => {
    const p = data.filter(d=>d.pitch_name===pt)
    switch(metric) {
      case 'usage': return 100*p.length/data.length
      case 'whiff': {const sw=p.filter(d=>{const s=(d.description||'').toLowerCase();return s.includes('swinging_strike')||s.includes('foul')||s.includes('hit_into_play')||s.includes('foul_tip')});const wh=p.filter(d=>(d.description||'').toLowerCase().includes('swinging_strike'));return sw.length?100*wh.length/sw.length:0}
      case 'velo': {const v=p.map(d=>d.release_speed).filter(Boolean);return v.length?v.reduce((a:number,b:number)=>a+b,0)/v.length:0}
      case 'spin': {const v=p.map(d=>d.release_spin_rate).filter(Boolean);return v.length?v.reduce((a:number,b:number)=>a+b,0)/v.length:0}
      case 'csw': {const cs=p.filter(d=>{const s=(d.description||'').toLowerCase();return s.includes('swinging_strike')||s==='called_strike'});return p.length?100*cs.length/p.length:0}
      case 'zone': {const iz=p.filter(d=>d.zone>=1&&d.zone<=9);const hz=p.filter(d=>d.zone!=null);return hz.length?100*iz.length/hz.length:0}
      case 'chase': {const oz=p.filter(d=>d.zone>9);const sw=oz.filter(d=>{const s=(d.description||'').toLowerCase();return s.includes('swinging_strike')||s.includes('foul')||s.includes('hit_into_play')});return oz.length?100*sw.length/oz.length:0}
      case 'swing': {const sw=p.filter(d=>{const s=(d.description||'').toLowerCase();return s.includes('swinging_strike')||s.includes('foul')||s.includes('hit_into_play')||s.includes('foul_tip')});return p.length?100*sw.length/p.length:0}
      case 'ev': {const v=p.map(d=>d.launch_speed).filter(Boolean);return v.length?v.reduce((a:number,b:number)=>a+b,0)/v.length:0}
      case 'xwoba': {const v=p.map(d=>d.estimated_woba_using_speedangle).filter((x:any)=>x!=null);return v.length?v.reduce((a:number,b:number)=>a+b,0)/v.length:0}
      default: return 0
    }
  })
  return <Plot data={[{x:types,y:vals,type:'bar',marker:{color:types.map(t=>getPitchColor(t))},hovertemplate:'%{x}<br>%{y:.1f}<extra></extra>'}]} layout={{paper_bgcolor:'transparent',plot_bgcolor:COLORS.bg,font:{color:COLORS.text,size:9},margin:{t:10,r:10,b:40,l:35},xaxis:{tickfont:{size:8},gridcolor:COLORS.grid},yaxis:{title:BAR_LABELS[metric],titlefont:{size:9},tickfont:{size:8},gridcolor:COLORS.grid},autosize:true}} style={{width:'100%',height:'100%'}} />
}

// ── STRIKE ZONE OVERLAY ──────────────────────────────────────────────────────
export function TileStrikeZone({data,stand=null}:{data:any[];stand?:'L'|'R'|null}) {
  const groups:Record<string,any[]>={}
  const f = data.filter(d=>d.plate_x!=null&&d.plate_z!=null)
  if(!f.length) return <div className="flex-1 flex items-center justify-center text-zinc-600 text-[11px]">No data</div>
  f.forEach(d=>{const k=d.pitch_name||'Unknown';if(!groups[k]) groups[k]=[];groups[k].push(d)})
  const traces = Object.entries(groups).map(([name,pts])=>({
    x:pts.map(d=>d.plate_x),y:pts.map(d=>d.plate_z),
    type:'scatter' as any,mode:'markers',
    marker:{size:5,color:getPitchColor(name),opacity:.7,line:{width:.5,color:'rgba(0,0,0,0.3)'}},
    name,customdata:pts.map(d=>[d.player_name||"",d.release_speed?d.release_speed.toFixed(1):""]),hovertemplate:`${name}<br>%{customdata[0]}<br>Velo: %{customdata[1]} mph<br>X: %{x:.1f}\"<br>Z: %{y:.1f}\"<extra></extra>`,
  }))
  return <Plot data={traces} layout={{paper_bgcolor:'transparent',plot_bgcolor:COLORS.bg,font:{color:COLORS.text,size:9},margin:{t:5,r:5,b:5,l:5},xaxis:{range:[-1.76,1.76],showticklabels:false,showgrid:false,zeroline:false,fixedrange:true},yaxis:{range:[0.24,4.06],showticklabels:false,showgrid:false,zeroline:false,scaleanchor:'x',fixedrange:true},shapes:[...ZONE_SHAPES,...batShapes(stand)],showlegend:true,legend:{font:{size:8,color:COLORS.textLight},bgcolor:'rgba(0,0,0,0)',x:1,y:1,xanchor:'right'},autosize:true}} style={{width:'100%',height:'100%'}} />
}

// ── CUSTOM COLUMN DEFINITIONS ────────────────────────────────────────────────
function avg(pitches: any[], field: string): number | null {
  const v = pitches.map(d => d[field]).filter((x: any) => x != null)
  return v.length ? v.reduce((a: number, b: number) => a + b, 0) / v.length : null
}
function swings(p: any[]) {
  return p.filter(d => { const s = (d.description || '').toLowerCase(); return s.includes('swinging_strike') || s.includes('foul') || s.includes('hit_into_play') || s.includes('foul_tip') })
}
function whiffs(p: any[]) {
  return p.filter(d => (d.description || '').toLowerCase().includes('swinging_strike'))
}

export interface CustomColDef {
  key: string
  label: string
  category: string
  compute: (pitches: any[], allData: any[]) => any
  fmt: (v: any) => string
}

export const CUSTOM_COL_CATALOG: CustomColDef[] = [
  // Counting
  { key: 'n', label: '#', category: 'Counting', compute: p => p.length, fmt: v => String(v) },
  { key: 'pct', label: 'Usage%', category: 'Counting', compute: (p, all) => 100 * p.length / all.length, fmt: v => v.toFixed(1) },
  // Velocity / Movement
  { key: 'velo', label: 'Velo', category: 'Velocity', compute: p => avg(p, 'release_speed'), fmt: v => v === null ? '\u2014' : v.toFixed(1) },
  { key: 'max_velo', label: 'Max Velo', category: 'Velocity', compute: p => { const v = p.map((d: any) => d.release_speed).filter(Boolean); return v.length ? Math.max(...v) : null }, fmt: v => v === null ? '\u2014' : v.toFixed(1) },
  { key: 'spin', label: 'Spin', category: 'Velocity', compute: p => avg(p, 'release_spin_rate'), fmt: v => v === null ? '\u2014' : String(Math.round(v)) },
  { key: 'hb', label: 'HB"', category: 'Velocity', compute: p => { const v = avg(p, 'pfx_x'); return v !== null ? v * 12 : null }, fmt: v => v === null ? '\u2014' : v.toFixed(1) },
  { key: 'ivb', label: 'IVB"', category: 'Velocity', compute: p => { const v = avg(p, 'pfx_z'); return v !== null ? v * 12 : null }, fmt: v => v === null ? '\u2014' : v.toFixed(1) },
  { key: 'ext', label: 'Ext', category: 'Velocity', compute: p => avg(p, 'release_extension'), fmt: v => v === null ? '\u2014' : v.toFixed(1) },
  // Rates
  { key: 'whiff', label: 'Whiff%', category: 'Rates', compute: p => { const sw = swings(p); const wh = whiffs(p); return sw.length ? 100 * wh.length / sw.length : null }, fmt: v => v === null ? '\u2014' : v.toFixed(1) },
  { key: 'csw', label: 'CSW%', category: 'Rates', compute: p => { const cs = p.filter((d: any) => { const s = (d.description || '').toLowerCase(); return s.includes('swinging_strike') || s === 'called_strike' }); return p.length ? 100 * cs.length / p.length : null }, fmt: v => v === null ? '\u2014' : v.toFixed(1) },
  { key: 'zone', label: 'Zone%', category: 'Rates', compute: p => { const iz = p.filter((d: any) => d.zone >= 1 && d.zone <= 9); const hz = p.filter((d: any) => d.zone != null); return hz.length ? 100 * iz.length / hz.length : null }, fmt: v => v === null ? '\u2014' : v.toFixed(1) },
  { key: 'chase', label: 'Chase%', category: 'Rates', compute: p => { const oz = p.filter((d: any) => d.zone > 9); const sw = oz.filter((d: any) => { const s = (d.description || '').toLowerCase(); return s.includes('swinging_strike') || s.includes('foul') || s.includes('hit_into_play') }); return oz.length ? 100 * sw.length / oz.length : null }, fmt: v => v === null ? '\u2014' : v.toFixed(1) },
  { key: 'swing', label: 'Swing%', category: 'Rates', compute: p => { const sw = p.filter((d: any) => { const s = (d.description || '').toLowerCase(); return s.includes('swinging_strike') || s.includes('foul') || s.includes('hit_into_play') || s.includes('foul_tip') }); return p.length ? 100 * sw.length / p.length : null }, fmt: v => v === null ? '\u2014' : v.toFixed(1) },
  // Batting
  { key: 'ba', label: 'BA', category: 'Batting', compute: p => { const ab = p.filter((d: any) => d.events && !['walk', 'hit_by_pitch', 'sac_fly', 'sac_bunt'].includes(d.events)); const h = ab.filter((d: any) => ['single', 'double', 'triple', 'home_run'].includes(d.events)); return ab.length ? h.length / ab.length : null }, fmt: v => v === null ? '\u2014' : v.toFixed(3) },
  { key: 'slg', label: 'SLG', category: 'Batting', compute: p => { const ab = p.filter((d: any) => d.events && !['walk', 'hit_by_pitch', 'sac_fly', 'sac_bunt'].includes(d.events)); if (!ab.length) return null; const tb = ab.reduce((s: number, d: any) => s + (d.events === 'single' ? 1 : d.events === 'double' ? 2 : d.events === 'triple' ? 3 : d.events === 'home_run' ? 4 : 0), 0); return tb / ab.length }, fmt: v => v === null ? '\u2014' : v.toFixed(3) },
  { key: 'xba', label: 'xBA', category: 'Batting', compute: p => avg(p, 'estimated_ba_using_speedangle'), fmt: v => v === null ? '\u2014' : v.toFixed(3) },
  { key: 'xwoba', label: 'xwOBA', category: 'Batting', compute: p => avg(p, 'estimated_woba_using_speedangle'), fmt: v => v === null ? '\u2014' : v.toFixed(3) },
  // Batted Ball
  { key: 'ev', label: 'EV', category: 'Batted Ball', compute: p => avg(p, 'launch_speed'), fmt: v => v === null ? '\u2014' : v.toFixed(1) },
  { key: 'max_ev', label: 'Max EV', category: 'Batted Ball', compute: p => { const v = p.map((d: any) => d.launch_speed).filter(Boolean); return v.length ? Math.max(...v) : null }, fmt: v => v === null ? '\u2014' : v.toFixed(1) },
  { key: 'la', label: 'LA', category: 'Batted Ball', compute: p => avg(p, 'launch_angle'), fmt: v => v === null ? '\u2014' : v.toFixed(1) + '\u00b0' },
  { key: 'gb_pct', label: 'GB%', category: 'Batted Ball', compute: p => { const bbe = p.filter((d: any) => d.bb_type); const gb = bbe.filter((d: any) => d.bb_type === 'ground_ball'); return bbe.length ? 100 * gb.length / bbe.length : null }, fmt: v => v === null ? '\u2014' : v.toFixed(1) },
]

// Create model column definitions from deployed model metadata
export function makeModelColDef(columnName: string, label: string, category: string, decimals: number = 2): CustomColDef {
  return {
    key: columnName,
    label,
    category,
    compute: p => avg(p, columnName),
    fmt: v => v === null ? '\u2014' : v.toFixed(decimals),
  }
}

export function getFullColCatalog(extraCols: CustomColDef[] = []): CustomColDef[] {
  return [...CUSTOM_COL_CATALOG, ...extraCols]
}

const COL_MAP = Object.fromEntries(CUSTOM_COL_CATALOG.map(c => [c.key, c]))

export const GROUP_BY_OPTIONS = [
  { key: 'pitch_name', label: 'Pitch Type' },
  { key: 'game_year', label: 'Season' },
  { key: 'stand', label: 'Batter Side' },
  { key: 'count', label: 'Count' },
  { key: 'base_situation', label: 'Situation' },
]

// ── DATA TABLE ───────────────────────────────────────────────────────────────
export type TableMode = 'arsenal' | 'results' | 'splits' | 'custom'
type SortDir = 'asc' | 'desc'

export function TileTable({ data, mode = 'arsenal', columns, groupBy }: { data: any[]; mode?: TableMode; columns?: string[]; groupBy?: string }) {
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const { rows, cols } = useMemo(() => {
    const types = [...new Set(data.map(d => d.pitch_name).filter(Boolean))].sort((a, b) => {
      return data.filter(d => d.pitch_name === b).length - data.filter(d => d.pitch_name === a).length
    })

    if (mode === 'custom') {
      const gbField = groupBy || 'pitch_name'
      const gbLabel = GROUP_BY_OPTIONS.find(o => o.key === gbField)?.label || gbField
      const groups = [...new Set(data.map(d => d[gbField]).filter(Boolean))].map(String).sort((a, b) => {
        return data.filter(d => String(d[gbField]) === b).length - data.filter(d => String(d[gbField]) === a).length
      })
      const selectedKeys = columns && columns.length ? columns : ['n', 'pct', 'velo', 'whiff', 'ev']
      const colDefs: [string, string][] = [['_group', gbLabel], ...selectedKeys.map(k => [k, COL_MAP[k]?.label || k] as [string, string])]
      const computedRows = groups.map(g => {
        const p = data.filter(d => String(d[gbField]) === g)
        const row: Record<string, any> = { _group: g }
        selectedKeys.forEach(k => {
          const def = COL_MAP[k]
          row[k] = def ? def.compute(p, data) : null
        })
        return row
      })
      return { rows: computedRows, cols: colDefs }
    }

    if (mode === 'arsenal') {
      const computedRows = types.map(pt => {
        const p = data.filter(d => d.pitch_name === pt)
        const velos = p.map(d => d.release_speed).filter(Boolean)
        const spins = p.map(d => d.release_spin_rate).filter(Boolean)
        const hb = p.map(d => d.pfx_x).filter((v: any) => v != null)
        const vb = p.map(d => d.pfx_z).filter((v: any) => v != null)
        const sw = swings(p)
        const wh = whiffs(p)
        const evs = p.map(d => d.launch_speed).filter(Boolean)
        return {
          pitch: pt, n: p.length, pct: 100 * p.length / data.length,
          velo: velos.length ? velos.reduce((a: number, b: number) => a + b, 0) / velos.length : null,
          spin: spins.length ? Math.round(spins.reduce((a: number, b: number) => a + b, 0) / spins.length) : null,
          hb: hb.length ? hb.reduce((a: number, b: number) => a + b, 0) / hb.length * 12 : null,
          ivb: vb.length ? vb.reduce((a: number, b: number) => a + b, 0) / vb.length * 12 : null,
          whiff: sw.length ? 100 * wh.length / sw.length : null,
          ev: evs.length ? evs.reduce((a: number, b: number) => a + b, 0) / evs.length : null,
        }
      })
      return { rows: computedRows, cols: [['pitch', 'Pitch'], ['n', '#'], ['pct', '%'], ['velo', 'Velo'], ['spin', 'Spin'], ['hb', 'HB'], ['ivb', 'IVB'], ['whiff', 'Whiff%'], ['ev', 'EV']] as [string, string][] }
    }

    if (mode === 'results') {
      const computedRows = types.map(pt => {
        const p = data.filter(d => d.pitch_name === pt)
        const ab = p.filter(d => d.events && !['walk', 'hit_by_pitch', 'sac_fly', 'sac_bunt'].includes(d.events))
        const h = ab.filter(d => ['single', 'double', 'triple', 'home_run'].includes(d.events))
        const xba = p.map(d => d.estimated_ba_using_speedangle).filter((v: any) => v != null)
        const xw = p.map(d => d.estimated_woba_using_speedangle).filter((v: any) => v != null)
        return {
          pitch: pt, n: p.length,
          ba: ab.length ? h.length / ab.length : null,
          xba: xba.length ? xba.reduce((a: number, b: number) => a + b, 0) / xba.length : null,
          xwoba: xw.length ? xw.reduce((a: number, b: number) => a + b, 0) / xw.length : null,
        }
      })
      return { rows: computedRows, cols: [['pitch', 'Pitch'], ['n', '#'], ['ba', 'BA'], ['xba', 'xBA'], ['xwoba', 'xwOBA']] as [string, string][] }
    }

    if (mode === 'splits') {
      const computedRows = ['L', 'R'].map(side => {
        const p = data.filter(d => d.stand === side)
        const ab = p.filter(d => d.events && !['walk', 'hit_by_pitch', 'sac_fly', 'sac_bunt'].includes(d.events))
        const h = ab.filter(d => ['single', 'double', 'triple', 'home_run'].includes(d.events))
        const sw = swings(p)
        const wh = whiffs(p)
        return { side: 'vs ' + side + 'HH', n: p.length, ba: ab.length ? h.length / ab.length : null, whiff: sw.length ? 100 * wh.length / sw.length : null }
      })
      return { rows: computedRows, cols: [['side', 'Split'], ['n', '#'], ['ba', 'BA'], ['whiff', 'Whiff%']] as [string, string][] }
    }

    return { rows: [], cols: [] }
  }, [data, mode, columns, groupBy])

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!sortCol) return rows
    return [...rows].sort((a: any, b: any) => {
      let av = a[sortCol], bv = b[sortCol]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [rows, sortCol, sortDir])

  if (!sortedRows.length) return <div className="flex-1 flex items-center justify-center text-zinc-600 text-[11px]">No data</div>

  // Format cell values
  function fmtCell(key: string, val: any): string {
    if (val === null || val === undefined) return '\u2014'
    // Custom mode: use column def formatter
    if (mode === 'custom' && COL_MAP[key]) return COL_MAP[key].fmt(val)
    // Arsenal/results/splits formatting
    if (key === 'pitch' || key === 'side') return val
    if (key === 'n') return String(val)
    if (key === 'pct') return typeof val === 'number' ? val.toFixed(1) : val
    if (['ba', 'xba', 'xwoba'].includes(key)) return typeof val === 'number' ? val.toFixed(3) : val
    if (['velo', 'hb', 'ivb', 'ev', 'whiff'].includes(key)) return typeof val === 'number' ? val.toFixed(1) : val
    if (key === 'spin') return typeof val === 'number' ? String(Math.round(val)) : val
    return typeof val === 'number' && !Number.isInteger(val) ? val.toFixed(2) : String(val)
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-[11px] md:text-[10px]">
        <thead>
          <tr className="bg-zinc-800/50">
            {cols.map(([k, l]) => (
              <th key={k} onClick={() => handleSort(k)}
                className={`px-2.5 py-1.5 md:px-2 md:py-1 font-medium text-right first:text-left cursor-pointer hover:text-zinc-200 transition whitespace-nowrap ${sortCol === k ? 'text-emerald-400' : 'text-zinc-400'}`}>
                {l} {sortCol === k ? (sortDir === 'desc' ? '\u2193' : '\u2191') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r: any, i: number) => (
            <tr key={i} className="border-t border-zinc-800/30 hover:bg-zinc-800/20">
              {cols.map(([k]) => (
                <td key={k} className="px-2.5 py-1.5 md:px-2 md:py-1 font-mono text-zinc-300 text-right first:text-left first:font-sans first:text-white">
                  {fmtCell(k, r[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export { METRIC_LABELS }
export type { MetricKey }
