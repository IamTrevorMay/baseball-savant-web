/**
 * useSceneHistory — Undo/redo state management for the Scene Composer.
 *
 * Wraps useState with a history stack. Debounces pushes to avoid storing
 * every intermediate state during rapid changes (e.g., dragging).
 */

import { useState, useRef, useCallback } from 'react'

const MAX_HISTORY = 60
const DEBOUNCE_MS = 400

interface HistoryControls {
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

export function useSceneHistory<T>(initial: T): [T, (next: T | ((prev: T) => T)) => void, HistoryControls] {
  const [state, _setState] = useState(initial)
  const historyRef = useRef<T[]>([initial])
  const indexRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [, forceRender] = useState(0)

  const pushToHistory = useCallback((value: T) => {
    // Trim future states
    historyRef.current = historyRef.current.slice(0, indexRef.current + 1)
    historyRef.current.push(value)
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift()
    } else {
      indexRef.current++
    }
  }, [])

  const setState = useCallback((next: T | ((prev: T) => T)) => {
    _setState(prev => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next

      // Debounce: schedule a history push after rapid changes settle
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        pushToHistory(resolved)
        forceRender(n => n + 1)
      }, DEBOUNCE_MS)

      return resolved
    })
  }, [pushToHistory])

  const undo = useCallback(() => {
    // Flush any pending debounced push first
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (indexRef.current > 0) {
      // If current state differs from last history entry, save it first
      indexRef.current = Math.max(0, indexRef.current - 1)
      const prev = historyRef.current[indexRef.current]
      _setState(prev)
      forceRender(n => n + 1)
    }
  }, [])

  const redo = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (indexRef.current < historyRef.current.length - 1) {
      indexRef.current++
      const next = historyRef.current[indexRef.current]
      _setState(next)
      forceRender(n => n + 1)
    }
  }, [])

  return [
    state,
    setState,
    {
      undo,
      redo,
      canUndo: indexRef.current > 0,
      canRedo: indexRef.current < historyRef.current.length - 1,
    },
  ]
}
