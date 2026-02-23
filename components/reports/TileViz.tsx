'use client'
import { useMemo } from 'react'
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
  [0,'#2166ac'],[0.1,'#3388b8'],[0.2,'#4ba8c4'],[0.25,'#6cc4a0'],
  [0.35,'#98d478'],[0.45,'#c8e64a'],[0.55,'#f0e830'],[0.65,'#f5c020'],
  [0.75,'#f09015'],[0.85,'#e06010'],[0.95,'#c42a0c'],[1,'#9e0000'],
]

type MetricKey = 'frequency'|'ba'|'slg'|'woba'|'xba'|'xwoba'|'xslg'|'ev'|'la'|'whiff_pct'
const METRIC_LABELS: Record<MetricKey, string> = {
  frequency:'Frequency', ba:'BA', slg:'SLG', woba:'wOBA',
  xba:'xBA', xwoba:'xwOBA', xslg:'xSLG', ev:'Exit Velo', la:'Launch Angle', whiff_pct:'Whiff%',
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
    default: return null
  }
}
function fmtMetric(v:number|null,m:MetricKey):string {
  if(v===null) return '\u2014'
  if(m==='frequency') return String(v)
  if(['ba','slg','woba','xba','xwoba','xslg'].includes(m)) return v.toFixed(3)
  if(m==='ev') return v.toFixed(1)
  if(m==='la') return v.toFixed(1)+'\u00b0'
  if(m==='whiff_pct') return (v*100).toFixed(1)+'%'
  return v.toFixed(2)
}

// ── HEATMAP ──────────────────────────────────────────────────────────────────
export function TileHeatmap({data,metric='frequency'}:{data:any[];metric?:MetricKey}) {
  const f = data.filter(d=>d.plate_x!=null&&d.plate_z!=null)
  if(f.length<5) return <div className="flex-1 flex items-center justify-center text-zinc-600 text-[11px]">Not enough data</div>
  let trace: any
  if(metric==='frequency') {
    trace = {x:f.map(d=>d.plate_x),y:f.map(d=>d.plate_z),type:'histogram2dcontour',colorscale:SPECTRUM,ncontours:20,contours:{coloring:'heatmap'},line:{width:0},showscale:false,hovertemplate:'%{z:.0f} pitches<extra></extra>'}
  } else {
    const nb=12,xR=[-2.2,2.2],yR=[-0.2,4.5],xS=(xR[1]-xR[0])/nb,yS=(yR[1]-yR[0])/nb
    const bins:any[][][]=Array.from({length:nb},()=>Array.from({length:nb},()=>[]))
    f.forEach(d=>{const xi=Math.min(Math.floor((d.plate_x-xR[0])/xS),nb-1),yi=Math.min(Math.floor((d.plate_z-yR[0])/yS),nb-1);if(xi>=0&&yi>=0) bins[yi][xi].push(d)})
    trace={x:Array.from({length:nb},(_,i)=>xR[0]+(i+.5)*xS),y:Array.from({length:nb},(_,i)=>yR[0]+(i+.5)*yS),z:bins.map(row=>row.map(cell=>calcMetric(cell,metric))),type:'heatmap',colorscale:SPECTRUM,showscale:false,zsmooth:'best',hoverongaps:false,hovertemplate:`${METRIC_LABELS[metric]}: %{z:.3f}<extra></extra>`}
  }
  return <Plot data={[trace]} layout={{paper_bgcolor:'transparent',plot_bgcolor:COLORS.bg,font:{color:COLORS.text,size:9},margin:{t:5,r:5,b:5,l:5},xaxis:{range:[-2.2,2.2],showticklabels:false,showgrid:false,zeroline:false,fixedrange:true},yaxis:{range:[-0.2,4.5],showticklabels:false,showgrid:false,zeroline:false,scaleanchor:'x',fixedrange:true},shapes:ZONE_SHAPES,autosize:true}} style={{width:'100%',height:'100%'}} />
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
  const traces = Object.entries(groups).map(([name,pts])=>({
    x:pts.map(d=>d[xKey]*xMul),y:pts.map(d=>d[yKey]*yMul),
    type:'scatter' as any,mode:'markers',marker:{size:3,color:getPitchColor(name),opacity:.5},
    name,hovertemplate:`${name}<br>%{x:.1f}, %{y:.1f}<extra></extra>`,
  }))
  const xTitle = mode==='location'?'':mode==='movement'?'H Break (in)':'Exit Velo'
  const yTitle = mode==='location'?'':mode==='movement'?'IVB (in)':'Launch Angle'
  const shapes = mode==='location'?ZONE_SHAPES:[]
  const xRange = mode==='location'?[-2.2,2.2]:undefined
  const yRange = mode==='location'?[-0.2,4.5]:undefined
  return <Plot data={traces} layout={{paper_bgcolor:'transparent',plot_bgcolor:COLORS.bg,font:{color:COLORS.text,size:9},margin:{t:10,r:10,b:mode==='location'?5:30,l:mode==='location'?5:35},xaxis:{title:xTitle,range:xRange,showticklabels:mode!=='location',showgrid:mode!=='location',gridcolor:COLORS.grid,zeroline:mode==='movement',zerolinecolor:'#52525b',fixedrange:true,tickfont:{size:8}},yaxis:{title:yTitle,range:yRange,showticklabels:mode!=='location',showgrid:mode!=='location',gridcolor:COLORS.grid,zeroline:mode==='movement',zerolinecolor:'#52525b',scaleanchor:mode==='location'?'x':undefined,fixedrange:true,tickfont:{size:8}},shapes,showlegend:false,autosize:true}} style={{width:'100%',height:'100%'}} />
}

