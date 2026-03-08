/**
 * customTemplateRebuild — Runtime engine for custom templates.
 * Resolves bindings and expands repeaters to produce a Scene.
 */

import { Scene, SceneElement, CustomTemplateRecord, TemplateBinding, RepeaterConfig, TemplateConfig } from './sceneTypes'
import { formatValue, type FormatType } from './templateBindingSchemas'

// ── Resolve a nested field path from data ───────────────────────────────────

function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined
  return path.split('.').reduce((o, key) => o?.[key], obj)
}

// ── Resolve a single element's binding against one data row ─────────────────

function resolveBinding(element: SceneElement, row: any): SceneElement {
  const binding = element.templateBinding
  if (!binding) return element

  const rawValue = getNestedValue(row, binding.fieldPath)
  const formatted = formatValue(rawValue, binding.format)

  const targetProp = binding.targetProp || autoDetectTarget(element)
  const newProps = { ...element.props }

  if (targetProp === 'playerId') {
    newProps.playerId = rawValue
    newProps.playerName = row.player_name || row.pitcher_name || ''
  } else {
    newProps[targetProp] = formatted
  }

  return { ...element, props: newProps }
}

function autoDetectTarget(element: SceneElement): string {
  switch (element.type) {
    case 'text': return 'text'
    case 'stat-card': return 'value'
    case 'comparison-bar': return 'value'
    case 'player-image': return 'playerId'
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
