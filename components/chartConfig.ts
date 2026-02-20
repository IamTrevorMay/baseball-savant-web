export const COLORS = {
  bg: '#09090b', paper: '#18181b', grid: '#27272a',
  text: '#a1a1aa', textLight: '#e4e4e7', emerald: '#10b981',
  amber: '#f59e0b', sky: '#0ea5e9', red: '#ef4444',
  purple: '#a855f7', pink: '#ec4899', orange: '#f97316',
  cyan: '#06b6d4', lime: '#84cc16', indigo: '#6366f1',
  rose: '#f43f5e', teal: '#14b8a6',
}

export const PITCH_COLORS: Record<string, string> = {
  'FF':'#ef4444','4-Seam Fastball':'#ef4444','SI':'#f97316','Sinker':'#f97316',
  'FC':'#f59e0b','Cutter':'#f59e0b','SL':'#0ea5e9','Slider':'#0ea5e9',
  'ST':'#06b6d4','Sweeper':'#06b6d4','SV':'#0891b2','Slurve':'#0891b2',
  'CH':'#10b981','Changeup':'#10b981','FS':'#14b8a6','Splitter':'#14b8a6',
  'CU':'#a855f7','Curveball':'#a855f7','KC':'#8b5cf6','Knuckle Curve':'#8b5cf6',
  'KN':'#ec4899','Knuckleball':'#ec4899','EP':'#6366f1','Eephus':'#6366f1',
  'FA':'#ef4444','Fastball':'#ef4444',
}

export function getPitchColor(p: string): string { return PITCH_COLORS[p] || '#71717a' }

export const BASE_LAYOUT: any = {
  paper_bgcolor: COLORS.paper, plot_bgcolor: COLORS.bg,
  font: { family: 'Inter, system-ui, sans-serif', color: COLORS.text, size: 11 },
  margin: { t: 40, r: 20, b: 45, l: 50 },
  xaxis: { gridcolor: COLORS.grid, zerolinecolor: COLORS.grid, tickfont: { size: 10 } },
  yaxis: { gridcolor: COLORS.grid, zerolinecolor: COLORS.grid, tickfont: { size: 10 } },
  legend: { font: { size: 10, color: COLORS.textLight }, bgcolor: 'rgba(0,0,0,0)' },
  hoverlabel: { bgcolor: '#27272a', bordercolor: '#3f3f46', font: { color: '#e4e4e7', size: 11 } },
}