// ── BAR CHART ─────────────────────────────────────────────────────────────────
export type BarMetric = 'usage'|'whiff'|'velo'|'spin'|'csw'|'zone'|'chase'|'ev'|'xwoba'
const BAR_LABELS:Record<BarMetric,string> = {usage:'Usage%',whiff:'Whiff%',velo:'Avg Velo',spin:'Avg Spin',csw:'CSW%',zone:'Zone%',chase:'Chase%',ev:'Avg EV',xwoba:'xwOBA'}
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
      case 'ev': {const v=p.map(d=>d.launch_speed).filter(Boolean);return v.length?v.reduce((a:number,b:number)=>a+b,0)/v.length:0}
      case 'xwoba': {const v=p.map(d=>d.estimated_woba_using_speedangle).filter((x:any)=>x!=null);return v.length?v.reduce((a:number,b:number)=>a+b,0)/v.length:0}
      default: return 0
    }
  })
  return <Plot data={[{x:types,y:vals,type:'bar',marker:{color:types.map(t=>getPitchColor(t))},hovertemplate:'%{x}<br>%{y:.1f}<extra></extra>'}]} layout={{paper_bgcolor:'transparent',plot_bgcolor:COLORS.bg,font:{color:COLORS.text,size:9},margin:{t:10,r:10,b:40,l:35},xaxis:{tickfont:{size:8},gridcolor:COLORS.grid},yaxis:{title:BAR_LABELS[metric],titlefont:{size:9},tickfont:{size:8},gridcolor:COLORS.grid},autosize:true}} style={{width:'100%',height:'100%'}} />
}

// ── STRIKE ZONE OVERLAY ──────────────────────────────────────────────────────
export function TileStrikeZone({data}:{data:any[]}) {
  const groups:Record<string,any[]>={}
  const f = data.filter(d=>d.plate_x!=null&&d.plate_z!=null)
  if(!f.length) return <div className="flex-1 flex items-center justify-center text-zinc-600 text-[11px]">No data</div>
  f.forEach(d=>{const k=d.pitch_name||'Unknown';if(!groups[k]) groups[k]=[];groups[k].push(d)})
  const traces = Object.entries(groups).map(([name,pts])=>({
    x:pts.map(d=>d.plate_x),y:pts.map(d=>d.plate_z),
    type:'scatter' as any,mode:'markers',
    marker:{size:5,color:getPitchColor(name),opacity:.7,line:{width:.5,color:'rgba(0,0,0,0.3)'}},
    name,hovertemplate:`${name}<br>X:%{x:.2f} Z:%{y:.2f}<extra></extra>`,
  }))
  return <Plot data={traces} layout={{paper_bgcolor:'transparent',plot_bgcolor:COLORS.bg,font:{color:COLORS.text,size:9},margin:{t:5,r:5,b:5,l:5},xaxis:{range:[-2.2,2.2],showticklabels:false,showgrid:false,zeroline:false,fixedrange:true},yaxis:{range:[-0.2,4.5],showticklabels:false,showgrid:false,zeroline:false,scaleanchor:'x',fixedrange:true},shapes:ZONE_SHAPES,showlegend:true,legend:{font:{size:8,color:COLORS.textLight},bgcolor:'rgba(0,0,0,0)',x:1,y:1,xanchor:'right'},autosize:true}} style={{width:'100%',height:'100%'}} />
}

