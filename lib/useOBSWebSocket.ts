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

  // Create a Media Source (ffmpeg_source) in OBS
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

      let sceneItemId: number | null = null

      // Step 1: Ensure the input exists with correct settings
      let inputExists = false
      try {
        // Check if input already exists by trying to get its settings
        await obs.call('GetInputSettings', { inputName: sourceName })
        inputExists = true
        console.log(`[OBS] Input "${sourceName}" already exists, updating file`)
      } catch {
        // Doesn't exist
      }

      if (inputExists) {
        // Update existing input's file path and restart playback
        await obs.call('SetInputSettings', {
          inputName: sourceName,
          inputSettings: {
            local_file: filePath,
            looping: false,
            restart_on_activate: true,
            hw_decode: true,
          },
          overlay: false,
        })
        // Check if it's in our scene
        try {
          const existing = await obs.call('GetSceneItemId', { sceneName, sourceName })
          sceneItemId = existing.sceneItemId
          await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: true })
          console.log(`[OBS] Re-enabled existing source, sceneItemId=${sceneItemId}`)
        } catch {
          // Input exists but not in this scene — remove it entirely and recreate
          console.log(`[OBS] Input exists but not in scene, removing and recreating`)
          try { await obs.call('RemoveInput', { inputName: sourceName }) } catch {}
          await new Promise(r => setTimeout(r, 200))
          inputExists = false // fall through to create
        }
      }

      if (!inputExists) {
        // Create fresh input
        const result = await obs.call('CreateInput', {
          sceneName,
          inputName: sourceName,
          inputKind: 'ffmpeg_source',
          inputSettings: {
            local_file: filePath,
            looping: false,
            restart_on_activate: true,
            hw_decode: true,
          },
          sceneItemEnabled: true,
        })
        sceneItemId = result.sceneItemId
        console.log(`[OBS] Created new source, sceneItemId=${sceneItemId}`)
      }

      // Step 2: Set transform + move to top (above browser overlay)
      if (sceneItemId != null) {
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

        // Move source to top of scene (highest index = on top of browser source)
        try {
          const { sceneItems } = await obs.call('GetSceneItemList', { sceneName })
          const topIndex = sceneItems.length - 1
          await obs.call('SetSceneItemIndex', { sceneName, sceneItemId, sceneItemIndex: topIndex })
          console.log(`[OBS] Source moved to top (index ${topIndex}), transform set`)
        } catch (err: any) {
          console.log(`[OBS] Transform set (could not reorder: ${err?.message})`)
        }
      }

      // Step 3: Trigger media restart to ensure it plays from the beginning
      try {
        await obs.call('TriggerMediaInputAction', {
          inputName: sourceName,
          mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
        })
        console.log(`[OBS] Media playback started`)
      } catch (err: any) {
        console.log(`[OBS] Could not trigger playback: ${err?.message}`)
      }
    } catch (err: any) {
      console.error(`[OBS] Failed to create media source "${sourceName}":`, err?.message)
    }
  }, [getSceneName])

  // Remove a Media Source
  const removeMediaSource = useCallback(async (sourceName: string) => {
    const obs = obsRef.current
    if (!obs) return

    try {
      await obs.call('RemoveInput', { inputName: sourceName })
    } catch (err: any) {
      // Source might already be removed
      if (!err?.message?.includes('not found')) {
        console.error(`[OBS] Failed to remove source "${sourceName}":`, err?.message)
      }
    }
  }, [])

  // Show a Media Source (enable scene item)
  const showMediaSource = useCallback(async (sourceName: string, overrideScene?: string) => {
    const obs = obsRef.current
    if (!obs) return

    const sceneName = getSceneName(overrideScene)
    try {
      const { sceneItemId } = await obs.call('GetSceneItemId', { sceneName, sourceName })
      await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: true })
    } catch (err: any) {
      console.error(`[OBS] Failed to show source "${sourceName}":`, err?.message)
    }
  }, [getSceneName])

  // Hide a Media Source (disable scene item)
  const hideMediaSource = useCallback(async (sourceName: string, overrideScene?: string) => {
    const obs = obsRef.current
    if (!obs) return

    const sceneName = getSceneName(overrideScene)
    try {
      const { sceneItemId } = await obs.call('GetSceneItemId', { sceneName, sourceName })
      await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: false })
    } catch (err: any) {
      console.error(`[OBS] Failed to hide source "${sourceName}":`, err?.message)
    }
  }, [getSceneName])

  // Set media volume
  const setMediaVolume = useCallback(async (sourceName: string, volume: number) => {
    const obs = obsRef.current
    if (!obs) return

    try {
      // OBS uses dB for volume; convert linear 0-1 to dB
      // vol=1 → 0dB, vol=0 → -100dB
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
        currentTime: (result.mediaCursor || 0) / 1000, // ms → seconds
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
      // Try to create the scene (may already exist)
      try {
        await obs.call('CreateScene', { sceneName })
      } catch {
        // Scene may already exist — that's fine
      }

      // Remove existing browser source if present
      try {
        await obs.call('RemoveInput', { inputName: 'triton-overlay' })
      } catch {
        // May not exist
      }

      // Create browser source
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

      // Set the scene as current program scene
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
    removeMediaSource,
    showMediaSource,
    hideMediaSource,
    setMediaVolume,
    getMediaTime,
    setupTritonScene,
    cleanupAllTritonSources,
    isConnected: state.status === 'connected',
  }
}
