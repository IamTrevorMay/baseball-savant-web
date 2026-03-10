/**
 * customTemplateRebuild — Runtime engine for custom templates.
 * Resolves bindings and expands repeaters to produce a Scene.
 */

import { Scene, SceneElement, CustomTemplateRecord, TemplateBinding, RepeaterConfig, TemplateConfig } from './sceneTypes'
import { formatValue, type FormatType } from './templateBindingSchemas'
import { SCENE_METRICS, GAME_METRICS } from './reportMetrics'

// ── Metric label lookup for stat-card labels ────────────────────────────────

const METRIC_LABELS: Record<string, string> = {}
for (const m of SCENE_METRICS) METRIC_LABELS[m.value] = m.label
for (const m of GAME_METRICS) METRIC_LABELS[m.value] = m.label

// ── Resolve a nested field path from data ───────────────────────────────────

function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined
  return path.split('.').reduce((o, key) => o?.[key], obj)
}

// ── Resolve player fields from a data row ───────────────────────────────────

function resolvePlayerFromRow(row: any): { playerId: any; playerName: string } {
  return {
    playerId: row.player_id || row.pitcher_id || row.batter_id || null,
    playerName: row.player_name || row.pitcher_name || '',
  }
}

// ── Resolve a single element's binding against one data row ─────────────────

function resolveBinding(element: SceneElement, row: any): SceneElement {
  const binding = element.templateBinding
  const sBinding = element.sectionBinding

  // Support both templateBinding and sectionBinding (template builder uses sectionBinding)
  const fieldPath = binding?.fieldPath || (sBinding ? sBinding.metric : null)

  // Auto-bind player-image elements even if no binding is set
  if (!fieldPath && element.type === 'player-image') {
    const { playerId, playerName } = resolvePlayerFromRow(row)
    const newProps = { ...element.props }
    newProps.playerId = playerId
    newProps.playerName = playerName
    return { ...element, props: newProps }
  }

  if (!fieldPath) return element

  const format = binding?.format || sBinding?.format
  const targetPropOverride = binding?.targetProp || sBinding?.targetProp

  // Special case: __player__ binding maps to playerId
  if (fieldPath === '__player__') {
    const { playerId, playerName } = resolvePlayerFromRow(row)
    const newProps = { ...element.props }
    newProps.playerId = playerId
    newProps.playerName = playerName
    return { ...element, props: newProps }
  }

  // For player-image elements, only use __player__ logic — never set a stat value as playerId
  if (element.type === 'player-image') {
    const { playerId, playerName } = resolvePlayerFromRow(row)
    const newProps = { ...element.props }
    newProps.playerId = playerId
    newProps.playerName = playerName
    return { ...element, props: newProps }
  }

  const rawValue = getNestedValue(row, fieldPath)
  const formatted = formatValue(rawValue, format)

  const targetProp = targetPropOverride || autoDetectTarget(element)
  const newProps = { ...element.props }

  if (targetProp === 'playerId') {
    newProps.playerId = rawValue
    newProps.playerName = row.player_name || row.pitcher_name || ''
  } else {
    newProps[targetProp] = formatted
  }

  // For stat-cards, also update the label from the metric name
  if (element.type === 'stat-card' && !targetPropOverride) {
    const label = METRIC_LABELS[fieldPath]
    if (label) newProps.label = label
  }

  // For comparison-bars, also update the label
  if (element.type === 'comparison-bar' && !targetPropOverride) {
    const playerName = row.player_name || row.pitcher_name || ''
    const label = METRIC_LABELS[fieldPath] || fieldPath.replace(/_/g, ' ')
    newProps.label = playerName ? `${playerName} - ${label}` : label
  }

  return { ...element, props: newProps }
}

function autoDetectTarget(element: SceneElement): string {
  switch (element.type) {
    case 'text': return 'text'
    case 'stat-card': return 'value'
    case 'comparison-bar': return 'value'
    default: return 'text'
  }
}

// ── Expand repeater: clone row elements for each data entry ─────────────────

function expandRepeater(
  elements: SceneElement[],
  repeater: RepeaterConfig,
  data: Record<string, any>[]
): SceneElement[] {
  if (!repeater.enabled || repeater.elementIds.length === 0) return elements

  const repeaterIds = new Set(repeater.elementIds)
  const templateEls = elements.filter(el => repeaterIds.has(el.id))
  const otherEls = elements.filter(el => !repeaterIds.has(el.id))

  const count = Math.min(repeater.count, data.length)
  const result: SceneElement[] = [...otherEls]

  for (let i = 0; i < count; i++) {
    const row = data[i]
    for (const tmplEl of templateEls) {
      const dx = repeater.direction === 'horizontal' ? repeater.offset * i : 0
      const dy = repeater.direction === 'vertical' ? repeater.offset * i : 0

      let cloned: SceneElement = {
        ...tmplEl,
        id: `${tmplEl.id}_r${i}`,
        x: tmplEl.x + dx,
        y: tmplEl.y + dy,
        props: { ...tmplEl.props },
      }

      // Resolve bindings with this row's data
      cloned = resolveBinding(cloned, row)
      result.push(cloned)
    }
  }

  return result
}

// ── Main entry: create a rebuild function from a custom template ────────────

export function createCustomRebuild(template: CustomTemplateRecord) {
  return function rebuild(_config: TemplateConfig, data: any): Scene {
    let elements = template.elements.map(el => ({ ...el, props: { ...el.props } }))

    // If data is an array and we have a repeater, expand it
    const dataRows = Array.isArray(data) ? data : data ? [data] : []

    if (template.repeater?.enabled && dataRows.length > 0) {
      elements = expandRepeater(elements, template.repeater, dataRows)
    } else {
      // No repeater — resolve bindings against first data row
      const row = dataRows[0] || {}
      elements = elements.map(el => resolveBinding(el, row))
    }

    return {
      id: Math.random().toString(36).slice(2, 10),
      name: template.name,
      width: template.width,
      height: template.height,
      background: template.background,
      elements,
      duration: 5,
      fps: 30,
    }
  }
}
