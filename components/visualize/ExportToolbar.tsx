'use client'
import { RefObject, useState } from 'react'
import { QualityPreset } from '@/lib/qualityPresets'

// ---------------------------------------------------------------------------
// Export utilities — thin wrappers around lib/exportUtils when it exists.
// The actual implementations live in lib/exportUtils.ts; we call them here.
// ---------------------------------------------------------------------------

async function exportPng(container: HTMLDivElement, quality: QualityPreset): Promise<void> {
  const { exportToPng } = await import('@/lib/exportUtils')
  await exportToPng(container, quality)
}

async function exportSvg(container: HTMLDivElement, quality: QualityPreset): Promise<void> {
  const { exportToSvg } = await import('@/lib/exportUtils')
  await exportToSvg(container, quality)
}

async function exportWebm(
  container: HTMLDivElement,
  quality: QualityPreset,
  onProgress: (state: 'recording' | 'done' | 'idle') => void,
): Promise<void> {
  const { exportToWebm } = await import('@/lib/exportUtils')
  onProgress('recording')
  try {
    await exportToWebm(container, quality)
    onProgress('done')
  } finally {
    setTimeout(() => onProgress('idle'), 2000)
  }
}

// ---------------------------------------------------------------------------

type VideoState = 'idle' | 'recording' | 'done'

interface Props {
  containerRef: RefObject<HTMLDivElement>
  isCanvas: boolean
  isAnimated: boolean
  quality: QualityPreset
}

interface ExportButtonProps {
  label: string
  title?: string
  onClick: () => void
  disabled?: boolean
  variant?: 'default' | 'recording' | 'done'
}

function ExportButton({ label, title, onClick, disabled, variant = 'default' }: ExportButtonProps) {
  const base = 'px-2.5 py-1 rounded text-[11px] font-medium border transition flex items-center gap-1.5 select-none'
  const styles: Record<string, string> = {
    default: 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:border-cyan-600/60 hover:text-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed',
    recording: 'bg-red-900/40 border-red-600/60 text-red-300 cursor-default animate-pulse',
    done: 'bg-cyan-900/30 border-cyan-600/50 text-cyan-300',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${styles[variant]}`}
    >
      {label}
    </button>
  )
}

export default function ExportToolbar({ containerRef, isCanvas, isAnimated, quality }: Props) {
  const [videoState, setVideoState] = useState<VideoState>('idle')
  const [exportingPng, setExportingPng] = useState(false)
  const [exportingSvg, setExportingSvg] = useState(false)

  async function handlePng() {
    if (!containerRef.current || exportingPng) return
    setExportingPng(true)
    try {
      await exportPng(containerRef.current, quality)
    } catch (err) {
      console.error('PNG export failed:', err)
    } finally {
      setExportingPng(false)
    }
  }

  async function handleSvg() {
    if (!containerRef.current || exportingSvg) return
    setExportingSvg(true)
    try {
      await exportSvg(containerRef.current, quality)
    } catch (err) {
      console.error('SVG export failed:', err)
    } finally {
      setExportingSvg(false)
    }
  }

  async function handleWebm() {
    if (!containerRef.current || videoState === 'recording') return
    try {
      await exportWebm(containerRef.current, quality, s => setVideoState(s as VideoState))
    } catch (err) {
      console.error('WebM export failed:', err)
      setVideoState('idle')
    }
  }

  const webmLabel =
    videoState === 'recording' ? 'Recording...' :
    videoState === 'done'      ? 'Saved' :
    'WebM'

  const webmVariant =
    videoState === 'recording' ? 'recording' :
    videoState === 'done'      ? 'done' :
    'default'

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium mr-0.5 select-none">
        Export
      </span>

      <ExportButton
        label={exportingPng ? 'Saving...' : 'PNG'}
        title="Export as PNG image"
        onClick={handlePng}
        disabled={exportingPng}
      />

      {!isCanvas && (
        <ExportButton
          label={exportingSvg ? 'Saving...' : 'SVG'}
          title="Export as SVG vector"
          onClick={handleSvg}
          disabled={exportingSvg}
        />
      )}

      {isAnimated && (
        <ExportButton
          label={webmLabel}
          title="Export as WebM video"
          onClick={handleWebm}
          disabled={videoState === 'recording'}
          variant={webmVariant}
        />
      )}
    </div>
  )
}
