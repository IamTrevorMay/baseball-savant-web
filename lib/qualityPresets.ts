/**
 * qualityPresets — Export / render quality settings for the Visualize tool.
 *
 * Each preset controls:
 *   fps          Target frame rate for canvas animations / video export
 *   resolution   Device pixel ratio multiplier for canvas rendering
 *   maxPitches   Cap on how many pitch trajectories to render per frame
 *   exportWidth  Pixel width of the exported image / video
 *   exportHeight Pixel height of the exported image / video
 */

export interface QualityPreset {
  id: 'draft' | 'standard' | 'high' | 'ultra'
  label: string
  fps: number
  resolution: number
  maxPitches: number
  exportWidth: number
  exportHeight: number
}

export const QUALITY_PRESETS: Record<QualityPreset['id'], QualityPreset> = {
  draft: {
    id: 'draft',
    label: 'Draft',
    fps: 15,
    resolution: 1,
    maxPitches: 50,
    exportWidth: 960,
    exportHeight: 540,
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    fps: 30,
    resolution: 1.5,
    maxPitches: 200,
    exportWidth: 1280,
    exportHeight: 720,
  },
  high: {
    id: 'high',
    label: 'High',
    fps: 30,
    resolution: 2,
    maxPitches: 500,
    exportWidth: 1920,
    exportHeight: 1080,
  },
  ultra: {
    id: 'ultra',
    label: 'Ultra',
    fps: 60,
    resolution: 3,
    maxPitches: 2000,
    exportWidth: 2560,
    exportHeight: 1440,
  },
}
