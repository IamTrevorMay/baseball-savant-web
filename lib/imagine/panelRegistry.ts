/**
 * Client-only registry of widget right-panel components.
 *
 * The widget data files (lib/imagine/widgets/*.ts) are imported by both
 * the Imagine page (client) AND the /api/imagine/render route (server).
 * Components marked 'use client' can't be referenced from server code, so
 * they live here — separately importable client-side, never imported by
 * the render API.
 */
import type { ComponentType } from 'react'
import type { WidgetPanelProps } from '@/lib/imagine/types'
import HeatMapsPanel from '@/lib/imagine/widgets/HeatMapsPanel'
import HeatMapOverlaysPanel from '@/lib/imagine/widgets/HeatMapOverlaysPanel'

export const PANEL_REGISTRY: Record<string, ComponentType<WidgetPanelProps<any>>> = {
  'heat-maps': HeatMapsPanel,
  'heat-map-overlays': HeatMapOverlaysPanel,
}
