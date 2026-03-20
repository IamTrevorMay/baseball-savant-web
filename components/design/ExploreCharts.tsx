'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell,
} from 'recharts'

// ── Design tokens ──────────────────────────────────────────────────────────
const COLORS = {
  bg: '#0a0a0a',
  surface: '#111111',
  border: 'rgba(255,255,255,0.06)',
  grid: 'rgba(255,255,255,0.04)',
  axis: '#666666',
  primary: '#e63946',
  secondary: '#457b9d',
  tertiary: '#2a9d8f',
  neutral: '#444444',
  textPrimary: '#f0f0f0',
  textSecondary: '#888888',
  textMuted: '#555555',
  tooltipBg: '#1a1a1a',
  tooltipBorder: 'rgba(255,255,255,0.12)',
  barDefault: '#2a2a2a',
}

const SERIES_COLORS = [COLORS.primary, COLORS.secondary, COLORS.tertiary, '#f4a261', '#a855f7', '#06b6d4']

// ── Custom Tooltip ─────────────────────────────────────────────────────────
function ExploreTooltip({ active, payload, label, accentColor }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: COLORS.tooltipBg, border: `1px solid ${COLORS.tooltipBorder}`,
      borderRadius: 4, padding: 12,
    }}>
      <div style={{ color: COLORS.textPrimary, fontSize: 13 }}>{label}</div>
      {payload.map((entry: any, i: number) => (
        <div key={i} style={{ color: entry.color || accentColor || COLORS.primary, fontSize: 15, fontWeight: 500, marginTop: 4 }}>
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : entry.value}
        </div>
      ))}
    </div>
  )
}

