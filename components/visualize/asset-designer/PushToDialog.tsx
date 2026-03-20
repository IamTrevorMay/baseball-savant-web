'use client'

import { useState } from 'react'
import { Scene } from '@/lib/sceneTypes'
import { exportScenePNG } from '@/components/visualize/scene-composer/exportScene'

interface Props {
  scene: Scene
  onClose: () => void
}

type Target = 'scene-composer' | 'template-builder'
type TransferMode = 'elements' | 'image'

export default function PushToDialog({ scene, onClose }: Props) {
  const [target, setTarget] = useState<Target>('scene-composer')
  const [mode, setMode] = useState<TransferMode>('elements')
  const [pushing, setPushing] = useState(false)

  async function handlePush() {
    setPushing(true)
    try {
      if (mode === 'elements') {
        // Push individual elements
        localStorage.setItem('triton-push-design', JSON.stringify({
          mode: 'elements',
          elements: scene.elements,
          width: scene.width,
          height: scene.height,
        }))
      } else {
        // Flatten to single image — export PNG to data URL
        const canvas = document.createElement('canvas')
        canvas.width = scene.width
        canvas.height = scene.height
        const ctx = canvas.getContext('2d')!

        if (scene.background && scene.background !== 'transparent') {
          ctx.fillStyle = scene.background
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }

        // We'll use a simpler approach: render the existing scene canvas to an image
        // by grabbing the rendered canvas element
        const sceneCanvasEl = document.querySelector('[data-scene-canvas]') as HTMLElement
        if (sceneCanvasEl) {
          const { default: html2canvas } = await import('html2canvas').catch(() => ({ default: null }))
          if (html2canvas) {
            const rendered = await html2canvas(sceneCanvasEl, { backgroundColor: null, scale: 1 })
            const dataUrl = rendered.toDataURL('image/png')
            localStorage.setItem('triton-push-design', JSON.stringify({
              mode: 'image',
              src: dataUrl,
              width: scene.width,
              height: scene.height,
            }))
          } else {
            // Fallback: push as elements
            localStorage.setItem('triton-push-design', JSON.stringify({
              mode: 'elements',
              elements: scene.elements,
              width: scene.width,
              height: scene.height,
            }))
          }
        } else {
          localStorage.setItem('triton-push-design', JSON.stringify({
            mode: 'elements',
            elements: scene.elements,
            width: scene.width,
            height: scene.height,
          }))
        }
      }

      // Navigate to target
      const path = target === 'scene-composer' ? '/design/scene-composer' : '/design/template-builder'
      window.location.href = path
    } catch (err) {
      console.error('Push failed:', err)
      setPushing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[400px] p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-white mb-4">Push Design To...</h3>

        {/* Target selection */}
        <div className="space-y-2 mb-4">
          <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
            target === 'scene-composer' ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-700 hover:border-zinc-600'
          }`}>
            <input
              type="radio"
              name="target"
              checked={target === 'scene-composer'}
              onChange={() => setTarget('scene-composer')}
              className="accent-emerald-500"
            />
            <div>
              <div className="text-[12px] font-medium text-zinc-200">Scene Composer</div>
              <div className="text-[10px] text-zinc-500">Add to a multi-element scene</div>
            </div>
          </label>
          <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
            target === 'template-builder' ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-700 hover:border-zinc-600'
          }`}>
            <input
              type="radio"
              name="target"
              checked={target === 'template-builder'}
              onChange={() => setTarget('template-builder')}
              className="accent-emerald-500"
            />
            <div>
              <div className="text-[12px] font-medium text-zinc-200">Template Builder</div>
              <div className="text-[10px] text-zinc-500">Use as a template element</div>
            </div>
          </label>
        </div>

        {/* Transfer mode */}
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-2">Transfer As</div>
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setMode('elements')}
            className={`flex-1 px-3 py-2 rounded-lg text-[11px] transition border ${
              mode === 'elements' ? 'border-violet-500/50 bg-violet-500/10 text-violet-300' : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            <div className="font-medium">Separate Elements</div>
            <div className="text-[9px] mt-0.5 opacity-70">Each element individually editable</div>
          </button>
          <button
            onClick={() => setMode('image')}
            className={`flex-1 px-3 py-2 rounded-lg text-[11px] transition border ${
              mode === 'image' ? 'border-violet-500/50 bg-violet-500/10 text-violet-300' : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            <div className="font-medium">Single Image</div>
            <div className="text-[9px] mt-0.5 opacity-70">Flattened to one PNG</div>
          </button>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-200 transition">
            Cancel
          </button>
          <button
            onClick={handlePush}
            disabled={pushing}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[11px] font-medium text-white transition disabled:opacity-50"
          >
            {pushing ? 'Pushing...' : 'Push'}
          </button>
        </div>
      </div>
    </div>
  )
}
