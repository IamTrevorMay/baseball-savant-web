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
      // Create the input
      await obs.call('CreateInput', {
        sceneName,
        inputName: sourceName,
        inputKind: 'ffmpeg_source',
        inputSettings: {
          local_file: filePath,
          looping: false,
          restart_on_activate: true,
          hw_decode: true,
        },
      })

      // Get the scene item ID
      const { sceneItemId } = await obs.call('GetSceneItemId', {
        sceneName,
        sourceName,
      })

      // Set transform (position + bounds)
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
    isConnected: state.status === 'connected',
  }
}
