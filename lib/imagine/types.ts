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

export interface FilterOption {
  value: string
  label: string
  group?: string
}

interface BaseControl {
  key: string
  label: string
  span?: 1 | 2 | 3 | 4   // grid column span (out of 4)
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

export type FilterControl =
  | SegmentedControl
  | SelectControl
  | NumberControl
  | TextControl
  | ToggleSelectControl
  | DateRangeControl

export interface Widget<F extends Record<string, any> = Record<string, any>> {
  id: string
  name: string
  description: string
  /** Top filter-bar controls, rendered left-to-right then wrapping. */
  filterSchema: FilterControl[]
  defaultFilters: F
  /** Available size presets for the size selector. */
  sizePresets: SizePreset[]
  defaultSize: SizePreset
  /** Auto-generated title used when user leaves Title blank. */
  autoTitle: (filters: F) => string
  /** Fetch the data needed to render the widget. Called from the render API route; `origin` is the request origin so internal fetch() can resolve absolute URLs. */
  fetchData: (filters: F, origin: string) => Promise<any>
  /** Build a Scene from filters + data, sized to `size`. */
  buildScene: (filters: F, data: any, size: SizePreset) => Scene
}
