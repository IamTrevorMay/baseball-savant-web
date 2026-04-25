/**
 * Imagine — types for the static widget registry.
 *
 * Each widget exports a `Widget<F>` describing:
 *   - filterSchema: declarative description of the controls shown in the top filter bar
 *   - defaultFilters: starting values
 *   - fetchData(filters): async data load
 *   - buildScene(filters, data, size): returns a Scene ready for renderCardToPNG()
 *   - autoTitle(filters): default title used when the user leaves Title blank
 */
import type { ComponentType } from 'react'
import type { Scene } from '@/lib/sceneTypes'

export interface SizePreset {
  label: string
  width: number
  height: number
}

export type FilterControlType =
  | 'segmented'
  | 'select'
  | 'number'
  | 'text'
  | 'toggle-select'
  | 'date-range-season-or-custom'
  | 'player-search'

export interface FilterOption {
  value: string
  label: string
  group?: string
}

interface BaseControl {
  key: string
  label: string
  /** Which of the 4 vertical filter columns this control lives in. Controls within
   *  the same column stack top-to-bottom in declaration order. Defaults to 1.
   *  Convention (left → right by filter specificity):
   *    1 = scope (title, player type, role)
   *    2 = data filters (sort, date range, pitch type, qualifier)
   *    3 = viewable stats (primary/secondary/tertiary, size/aspect)
   *    4 = actions (reserved for the FilterBar's Export button)
   */
  column?: 1 | 2 | 3 | 4
  /** If returns false, the control is omitted from the FilterBar. Use for
   *  controls that only apply to certain modes (e.g. Role only matters for
   *  pitchers). */
  visibleWhen?: (filters: Record<string, any>) => boolean
}

export interface SegmentedControl extends BaseControl {
  type: 'segmented'
  options: FilterOption[]
}

export interface SelectControl extends BaseControl {
  type: 'select'
  options: FilterOption[]
  placeholder?: string
}

export interface NumberControl extends BaseControl {
  type: 'number'
  min?: number
  max?: number
  step?: number
}

export interface TextControl extends BaseControl {
  type: 'text'
  placeholder?: string
  /** Live placeholder computed from current filters. Useful for showing the
   *  user what the auto-generated value will be if they leave the field blank.
   *  Takes precedence over `placeholder` when present. */
  dynamicPlaceholder?: (filters: Record<string, any>) => string
}

export interface ToggleSelectControl extends BaseControl {
  type: 'toggle-select'
  options: FilterOption[]
  placeholder?: string
}

export interface DateRangeControl extends BaseControl {
  type: 'date-range-season-or-custom'
  years: number[]
}

/** Debounced player search via the search_all_players / search_players /
 *  search_batters Supabase RPCs. The control writes back a PlayerSearchValue
 *  ({ playerId, playerName }) to the named filter key. `playerTypeKey` lets
 *  the control read the current pitcher/batter selection from a sibling
 *  filter to pick the right RPC. */
export interface PlayerSearchControl extends BaseControl {
  type: 'player-search'
  /** Filter key whose value is `'pitcher' | 'batter'` and decides which RPC
   *  to call. If omitted, defaults to 'all' (search_all_players). */
  playerTypeKey?: string
  placeholder?: string
}

export interface PlayerSearchValue {
  playerId: number | null
  playerName: string
}

export type FilterControl =
  | SegmentedControl
  | SelectControl
  | NumberControl
  | TextControl
  | ToggleSelectControl
  | DateRangeControl
  | PlayerSearchControl

/** Props passed to a widget's custom right-panel renderer. Gives the panel
 *  full control over the right-side UI when `filterSchema` isn't expressive
 *  enough (e.g. tabbed multi-config widgets like Heat Maps). */
export interface WidgetPanelProps<F extends Record<string, any> = Record<string, any>> {
  filters: F
  onChange: (next: F | ((prev: F) => F)) => void
  size: SizePreset
  onSizeChange: (s: SizePreset) => void
  sizePresets: SizePreset[]
  onExport: () => void
  exportDisabled: boolean
  exporting: boolean
}

export interface Widget<F extends Record<string, any> = Record<string, any>> {
  id: string
  name: string
  description: string
  /** Top filter-bar controls, rendered left-to-right then wrapping. */
  filterSchema: FilterControl[]
  defaultFilters: F
  /** Optional custom right-panel renderer. When provided, replaces the
   *  default schema-driven FilterPanel for this widget — use when the
   *  filter UI doesn't fit the section/control model (e.g. tabs, multi-
   *  config). The panel receives full control of size/export too. */
  renderPanel?: ComponentType<WidgetPanelProps<F>>
  /** Available size presets for the size selector. */
  sizePresets: SizePreset[]
  defaultSize: SizePreset
  /** Auto-generated title used when user leaves Title blank. Goes on the
   *  rendered canvas — keep it concise (headline-style). */
  autoTitle: (filters: F) => string
  /** Auto-generated filename stem (without extension) for the Export button.
   *  Should be descriptive enough to disambiguate exports across filters
   *  (year, role, pitch type, etc.). Falls back to a slug of `autoTitle` if
   *  not provided. */
  autoFilename?: (filters: F) => string
  /** Fetch the data needed to render the widget. Called from the render API route; `origin` is the request origin so internal fetch() can resolve absolute URLs. */
  fetchData: (filters: F, origin: string) => Promise<any>
  /** Build a Scene from filters + data, sized to `size`. */
  buildScene: (filters: F, data: any, size: SizePreset) => Scene
  /** Optional cross-field normalizer. Called every time filters change with the
   *  proposed `next` state and the `prev` state; returns the final state.
   *  Use to enforce invariants like "switching playerType should reset
   *  minSample to a sensible default and clear stats that don't apply." */
  normalizeFilters?: (next: F, prev: F) => F
}
