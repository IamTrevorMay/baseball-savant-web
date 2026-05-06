'use client'

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import type { EmailProduct, EmailTemplate, EmailBlock, BlockType, EmailEditorState } from '@/lib/emailTypes'
import { getBlockDef } from '@/lib/emails/blockRegistry'

// ─── Types ─────────────────────────────────────────────────────────────

interface EmailEditorContextValue {
  // State
  product: EmailProduct | null
  template: EmailTemplate | null
  blocks: EmailBlock[]
  selectedBlockId: string | null
  isDirty: boolean
  previewMode: 'edit' | 'preview'
  deviceMode: 'desktop' | 'mobile'
  undoStack: EmailBlock[][]
  redoStack: EmailBlock[][]
  loading: boolean
  saving: boolean

  // Block operations
  addBlock: (type: BlockType, afterId?: string) => void
  removeBlock: (id: string) => void
  moveBlock: (id: string, newIndex: number) => void
  updateBlock: (id: string, config: Record<string, unknown>) => void
  duplicateBlock: (id: string) => void
  selectBlock: (id: string | null) => void

  // Undo / redo
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean

  // Save
  save: () => Promise<void>

  // Mode toggles
  setPreviewMode: (mode: 'edit' | 'preview') => void
  setDeviceMode: (mode: 'desktop' | 'mobile') => void
}

const EmailEditorCtx = createContext<EmailEditorContextValue | null>(null)

// ─── Hook ──────────────────────────────────────────────────────────────

export function useEmailEditor() {
  const ctx = useContext(EmailEditorCtx)
  if (!ctx) throw new Error('useEmailEditor must be used within EmailEditorProvider')
  return ctx
}

// ─── Helpers ───────────────────────────────────────────────────────────

function createBlock(type: BlockType): EmailBlock {
  const def = getBlockDef(type)
  return {
    id: crypto.randomUUID(),
    type,
    config: { ...def.defaultConfig },
    binding: def.defaultBinding ? { ...def.defaultBinding } : undefined,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    visible: true,
  }
}

const MAX_UNDO_STACK = 50

// ─── Provider ──────────────────────────────────────────────────────────

