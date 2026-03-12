'use client'

import { useState, useCallback, useRef } from 'react'
import { SceneElement } from '@/lib/sceneTypes'

interface Props {
  onImport: (elements: SceneElement[]) => void
  onClose: () => void
  sceneWidth: number
  sceneHeight: number
}

let zCounter = 500

function parseSvgToElements(svgText: string, sceneWidth: number, sceneHeight: number): SceneElement[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')
  const svg = doc.querySelector('svg')
  if (!svg) return []

  const elements: SceneElement[] = []

  // Get viewBox for coordinate mapping
  const vb = svg.getAttribute('viewBox')?.split(/\s+/).map(Number) || [0, 0, 0, 0]
  const svgW = parseFloat(svg.getAttribute('width') || '') || vb[2] || sceneWidth
  const svgH = parseFloat(svg.getAttribute('height') || '') || vb[3] || sceneHeight

  // Scale factor to fit in scene
  const scale = Math.min(sceneWidth / svgW, sceneHeight / svgH, 1)
  const offsetX = (sceneWidth - svgW * scale) / 2
  const offsetY = (sceneHeight - svgH * scale) / 2

  function walkNode(node: Element) {
    const tag = node.tagName.toLowerCase()
    const fill = node.getAttribute('fill') || ''
    const stroke = node.getAttribute('stroke') || ''
    const strokeWidth = parseFloat(node.getAttribute('stroke-width') || '0')

    if (tag === 'rect') {
      const x = (parseFloat(node.getAttribute('x') || '0')) * scale + offsetX
      const y = (parseFloat(node.getAttribute('y') || '0')) * scale + offsetY
      const w = (parseFloat(node.getAttribute('width') || '100')) * scale
      const h = (parseFloat(node.getAttribute('height') || '100')) * scale
      const rx = parseFloat(node.getAttribute('rx') || '0') * scale
      elements.push({
        id: Math.random().toString(36).slice(2, 10),
        type: 'shape', x: Math.round(x), y: Math.round(y),
        width: Math.round(w), height: Math.round(h),
        rotation: 0, opacity: 1, zIndex: ++zCounter, locked: false,
        props: {
          shape: 'rect', fill: fill || '#18181b', stroke: stroke || 'transparent',
          strokeWidth, borderRadius: Math.round(rx),
          bgColor: '', bgOpacity: 1, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, shadowColor: '#000000',
          borderWidth: 0, borderColor: '#06b6d4', blurAmount: 0, blendMode: 'normal', gradient: '',
        },
      })
    } else if (tag === 'circle' || tag === 'ellipse') {
      const cx = parseFloat(node.getAttribute('cx') || '0')
      const cy = parseFloat(node.getAttribute('cy') || '0')
      let rx: number, ry: number
      if (tag === 'circle') {
        rx = ry = parseFloat(node.getAttribute('r') || '50')
      } else {
        rx = parseFloat(node.getAttribute('rx') || '50')
        ry = parseFloat(node.getAttribute('ry') || '50')
      }
      const x = (cx - rx) * scale + offsetX
      const y = (cy - ry) * scale + offsetY
      const w = rx * 2 * scale
      const h = ry * 2 * scale
      elements.push({
        id: Math.random().toString(36).slice(2, 10),
        type: 'shape', x: Math.round(x), y: Math.round(y),
        width: Math.round(w), height: Math.round(h),
        rotation: 0, opacity: 1, zIndex: ++zCounter, locked: false,
        props: {
          shape: 'circle', fill: fill || '#18181b', stroke: stroke || 'transparent',
          strokeWidth, borderRadius: 0,
          bgColor: '', bgOpacity: 1, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, shadowColor: '#000000',
          borderWidth: 0, borderColor: '#06b6d4', blurAmount: 0, blendMode: 'normal', gradient: '',
        },
      })
    } else if (tag === 'path') {
      const d = node.getAttribute('d') || ''
      if (!d) return
      // Estimate bounding box from path commands — use viewBox dimensions as fallback
      elements.push({
        id: Math.random().toString(36).slice(2, 10),
        type: 'path',
        x: Math.round(offsetX), y: Math.round(offsetY),
        width: Math.round(svgW * scale), height: Math.round(svgH * scale),
        rotation: 0, opacity: 1, zIndex: ++zCounter, locked: false,
        props: {
          pathData: d, fill: fill || 'transparent',
          stroke: stroke || '#06b6d4', strokeWidth: strokeWidth || 2, closed: d.includes('Z') || d.includes('z'),
          bgColor: '', bgOpacity: 1, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, shadowColor: '#000000',
          borderWidth: 0, borderColor: '#06b6d4', borderRadius: 0, blurAmount: 0, blendMode: 'normal',
        },
      })
    } else if (tag === 'text') {
      const text = node.textContent || ''
      const x = (parseFloat(node.getAttribute('x') || '0')) * scale + offsetX
      const y = (parseFloat(node.getAttribute('y') || '0')) * scale + offsetY
      const fontSize = parseFloat(node.getAttribute('font-size') || '16') * scale
      elements.push({
        id: Math.random().toString(36).slice(2, 10),
        type: 'text', x: Math.round(x), y: Math.round(y - fontSize),
        width: Math.round(text.length * fontSize * 0.6), height: Math.round(fontSize * 1.4),
        rotation: 0, opacity: 1, zIndex: ++zCounter, locked: false,
        props: {
          text, fontSize: Math.round(fontSize), fontWeight: 400, color: fill || '#ffffff',
          textAlign: 'left',
          bgColor: '', bgOpacity: 1, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, shadowColor: '#000000',
          borderWidth: 0, borderColor: '#06b6d4', borderRadius: 0, blurAmount: 0, blendMode: 'normal',
          fontFamily: '', textTransform: 'none', textShadowBlur: 0, textShadowColor: '#06b6d4',
          textShadowOffsetX: 0, textShadowOffsetY: 0, letterSpacing: 0, lineHeight: 1.2,
        },
      })
    } else if (tag === 'image') {
      const href = node.getAttribute('href') || node.getAttribute('xlink:href') || ''
      const x = (parseFloat(node.getAttribute('x') || '0')) * scale + offsetX
      const y = (parseFloat(node.getAttribute('y') || '0')) * scale + offsetY
      const w = (parseFloat(node.getAttribute('width') || '200')) * scale
      const h = (parseFloat(node.getAttribute('height') || '200')) * scale
      elements.push({
        id: Math.random().toString(36).slice(2, 10),
        type: 'image', x: Math.round(x), y: Math.round(y),
        width: Math.round(w), height: Math.round(h),
        rotation: 0, opacity: 1, zIndex: ++zCounter, locked: false,
        props: {
          src: href, objectFit: 'cover',
          bgColor: '', bgOpacity: 1, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, shadowColor: '#000000',
          borderWidth: 0, borderColor: '#06b6d4', borderRadius: 0, blurAmount: 0, blendMode: 'normal',
        },
      })
    }

    // Recurse into children
    if (tag === 'g' || tag === 'svg' || tag === 'defs') {
      for (const child of Array.from(node.children)) {
        if (child.tagName.toLowerCase() !== 'defs') walkNode(child)
      }
    }
  }

  for (const child of Array.from(svg.children)) {
    walkNode(child)
  }

  // If no elements parsed, create single image element with SVG as data URL
  if (elements.length === 0) {
    const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgText)))}`
    elements.push({
      id: Math.random().toString(36).slice(2, 10),
      type: 'image',
      x: Math.round(offsetX), y: Math.round(offsetY),
      width: Math.round(svgW * scale), height: Math.round(svgH * scale),
      rotation: 0, opacity: 1, zIndex: ++zCounter, locked: false,
      props: {
        src: dataUrl, objectFit: 'contain',
        bgColor: '', bgOpacity: 1, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, shadowColor: '#000000',
        borderWidth: 0, borderColor: '#06b6d4', borderRadius: 0, blurAmount: 0, blendMode: 'normal',
      },
    })
  }

  return elements
}

export default function SVGImportDialog({ onImport, onClose, sceneWidth, sceneHeight }: Props) {
  const [svgText, setSvgText] = useState('')
  const [parsed, setParsed] = useState<SceneElement[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      setSvgText(text)
      setParsed(parseSvgToElements(text, sceneWidth, sceneHeight))
    }
    reader.readAsText(file)
  }, [sceneWidth, sceneHeight])

  const handlePaste = useCallback((text: string) => {
    setSvgText(text)
    if (text.trim().startsWith('<')) {
      setParsed(parseSvgToElements(text, sceneWidth, sceneHeight))
    }
  }, [sceneWidth, sceneHeight])

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[500px] max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="text-sm font-medium text-zinc-200">Import SVG</div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-sm">{'\u2715'}</button>
        </div>

        <div className="p-4 space-y-3">
          {/* File upload */}
          <div>
            <input ref={fileRef} type="file" accept=".svg" onChange={handleFile} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 border-dashed text-[11px] text-zinc-300 hover:text-violet-400 hover:border-violet-600/40 transition"
            >
              Choose .svg file or drop here
            </button>
          </div>

          {/* Or paste */}
          <div>
            <textarea
              placeholder="Or paste SVG code here..."
              value={svgText}
              onChange={e => handlePaste(e.target.value)}
              className="w-full h-24 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-[11px] text-zinc-300 font-mono resize-none focus:border-violet-600 outline-none"
            />
          </div>

          {/* Preview */}
          {parsed.length > 0 && (
            <div className="text-[11px] text-zinc-400">
              Parsed {parsed.length} element{parsed.length !== 1 ? 's' : ''}: {parsed.map(e => e.type).join(', ')}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-400 hover:text-white transition">
              Cancel
            </button>
            <button
              onClick={() => onImport(parsed)}
              disabled={parsed.length === 0}
              className="px-4 py-1.5 rounded bg-violet-600/20 border border-violet-600/40 text-[11px] font-medium text-violet-300 hover:bg-violet-600/30 transition disabled:opacity-40"
            >
              Import {parsed.length > 0 ? `(${parsed.length})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
