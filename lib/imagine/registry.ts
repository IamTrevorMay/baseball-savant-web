/**
 * Imagine widget registry.
 *
 * Curated subset of widgets surfaced in the Imagine app. Each entry is a
 * static, code-defined Widget — Imagine does not allow per-element editing.
 * Add new widgets here as they're built.
 */
import type { Widget } from '@/lib/imagine/types'
import topFiveLeaderboard from '@/lib/imagine/widgets/topFiveLeaderboard'
import playerStats from '@/lib/imagine/widgets/playerStats'
import heatMaps from '@/lib/imagine/widgets/heatMaps'

export const IMAGINE_WIDGETS: Widget[] = [
  topFiveLeaderboard as unknown as Widget,
  playerStats as unknown as Widget,
  heatMaps as unknown as Widget,
]

export function getWidget(id: string): Widget | undefined {
  return IMAGINE_WIDGETS.find(w => w.id === id)
}
