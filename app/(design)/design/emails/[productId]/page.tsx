'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useCallback } from 'react'
import { ArrowLeft, Eye, Pencil, Monitor, Smartphone, Save, Send, Settings } from 'lucide-react'
import { EmailEditorProvider, useEmailEditor } from '@/components/emails/EmailEditorContext'
import BlockPalette from '@/components/emails/BlockPalette'
import EmailCanvas from '@/components/emails/EmailCanvas'
import BlockProperties from '@/components/emails/BlockProperties'
import EmailPreviewFrame from '@/components/emails/EmailPreviewFrame'
import SendDialog from '@/components/emails/SendDialog'

function EditorToolbar() {
  const {
    product, template, previewMode, setPreviewMode, deviceMode, setDeviceMode,
    save, saving, isDirty,
  } = useEmailEditor()
  const router = useRouter()
  const [sendOpen, setSendOpen] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)

  const handlePreviewToggle = useCallback(async () => {
    if (previewMode === 'edit') {
      // Fetch rendered preview
      if (template) {
        try {
          const res = await fetch('/api/emails/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template_id: template.id }),
          })
          if (res.ok) {
            const json = await res.json()
            setPreviewHtml(json.html)
          }
        } catch { /* ignore */ }
      }
      setPreviewMode('preview')
    } else {
      setPreviewMode('edit')
      setPreviewHtml(null)
    }
  }, [previewMode, setPreviewMode, template])

  return (
    <>
      <div className="flex items-center justify-between h-12 px-4 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/design/emails')}
            className="p-1.5 text-zinc-500 hover:text-zinc-200 transition rounded"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-200">{product?.name || 'Loading...'}</span>
            {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Edit/Preview toggle */}
          <button
            onClick={handlePreviewToggle}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition ${
              previewMode === 'edit'
                ? 'text-zinc-400 hover:text-zinc-200'
                : 'text-emerald-400 bg-emerald-500/10'
            }`}
          >
            {previewMode === 'edit' ? <Eye className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            {previewMode === 'edit' ? 'Preview' : 'Edit'}
          </button>

          {/* Device toggle */}
          <div className="flex items-center bg-zinc-800 rounded p-0.5 ml-1">
            <button
              onClick={() => setDeviceMode('desktop')}
              className={`p-1.5 rounded transition ${deviceMode === 'desktop' ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDeviceMode('mobile')}
              className={`p-1.5 rounded transition ${deviceMode === 'mobile' ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="w-px h-5 bg-zinc-800 mx-1" />

          {/* Settings */}
          <button
            onClick={() => router.push(`/design/emails/${product?.id}/settings`)}
            className="p-1.5 text-zinc-500 hover:text-zinc-200 transition rounded"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Save */}
          <button
            onClick={save}
            disabled={saving || !isDirty}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-200 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700 transition disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save'}
          </button>

          {/* Send */}
          <button
            onClick={() => setSendOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-900 bg-emerald-400 rounded hover:bg-emerald-300 transition"
          >
            <Send className="w-3.5 h-3.5" />
            Send
          </button>
        </div>
      </div>

      {sendOpen && product && template && (
        <SendDialog
          open={sendOpen}
          onClose={() => setSendOpen(false)}
          productId={product.id}
          templateId={template.id}
        />
      )}

      {/* Full-page preview overlay */}
      {previewMode === 'preview' && previewHtml && (
        <div className="absolute inset-0 top-12 z-10 bg-zinc-950 overflow-auto">
          <EmailPreviewFrame html={previewHtml} deviceMode={deviceMode} />
        </div>
      )}
    </>
  )
}

function EditorLayout() {
  const { loading, previewMode } = useEmailEditor()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      <EditorToolbar />
      {previewMode === 'edit' && (
        <div className="flex flex-1 overflow-hidden">
          <BlockPalette />
          <EmailCanvas />
          <BlockProperties />
        </div>
      )}
    </div>
  )
}

export default function EmailEditorPage() {
  const { productId } = useParams<{ productId: string }>()

  return (
    <EmailEditorProvider productId={productId}>
      <EditorLayout />
    </EmailEditorProvider>
  )
}