// ── DATA TABLE ───────────────────────────────────────────────────────────────
export type TableMode = 'arsenal'|'results'|'splits'|'custom'
export function TileTable({data,mode='arsenal'}:{data:any[];mode?:TableMode}) {
  const rows = useMemo(()=>{
    const types=[...new Set(data.map(d=>d.pitch_name).filter(Boolean))].sort((a,b)=>{
      return data.filter(d=>d.pitch_name===b).length - data.filter(d=>d.pitch_name===a).length
    })
    if(mode==='arsenal') {
      return types.map(pt=>{
        const p=data.filter(d=>d.pitch_name===pt)
        const velos=p.map(d=>d.release_speed).filter(Boolean)
        const spins=p.map(d=>d.release_spin_rate).filter(Boolean)
        const hb=p.map(d=>d.pfx_x).filter((v:any)=>v!=null)
        const vb=p.map(d=>d.pfx_z).filter((v:any)=>v!=null)
        const sw=p.filter(d=>{const s=(d.description||'').toLowerCase();return s.includes('swinging_strike')||s.includes('foul')||s.includes('hit_into_play')||s.includes('foul_tip')})
        const wh=p.filter(d=>(d.description||'').toLowerCase().includes('swinging_strike'))
        const evs=p.map(d=>d.launch_speed).filter(Boolean)
        return {
          pitch:pt, n:p.length, pct:(100*p.length/data.length).toFixed(1),
          velo:velos.length?(velos.reduce((a:number,b:number)=>a+b,0)/velos.length).toFixed(1):'—',
          spin:spins.length?Math.round(spins.reduce((a:number,b:number)=>a+b,0)/spins.length):'—',
          hb:hb.length?(hb.reduce((a:number,b:number)=>a+b,0)/hb.length*12).toFixed(1):'—',
          ivb:vb.length?(vb.reduce((a:number,b:number)=>a+b,0)/vb.length*12).toFixed(1):'—',
          whiff:sw.length?(100*wh.length/sw.length).toFixed(1):'—',
          ev:evs.length?(evs.reduce((a:number,b:number)=>a+b,0)/evs.length).toFixed(1):'—',
        }
      })
    }
    if(mode==='results') {
      return types.map(pt=>{
        const p=data.filter(d=>d.pitch_name===pt)
        const ab=p.filter(d=>d.events&&!['walk','hit_by_pitch','sac_fly','sac_bunt'].includes(d.events))
        const h=ab.filter(d=>['single','double','triple','home_run'].includes(d.events))
        const xba=p.map(d=>d.estimated_ba_using_speedangle).filter((v:any)=>v!=null)
        const xw=p.map(d=>d.estimated_woba_using_speedangle).filter((v:any)=>v!=null)
        return {
          pitch:pt, n:p.length, ba:ab.length?(h.length/ab.length).toFixed(3):'—',
          xba:xba.length?(xba.reduce((a:number,b:number)=>a+b,0)/xba.length).toFixed(3):'—',
          xwoba:xw.length?(xw.reduce((a:number,b:number)=>a+b,0)/xw.length).toFixed(3):'—',
        }
      })
    }
    if(mode==='splits') {
      return ['L','R'].map(side=>{
        const p=data.filter(d=>d.stand===side)
        const ab=p.filter(d=>d.events&&!['walk','hit_by_pitch','sac_fly','sac_bunt'].includes(d.events))
        const h=ab.filter(d=>['single','double','triple','home_run'].includes(d.events))
        const sw=p.filter(d=>{const s=(d.description||'').toLowerCase();return s.includes('swinging_strike')||s.includes('foul')||s.includes('hit_into_play')||s.includes('foul_tip')})
        const wh=p.filter(d=>(d.description||'').toLowerCase().includes('swinging_strike'))
        return { side:'vs '+side+'HH', n:p.length, ba:ab.length?(h.length/ab.length).toFixed(3):'—', whiff:sw.length?(100*wh.length/sw.length).toFixed(1):'—' }
      })
    }
    return []
  },[data,mode])

  if(!rows.length) return <div className="flex-1 flex items-center justify-center text-zinc-600 text-[11px]">No data</div>

  const cols = mode==='arsenal' ? [['pitch','Pitch'],['n','#'],['pct','%'],['velo','Velo'],['spin','Spin'],['hb','HB'],['ivb','IVB'],['whiff','Whiff%'],['ev','EV']]
    : mode==='results' ? [['pitch','Pitch'],['n','#'],['ba','BA'],['xba','xBA'],['xwoba','xwOBA']]
    : [['side','Split'],['n','#'],['ba','BA'],['whiff','Whiff%']]

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-[10px]">
        <thead><tr className="bg-zinc-800/50">{cols.map(([k,l])=><th key={k} className="px-2 py-1 text-zinc-400 font-medium text-right first:text-left">{l}</th>)}</tr></thead>
        <tbody>{rows.map((r:any,i:number)=>(
          <tr key={i} className="border-t border-zinc-800/30 hover:bg-zinc-800/20">
            {cols.map(([k])=><td key={k} className="px-2 py-1 font-mono text-zinc-300 text-right first:text-left first:font-sans first:text-white">{r[k]}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

export { METRIC_LABELS }
export type { MetricKey }