// ── Line Chart ─────────────────────────────────────────────────────────────
export function ExploreLineChart({ data, x, y, groupBy, title, description }: {
  data: any[]; x: string; y: string; groupBy?: string; title?: string; description?: string
}) {
  const series = groupBy
    ? [...new Set(data.map(d => d[groupBy]))].filter(Boolean)
    : [y]

  // If grouped, pivot data by x value
  let chartData = data
  if (groupBy) {
    const byX: Record<string, any> = {}
    for (const d of data) {
      const key = d[x]
      if (!byX[key]) byX[key] = { [x]: key }
      byX[key][d[groupBy]] = d[y]
    }
    chartData = Object.values(byX)
  }

  return (
    <ChartWrapper title={title} description={description}>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData}>
          <CartesianGrid stroke={COLORS.grid} horizontal vertical={false} />
          <XAxis dataKey={x} tick={{ fill: COLORS.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: COLORS.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<ExploreTooltip />} />
          {(groupBy ? series : [y]).map((s, i) => (
            <Line
              key={String(s)}
              type="monotone"
              dataKey={String(s)}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: SERIES_COLORS[i % SERIES_COLORS.length], stroke: 'none' }}
              animationDuration={600}
              animationEasing="ease-out"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}

// ── Bar Chart ──────────────────────────────────────────────────────────────
export function ExploreBarChart({ data, x, y, title, description }: {
  data: any[]; x: string; y: string; title?: string; description?: string
}) {
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <ChartWrapper title={title} description={description}>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data}>
          <CartesianGrid stroke={COLORS.grid} horizontal vertical={false} />
          <XAxis dataKey={x} tick={{ fill: COLORS.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: COLORS.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<ExploreTooltip accentColor={COLORS.primary} />} />
          <Bar
            dataKey={y}
            radius={[3, 3, 0, 0] as any}
            animationDuration={600}
            animationEasing="ease-out"
            onMouseLeave={() => setHovered(null)}
          >
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={hovered === i ? COLORS.primary : COLORS.barDefault}
                onMouseEnter={() => setHovered(i)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}

// ── Scatter Plot ───────────────────────────────────────────────────────────
export function ExploreScatterPlot({ data, x, y, groupBy, title, description }: {
  data: any[]; x: string; y: string; groupBy?: string; title?: string; description?: string
}) {
  const groups = groupBy ? [...new Set(data.map(d => d[groupBy]))].filter(Boolean) : [null]

  return (
    <ChartWrapper title={title} description={description}>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart>
          <CartesianGrid stroke={COLORS.grid} />
          <XAxis dataKey={x} name={x} tick={{ fill: COLORS.axis, fontSize: 11 }} axisLine={false} tickLine={false} type="number" />
          <YAxis dataKey={y} name={y} tick={{ fill: COLORS.axis, fontSize: 11 }} axisLine={false} tickLine={false} type="number" />
          <Tooltip content={<ExploreTooltip />} />
          {groups.map((g, i) => {
            const filtered = g != null ? data.filter(d => d[groupBy!] === g) : data
            return (
              <Scatter
                key={String(g ?? 'all')}
                name={String(g ?? y)}
                data={filtered}
                fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                fillOpacity={0.6}
                animationDuration={600}
                animationEasing="ease-out"
              />
            )
          })}
        </ScatterChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}

// ── Heatmap (simple grid using divs — avoids visx complexity) ──────────────
export function ExploreHeatmap({ data, x, y, value, title, description }: {
  data: any[]; x: string; y: string; value: string; title?: string; description?: string
}) {
  const xVals = [...new Set(data.map(d => d[x]))].sort()
  const yVals = [...new Set(data.map(d => d[y]))].sort()
  const lookup = new Map(data.map(d => [`${d[x]}_${d[y]}`, Number(d[value]) || 0]))
  const allVals = [...lookup.values()]
  const min = Math.min(...allVals)
  const max = Math.max(...allVals)

  function cellColor(v: number) {
    if (max === min) return COLORS.secondary
    const t = (v - min) / (max - min)
    if (t < 0.5) {
      const s = t / 0.5
      return lerpColor(COLORS.surface, COLORS.secondary, s)
    }
    return lerpColor(COLORS.secondary, COLORS.primary, (t - 0.5) / 0.5)
  }

  const [tooltip, setTooltip] = useState<{ x: string; y: string; v: number; px: number; py: number } | null>(null)

  return (
    <ChartWrapper title={title} description={description}>
      <div className="relative overflow-auto" style={{ maxHeight: 360 }}>
        <div className="inline-grid gap-px" style={{ gridTemplateColumns: `auto repeat(${xVals.length}, 1fr)` }}>
          <div />
          {xVals.map(xv => (
            <div key={String(xv)} className="text-center px-1 py-1 text-[11px]" style={{ color: COLORS.axis }}>{String(xv)}</div>
          ))}
          {yVals.map(yv => (
            <>
              <div key={`label-${yv}`} className="px-2 py-1 text-[11px] text-right" style={{ color: COLORS.axis }}>{String(yv)}</div>
              {xVals.map(xv => {
                const v = lookup.get(`${xv}_${yv}`) ?? 0
                return (
                  <div
                    key={`${xv}_${yv}`}
                    className="w-8 h-8 rounded-sm cursor-pointer transition-opacity hover:opacity-80"
                    style={{ backgroundColor: cellColor(v), minWidth: 32, minHeight: 32 }}
                    onMouseEnter={e => setTooltip({ x: String(xv), y: String(yv), v, px: e.clientX, py: e.clientY })}
                    onMouseLeave={() => setTooltip(null)}
                  />
                )
              })}
            </>
          ))}
        </div>
        {tooltip && (
          <div
            className="fixed z-50 pointer-events-none"
            style={{
              left: tooltip.px + 12, top: tooltip.py - 40,
              background: COLORS.tooltipBg, border: `1px solid ${COLORS.tooltipBorder}`,
              borderRadius: 4, padding: 8,
            }}
          >
            <div style={{ color: COLORS.textPrimary, fontSize: 13 }}>{tooltip.x}, {tooltip.y}</div>
            <div style={{ color: COLORS.primary, fontSize: 15, fontWeight: 500 }}>{tooltip.v.toFixed(2)}</div>
          </div>
        )}
      </div>
    </ChartWrapper>
  )
}

// ── Data Table ─────────────────────────────────────────────────────────────
export function ExploreDataTable({ data, title }: { data: any[]; title?: string }) {
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  if (!data.length) return null
  const columns = Object.keys(data[0])

  const sorted = sortCol
    ? [...data].sort((a, b) => {
        const av = a[sortCol], bv = b[sortCol]
        const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''))
        return sortDir === 'asc' ? cmp : -cmp
      })
    : data

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  return (
    <ChartWrapper title={title || 'Data'}>
      <div className="overflow-auto max-h-[400px]">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr style={{ background: '#1a1a1a' }}>
              {columns.map(col => (
                <th
                  key={col}
                  onClick={() => toggleSort(col)}
                  className="px-3 py-2 text-left font-medium cursor-pointer select-none whitespace-nowrap"
                  style={{ color: COLORS.textSecondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                >
                  {col.replace(/_/g, ' ')}
                  {sortCol === col && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 500).map((row, i) => (
              <tr
                key={i}
                style={{ background: i % 2 === 0 ? '#0f0f0f' : COLORS.surface }}
                className="hover:!bg-[#1e1e1e] transition"
              >
                {columns.map(col => (
                  <td key={col} className="px-3 py-2 whitespace-nowrap" style={{ color: COLORS.textPrimary }}>
                    {formatCell(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartWrapper>
  )
}

// ── Insight Cards ──────────────────────────────────────────────────────────
export function InsightCard({ title, value, description, sentiment }: {
  title: string; value: string; description: string; sentiment: 'positive' | 'negative' | 'neutral'
}) {
  const borderColor = sentiment === 'positive' ? COLORS.tertiary : sentiment === 'negative' ? COLORS.primary : 'transparent'
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderLeft: `2px solid ${borderColor}`,
      }}
    >
      <div style={{ color: COLORS.axis, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
      <div style={{ color: COLORS.textPrimary, fontSize: 24, fontWeight: 500, marginTop: 4 }}>{value}</div>
      <div style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 4 }}>{description}</div>
    </div>
  )
}

// ── Chart Wrapper ──────────────────────────────────────────────────────────
function ChartWrapper({ title, description, children }: { title?: string; description?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!ctxMenu) return
    const dismiss = () => setCtxMenu(null)
    window.addEventListener('click', dismiss)
    window.addEventListener('keydown', e => { if (e.key === 'Escape') dismiss() })
    return () => { window.removeEventListener('click', dismiss); window.removeEventListener('keydown', dismiss) }
  }, [ctxMenu])

  const handleExportPng = useCallback(async () => {
    if (!ref.current) return
    const { default: html2canvas } = await import('html2canvas-pro')
    const canvas = await html2canvas(ref.current, { backgroundColor: COLORS.bg })
    const link = document.createElement('a')
    link.download = `${(title || 'chart').replace(/\s+/g, '-')}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    setCtxMenu(null)
  }, [title])

  const handleCopyClipboard = useCallback(async () => {
    if (!ref.current) return
    const { default: html2canvas } = await import('html2canvas-pro')
    const canvas = await html2canvas(ref.current, { backgroundColor: COLORS.bg })
    canvas.toBlob(blob => { if (blob) navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]) })
    setCtxMenu(null)
  }, [])

  const handleExportSvg = useCallback(() => {
    if (!ref.current) return
    const svg = ref.current.querySelector('svg')
    if (!svg) return
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svg)
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const link = document.createElement('a')
    link.download = `${(title || 'chart').replace(/\s+/g, '-')}.svg`
    link.href = URL.createObjectURL(blob)
    link.click()
    setCtxMenu(null)
  }, [title])

  return (
    <div
      ref={ref}
      className="rounded-lg p-4 relative"
      style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
      onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }) }}
    >
      {title && <h3 className="text-sm font-medium mb-1" style={{ color: COLORS.textPrimary }}>{title}</h3>}
      {description && <p className="text-xs mb-3" style={{ color: COLORS.textMuted }}>{description}</p>}
      {children}
      {ctxMenu && (
        <div
          className="fixed z-50 rounded-lg py-1 min-w-[160px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y, background: COLORS.tooltipBg, border: `1px solid rgba(255,255,255,0.1)` }}
        >
          {[
            { label: 'Export PNG', fn: handleExportPng },
            { label: 'Export SVG', fn: handleExportSvg },
            { label: 'Copy to clipboard', fn: handleCopyClipboard },
          ].map(item => (
            <button
              key={item.label}
              onClick={item.fn}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition"
              style={{ color: COLORS.textPrimary }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatCell(v: any): string {
  if (v == null) return '—'
  if (typeof v === 'number') return v % 1 === 0 ? v.toLocaleString() : v.toFixed(2)
  return String(v)
}

function lerpColor(a: string, b: string, t: number): string {
  const pa = parseHex(a), pb = parseHex(b)
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t)
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t)
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t)
  return `rgb(${r},${g},${bl})`
}

function parseHex(hex: string): [number, number, number] {
  hex = hex.replace('#', '')
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
}
