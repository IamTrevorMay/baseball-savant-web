'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import OBSWebSocket from 'obs-websocket-js'
import { OBSConnectionConfig } from './broadcastTypes'

export interface OBSState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  error: string | null
  currentScene: string | null
  obsVersion: string | null
}

interface UseOBSWebSocketOptions {
  onMediaEnded?: (sourceName: string) => void
  onDisconnected?: () => void
}

interface TrackedSource {
  sceneItemId: number
  sceneName: string
}

export function useOBSWebSocket(options?: UseOBSWebSocketOptions) {
  const [state, setState] = useState<OBSState>({
    status: 'disconnected',
    error: null,
    currentScene: null,
    obsVersion: null,
  })

  const obsRef = useRef<OBSWebSocket | null>(null)
  const sceneNameRef = useRef<string | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  // Track created sources → sceneItemId so we can reuse them
  const sourceMapRef = useRef<Map<string, TrackedSource>>(new Map())

  // Connect to OBS WebSocket
  const connect = useCallback(async (config: OBSConnectionConfig) => {
    setState(prev => ({ ...prev, status: 'connecting', error: null }))

    try {
      const obs = new OBSWebSocket()

      const url = `ws://${config.host}:${config.port}`
      const { obsWebSocketVersion } = await obs.connect(url, config.password || undefined)

      // Get current scene
      const { currentProgramSceneName } = await obs.call('GetCurrentProgramScene')
      sceneNameRef.current = currentProgramSceneName

      // Clear tracked sources on new connection
      sourceMapRef.current.clear()

      // Listen for media playback ended
      obs.on('MediaInputPlaybackEnded' as any, (data: any) => {
        const inputName = data?.inputName
        if (inputName?.startsWith('triton-media-')) {
          optionsRef.current?.onMediaEnded?.(inputName)
        }
      })

      // Listen for disconnect
      obs.on('ConnectionClosed' as any, () => {
        setState({
          status: 'disconnected',
          error: null,
          currentScene: null,
          obsVersion: null,
        })
        obsRef.current = null
        sceneNameRef.current = null
        sourceMapRef.current.clear()
        optionsRef.current?.onDisconnected?.()
      })

      obs.on('ConnectionError' as any, (err: any) => {
        setState(prev => ({
          ...prev,
          status: 'error',
          error: err?.message || 'Connection error',
        }))
      })

      obsRef.current = obs

      setState({
        status: 'connected',
        error: null,
        currentScene: currentProgramSceneName,
        obsVersion: obsWebSocketVersion || null,
      })
    } catch (err: any) {
      setState({
        status: 'error',
        error: err?.message || 'Failed to connect',
        currentScene: null,
        obsVersion: null,
      })
    }
  }, [])

  // Disconnect
  const disconnect = useCallback(async () => {
    if (obsRef.current) {
      try {
        await obsRef.current.disconnect()
      } catch {}
      obsRef.current = null
    }
    sceneNameRef.current = null
    sourceMapRef.current.clear()
    setState({
      status: 'disconnected',
      error: null,
      currentScene: null,
      obsVersion: null,
    })
  }, [])

  // Get the scene name to operate in
  const getSceneName = useCallback((overrideScene?: string): string => {
    return overrideScene || sceneNameRef.current || 'Scene'
  }, [])

  // Create or reuse a Media Source (ffmpeg_source) in OBS
  const createMediaSource = useCallback(async (
    sourceName: string,
    filePath: string,
    transform: { x: number; y: number; width: number; height: number },
    overrideScene?: string,
  ) => {
    const obs = obsRef.current
    if (!obs) return

    const sceneName = getSceneName(overrideScene)

    try {
      console.log(`[OBS] Media source "${sourceName}" in scene "${sceneName}" → ${filePath}`)

      const mediaSettings = {
        local_file: filePath,
        looping: false,
        restart_on_activate: true,
        hw_decode: true,
      }

      // Check if we already track this source
      const tracked = sourceMapRef.current.get(sourceName)

      if (tracked && tracked.sceneName === sceneName) {
        // Source already exists and is in the scene — just update, enable, restart
        await obs.call('SetInputSettings', {
          inputName: sourceName,
          inputSettings: mediaSettings,
          overlay: false,
        })
        await obs.call('SetSceneItemEnabled', {
          sceneName,
          sceneItemId: tracked.sceneItemId,
          sceneItemEnabled: true,
        })
        // Update transform
        await obs.call('SetSceneItemTransform', {
          sceneName,
          sceneItemId: tracked.sceneItemId,
          sceneItemTransform: {
            positionX: transform.x,
            positionY: transform.y,
            boundsType: 'OBS_BOUNDS_SCALE_INNER',
            boundsWidth: transform.width,
            boundsHeight: transform.height,
          },
        })
        // Restart playback
        try {
          await obs.call('TriggerMediaInputAction', {
            inputName: sourceName,
            mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
          })
        } catch {}
        console.log(`[OBS] Reused tracked source, sceneItemId=${tracked.sceneItemId}`)
        return
      }

      let sceneItemId: number | null = null

      // Check if input already exists globally in OBS (from a previous session etc.)
      let inputExists = false
      try {
        await obs.call('GetInputSettings', { inputName: sourceName })
        inputExists = true
      } catch {}

      if (inputExists) {
        // Update file path on existing input
        await obs.call('SetInputSettings', {
          inputName: sourceName,
          inputSettings: mediaSettings,
          overlay: false,
        })

        // Check if it's already in this scene
        try {
          const existing = await obs.call('GetSceneItemId', { sceneName, sourceName })
          sceneItemId = existing.sceneItemId
          await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: true })
          console.log(`[OBS] Re-enabled existing in scene, sceneItemId=${sceneItemId}`)
        } catch {
          // Not in this scene — add it
          const added = await obs.call('CreateSceneItem', {
            sceneName,
            sourceName,
            sceneItemEnabled: true,
          })
          sceneItemId = added.sceneItemId
          console.log(`[OBS] Added existing input to scene, sceneItemId=${sceneItemId}`)
        }
      } else {
        // Create brand new input
        const result = await obs.call('CreateInput', {
          sceneName,
          inputName: sourceName,
          inputKind: 'ffmpeg_source',
          inputSettings: mediaSettings,
          sceneItemEnabled: true,
        })
        sceneItemId = result.sceneItemId
        console.log(`[OBS] Created new source, sceneItemId=${sceneItemId}`)
      }

      // Track the source for reuse
      if (sceneItemId != null) {
        sourceMapRef.current.set(sourceName, { sceneItemId, sceneName })

        // Set transform
        await obs.call('SetSceneItemTransform', {
          sceneName,
          sceneItemId,
          sceneItemTransform: {
            positionX: transform.x,
            positionY: transform.y,
            boundsType: 'OBS_BOUNDS_SCALE_INNER',
            boundsWidth: transform.width,
            boundsHeight: transform.height,
          },
        })

        // Move to top (above browser overlay)
        try {
          const { sceneItems } = await obs.call('GetSceneItemList', { sceneName })
          const topIndex = sceneItems.length - 1
          await obs.call('SetSceneItemIndex', { sceneName, sceneItemId, sceneItemIndex: topIndex })
        } catch {}
      }

      // Force playback from beginning
      try {
        await obs.call('TriggerMediaInputAction', {
          inputName: sourceName,
          mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
        })
        console.log(`[OBS] Playback started`)
      } catch (err: any) {
        console.log(`[OBS] Could not trigger playback: ${err?.message}`)
      }
    } catch (err: any) {
      console.error(`[OBS] Failed to set up media source "${sourceName}":`, err?.message)
    }
  }, [getSceneName])

  // Hide a Media Source (disable scene item) — does NOT remove, keeps it for reuse
  const hideMediaSource = useCallback(async (sourceName: string, overrideScene?: string) => {
    const obs = obsRef.current
    if (!obs) return

    const sceneName = getSceneName(overrideScene)
    const tracked = sourceMapRef.current.get(sourceName)

    try {
      if (tracked) {
        await obs.call('SetSceneItemEnabled', {
          sceneName: tracked.sceneName,
          sceneItemId: tracked.sceneItemId,
          sceneItemEnabled: false,
        })
      } else {
        // Fallback: look up by name
        const { sceneItemId } = await obs.call('GetSceneItemId', { sceneName, sourceName })
        await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: false })
      }
    } catch (err: any) {
      console.error(`[OBS] Failed to hide source "${sourceName}":`, err?.message)
    }
  }, [getSceneName])

  // Show a Media Source (enable scene item)
  const showMediaSource = useCallback(async (sourceName: string, overrideScene?: string) => {
    const obs = obsRef.current
    if (!obs) return

    const sceneName = getSceneName(overrideScene)
    const tracked = sourceMapRef.current.get(sourceName)

    try {
      if (tracked) {
        await obs.call('SetSceneItemEnabled', {
          sceneName: tracked.sceneName,
          sceneItemId: tracked.sceneItemId,
          sceneItemEnabled: true,
        })
      } else {
        const { sceneItemId } = await obs.call('GetSceneItemId', { sceneName, sourceName })
        await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: true })
      }
    } catch (err: any) {
      console.error(`[OBS] Failed to show source "${sourceName}":`, err?.message)
    }
  }, [getSceneName])

  // Set media volume
  const setMediaVolume = useCallback(async (sourceName: string, volume: number) => {
    const obs = obsRef.current
    if (!obs) return

    try {
      const volDb = volume <= 0 ? -100 : 20 * Math.log10(volume)
      await obs.call('SetInputVolume', { inputName: sourceName, inputVolumeDb: volDb })
    } catch (err: any) {
      console.error(`[OBS] Failed to set volume for "${sourceName}":`, err?.message)
    }
  }, [])

  // Get media playback time
  const getMediaTime = useCallback(async (sourceName: string): Promise<{ currentTime: number; duration: number } | null> => {
    const obs = obsRef.current
    if (!obs) return null

    try {
      const result = await obs.call('GetMediaInputStatus', { inputName: sourceName })
      return {
        currentTime: (result.mediaCursor || 0) / 1000,
        duration: (result.mediaDuration || 0) / 1000,
      }
    } catch {
      return null
    }
  }, [])

  // Setup "Triton Broadcast" scene with browser source overlay
  const setupTritonScene = useCallback(async (overlayUrl: string) => {
    const obs = obsRef.current
    if (!obs) return

    const sceneName = 'Triton Broadcast'

    try {
      try {
        await obs.call('CreateScene', { sceneName })
      } catch {}

      try {
        await obs.call('RemoveInput', { inputName: 'triton-overlay' })
      } catch {}

      await obs.call('CreateInput', {
        sceneName,
        inputName: 'triton-overlay',
        inputKind: 'browser_source',
        inputSettings: {
          url: overlayUrl,
          width: 1920,
          height: 1080,
          css: '',
          shutdown: false,
          restart_when_active: false,
        },
      })

      await obs.call('SetCurrentProgramScene', { sceneName })
      sceneNameRef.current = sceneName
      setState(prev => ({ ...prev, currentScene: sceneName }))
    } catch (err: any) {
      console.error('[OBS] Failed to setup Triton scene:', err?.message)
    }
  }, [])

  // Remove ALL triton-media-* inputs from OBS
  const cleanupAllTritonSources = useCallback(async () => {
    const obs = obsRef.current
    if (!obs) return 0

    try {
      const { inputs } = await obs.call('GetInputList')
      const tritonInputs = inputs.filter((i: any) =>
        typeof i.inputName === 'string' && i.inputName.startsWith('triton-media-')
      )
      console.log(`[OBS] Cleaning up ${tritonInputs.length} stale triton sources`)
      for (const input of tritonInputs) {
        try {
          await obs.call('RemoveInput', { inputName: input.inputName as string })
          console.log(`[OBS] Removed: ${input.inputName}`)
        } catch (err: any) {
          console.warn(`[OBS] Could not remove ${input.inputName}: ${err?.message}`)
        }
      }
      // Clear our tracking map
      sourceMapRef.current.clear()
      return tritonInputs.length
    } catch (err: any) {
      console.error('[OBS] Cleanup failed:', err?.message)
      return 0
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (obsRef.current) {
        obsRef.current.disconnect().catch(() => {})
        obsRef.current = null
      }
    }
  }, [])

  return {
    state,
    connect,
    disconnect,
    createMediaSource,
    showMediaSource,
    hideMediaSource,
    setMediaVolume,
    getMediaTime,
    setupTritonScene,
    cleanupAllTritonSources,
    isConnected: state.status === 'connected',
  }
}