export function EmailEditorProvider({
  productId,
  children,
}: {
  productId: string
  children: ReactNode
}) {
  // Core state
  const [product, setProduct] = useState<EmailProduct | null>(null)
  const [template, setTemplate] = useState<EmailTemplate | null>(null)
  const [blocks, setBlocks] = useState<EmailBlock[]>([])
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview'>('edit')
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'mobile'>('desktop')
  const [undoStack, setUndoStack] = useState<EmailBlock[][]>([])
  const [redoStack, setRedoStack] = useState<EmailBlock[][]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // ── Load product + active template on mount ────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const [prodRes, tmplRes] = await Promise.all([
          fetch(`/api/emails/products/${productId}`),
          fetch(`/api/emails/templates?product_id=${productId}&active=true`),
        ])

        const prodData = await prodRes.json()
        if (prodData.product) {
          setProduct(prodData.product)
        }

        const tmplData = await tmplRes.json()
        const activeTemplate: EmailTemplate | undefined =
          tmplData.template ?? tmplData.templates?.[0]

        if (activeTemplate) {
          setTemplate(activeTemplate)
          setBlocks(activeTemplate.blocks ?? [])
        }
      } catch (err) {
        console.error('Failed to load email editor data:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [productId])

  // ── Undo helper — snapshot current blocks before a mutation ────────

  const pushUndo = useCallback((currentBlocks: EmailBlock[]) => {
    setUndoStack(prev => {
      const next = [...prev, currentBlocks]
      if (next.length > MAX_UNDO_STACK) next.shift()
      return next
    })
    // Any new mutation clears the redo stack
    setRedoStack([])
  }, [])

  // ── Block operations ───────────────────────────────────────────────

  const addBlock = useCallback((type: BlockType, afterId?: string) => {
    setBlocks(prev => {
      pushUndo(prev)
      const newBlock = createBlock(type)

      if (afterId) {
        const idx = prev.findIndex(b => b.id === afterId)
        if (idx !== -1) {
          const next = [...prev]
          next.splice(idx + 1, 0, newBlock)
          return next
        }
      }

      // No afterId or not found — append to end
      return [...prev, newBlock]
    })
    setIsDirty(true)
  }, [pushUndo])

  const removeBlock = useCallback((id: string) => {
    setBlocks(prev => {
      pushUndo(prev)
      return prev.filter(b => b.id !== id)
    })
    setSelectedBlockId(prev => (prev === id ? null : prev))
    setIsDirty(true)
  }, [pushUndo])

  const moveBlock = useCallback((id: string, newIndex: number) => {
    setBlocks(prev => {
      const oldIndex = prev.findIndex(b => b.id === id)
      if (oldIndex === -1) return prev
      if (oldIndex === newIndex) return prev

      pushUndo(prev)

      const next = [...prev]
      const [moved] = next.splice(oldIndex, 1)
      next.splice(newIndex, 0, moved)
      return next
    })
    setIsDirty(true)
  }, [pushUndo])

  const updateBlock = useCallback((id: string, config: Record<string, unknown>) => {
    setBlocks(prev => {
      pushUndo(prev)
      return prev.map(b =>
        b.id === id ? { ...b, config: { ...b.config, ...config } } : b
      )
    })
    setIsDirty(true)
  }, [pushUndo])

  const duplicateBlock = useCallback((id: string) => {
    setBlocks(prev => {
      const sourceIndex = prev.findIndex(b => b.id === id)
      if (sourceIndex === -1) return prev

      pushUndo(prev)

      const source = prev[sourceIndex]
      const clone: EmailBlock = {
        ...source,
        id: crypto.randomUUID(),
        config: { ...source.config },
        binding: source.binding ? { ...source.binding } : undefined,
        padding: source.padding ? { ...source.padding } : undefined,
        children: source.children
          ? source.children.map((child: EmailBlock) => ({
              ...child,
              id: crypto.randomUUID(),
              config: { ...child.config },
              binding: child.binding ? { ...child.binding } : undefined,
              padding: child.padding ? { ...child.padding } : undefined,
            }))
          : undefined,
      }

      const next = [...prev]
      next.splice(sourceIndex + 1, 0, clone)
      return next
    })
    setIsDirty(true)
  }, [pushUndo])

  const selectBlock = useCallback((id: string | null) => {
    setSelectedBlockId(id)
  }, [])

  // ── Undo / Redo ────────────────────────────────────────────────────

  const undo = useCallback(() => {
    setUndoStack(prevUndo => {
      if (prevUndo.length === 0) return prevUndo

      const newUndo = [...prevUndo]
      const snapshot = newUndo.pop()!

      // Push current blocks onto redo before restoring
      setBlocks(currentBlocks => {
        setRedoStack(prevRedo => [...prevRedo, currentBlocks])
        return snapshot
      })

      setIsDirty(true)
      return newUndo
    })
  }, [])

  const redo = useCallback(() => {
    setRedoStack(prevRedo => {
      if (prevRedo.length === 0) return prevRedo

      const newRedo = [...prevRedo]
      const snapshot = newRedo.pop()!

      // Push current blocks onto undo before restoring
      setBlocks(currentBlocks => {
        setUndoStack(prevUndo => [...prevUndo, currentBlocks])
        return snapshot
      })

      setIsDirty(true)
      return newRedo
    })
  }, [])

  const canUndo = undoStack.length > 0
  const canRedo = redoStack.length > 0

  // ── Save ───────────────────────────────────────────────────────────

  const save = useCallback(async () => {
    if (!template) return

    setSaving(true)
    try {
      const res = await fetch(`/api/emails/templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocks,
          settings: template.settings,
          subject_template: template.subject_template,
          preheader_template: template.preheader_template,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Save failed (${res.status})`)
      }

      const data = await res.json()
      if (data.template) {
        setTemplate(data.template)
      }

      setIsDirty(false)
    } catch (err) {
      console.error('Failed to save template:', err)
      throw err
    } finally {
      setSaving(false)
    }
  }, [template, blocks])

  // ── Keyboard shortcuts ─────────────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement)?.isContentEditable) return

      const isCmd = e.metaKey || e.ctrlKey

      // Cmd+Z → undo, Cmd+Shift+Z → redo
      if (isCmd && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if (isCmd && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
        return
      }

      // Cmd+S → save
      if (isCmd && e.key === 's') {
        e.preventDefault()
        save().catch(() => {})
        return
      }

      // Delete / Backspace → remove selected block
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBlockId) {
        e.preventDefault()
        removeBlock(selectedBlockId)
        return
      }

      // Escape → deselect
      if (e.key === 'Escape') {
        setSelectedBlockId(null)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, save, selectedBlockId, removeBlock])

  // ── Context value ──────────────────────────────────────────────────

  return (
    <EmailEditorCtx.Provider
      value={{
        product,
        template,
        blocks,
        selectedBlockId,
        isDirty,
        previewMode,
        deviceMode,
        undoStack,
        redoStack,
        loading,
        saving,

        addBlock,
        removeBlock,
        moveBlock,
        updateBlock,
        duplicateBlock,
        selectBlock,

        undo,
        redo,
        canUndo,
        canRedo,

        save,

        setPreviewMode,
        setDeviceMode,
      }}
    >
      {children}
    </EmailEditorCtx.Provider>
  )
}
