/**
 * autoComposeTools — Tool definitions + handlers for Auto Compose AI agent.
 * 13 tools: data (3), template (3), scene manipulation (5), save (2)
 */

import Anthropic from '@anthropic-ai/sdk'
import { Scene, SceneElement, ElementType, createElement, ELEMENT_CATALOG } from './sceneTypes'
import { DATA_DRIVEN_TEMPLATES } from './sceneTemplates'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MLB_API = 'https://statsapi.mlb.com/api/v1'

const TEAM_IDS: Record<string, number> = {
  ARI: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112, CWS: 145, CIN: 113,
  CLE: 114, COL: 115, DET: 116, HOU: 117, KC: 118, LAA: 108, LAD: 119,
  MIA: 146, MIL: 158, MIN: 142, NYM: 121, NYY: 147, OAK: 133, PHI: 143,
  PIT: 134, SD: 135, SF: 137, SEA: 136, STL: 138, TB: 139, TEX: 140,
  TOR: 141, WSH: 120,
}

const TEAM_NAMES: Record<string, string> = {
  diamondbacks: 'ARI', dbacks: 'ARI', braves: 'ATL', orioles: 'BAL',
  'red sox': 'BOS', redsox: 'BOS', cubs: 'CHC', 'white sox': 'CWS',
  whitesox: 'CWS', reds: 'CIN', guardians: 'CLE', rockies: 'COL',
  tigers: 'DET', astros: 'HOU', royals: 'KC', angels: 'LAA', dodgers: 'LAD',
  marlins: 'MIA', brewers: 'MIL', twins: 'MIN', mets: 'NYM', yankees: 'NYY',
  athletics: 'OAK', phillies: 'PHI', pirates: 'PIT', padres: 'SD',
  giants: 'SF', mariners: 'SEA', cardinals: 'STL', rays: 'TB',
  rangers: 'TEX', 'blue jays': 'TOR', bluejays: 'TOR', nationals: 'WSH',
}

function resolveTeamAbbrev(input: string): string | null {
  const upper = input.trim().toUpperCase()
  if (TEAM_IDS[upper]) return upper
  const lower = input.trim().toLowerCase()
  return TEAM_NAMES[lower] || null
}

// ── Tool Definitions ─────────────────────────────────────────────────────────

export const AUTO_COMPOSE_TOOLS: Anthropic.Tool[] = [
  // ── Data tools ──
  {
    name: 'query_database',
    description: 'Execute a read-only SQL query against the Statcast pitches table (7.4M+ rows, 2015-2025) or Lahman historical tables. Always use LIMIT (max 100). Key columns: player_name (\"Last, First\"), pitcher (ID), game_date, pitch_type, release_speed, pfx_x, pfx_z (inches), plate_x, plate_z, events, description, launch_speed, launch_angle, estimated_woba_using_speedangle.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sql: { type: 'string', description: 'SQL SELECT query to execute.' },
        explanation: { type: 'string', description: 'Brief explanation of what this query does.' }
      },
      required: ['sql', 'explanation']
    }
  },
  {
    name: 'search_players',
    description: 'Search for Statcast-era players by name. Returns player ID, name, team, pitch types, total pitches, avg velocity.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Player name or partial name to search for.' }
      },
      required: ['name']
    }
  },
  {
    name: 'get_team_roster',
    description: 'Get active MLB roster for a team. Accepts abbreviation (NYY) or name (Yankees).',
    input_schema: {
      type: 'object' as const,
      properties: {
        team: { type: 'string', description: 'Team abbreviation or name.' },
        season: { type: 'number', description: 'Season year. Defaults to current year.' },
      },
      required: ['team']
    }
  },
  // ── Template tools ──
  {
    name: 'list_templates',
    description: 'List all available built-in data-driven templates and user-saved custom templates.',
    input_schema: { type: 'object' as const, properties: {}, required: [] }
  },
  {
    name: 'build_from_template',
    description: 'Build a complete scene from a data-driven template. This replaces the entire scene. Use for leaderboards, pitcher profiles, depth charts, etc. The template will auto-fetch data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        templateId: { type: 'string', description: 'Template ID from list_templates.' },
        playerType: { type: 'string', enum: ['pitcher', 'batter'], description: 'Player type filter.' },
        primaryStat: { type: 'string', description: 'Primary stat metric key (e.g. avg_velo, whiff_pct, k_pct).' },
        secondaryStat: { type: 'string', description: 'Optional secondary stat.' },
        tertiaryStat: { type: 'string', description: 'Optional tertiary stat.' },
        season: { type: 'number', description: 'Season year (default 2025).' },
        count: { type: 'number', description: 'Number of entries (default 5).' },
        sortDir: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction (default desc).' },
        minSample: { type: 'number', description: 'Minimum sample size qualifier.' },
        playerId: { type: 'number', description: 'For single-player templates (outing, percentile).' },
        playerName: { type: 'string', description: 'Player name for single-player templates.' },
        teamAbbrev: { type: 'string', description: 'For team-based templates (depth chart).' },
        pitchType: { type: 'string', description: 'Pitch type filter (e.g. FF, SL).' },
        title: { type: 'string', description: 'Custom title override.' },
      },
      required: ['templateId']
    }
  },
  {
    name: 'load_custom_template',
    description: 'Load a user-saved custom template by name or ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nameOrId: { type: 'string', description: 'Template name or UUID.' }
      },
      required: ['nameOrId']
    }
  },
  // ── Scene manipulation tools ──
  {
    name: 'set_scene_properties',
    description: 'Change scene background color, dimensions, or name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        background: { type: 'string', description: 'Background color (hex) or "transparent".' },
        width: { type: 'number', description: 'Canvas width in pixels.' },
        height: { type: 'number', description: 'Canvas height in pixels.' },
        name: { type: 'string', description: 'Scene name.' },
      },
      required: []
    }
  },
  {
    name: 'add_elements',
    description: 'Add one or more elements to the scene. Each element needs type, position (x,y), size (width,height), and props specific to that type.',
    input_schema: {
      type: 'object' as const,
      properties: {
        elements: {
          type: 'array',
          description: 'Array of elements to add.',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'Element type (text, stat-card, shape, player-image, image, comparison-bar, zone-plot, movement-plot, rc-table, rc-bar-chart, rc-stat-box, rc-donut-chart, rc-statline, ticker, curved-text, path).' },
              x: { type: 'number', description: 'X position (pixels from left).' },
              y: { type: 'number', description: 'Y position (pixels from top).' },
              width: { type: 'number', description: 'Width in pixels.' },
              height: { type: 'number', description: 'Height in pixels.' },
              props: { type: 'object', description: 'Type-specific properties (text, color, fontSize, etc.).' },
              zIndex: { type: 'number', description: 'Layer order (higher = on top). Default auto-increments.' },
              opacity: { type: 'number', description: 'Opacity 0-1. Default 1.' },
              rotation: { type: 'number', description: 'Rotation in degrees. Default 0.' },
            },
            required: ['type', 'x', 'y', 'width', 'height']
          }
        }
      },
      required: ['elements']
    }
  },
  {
    name: 'update_elements',
    description: 'Update existing elements by ID or selector. Can change position, size, props, or any property.',
    input_schema: {
      type: 'object' as const,
      properties: {
        updates: {
          type: 'array',
          description: 'Array of update operations.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Element ID to update (from get_scene_info).' },
              selector: { type: 'object', description: 'Alternative: select by type and/or prop match. E.g. {type: "text", propMatch: {text: "TITLE"}}', properties: { type: { type: 'string' }, propMatch: { type: 'object' } } },
              set: { type: 'object', description: 'Properties to update: x, y, width, height, rotation, opacity, zIndex, or nested props via {props: {key: value}}.' },
            },
          }
        }
      },
      required: ['updates']
    }
  },
  {
    name: 'remove_elements',
    description: 'Remove elements from the scene by ID, type, or clear all.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Element IDs to remove.' },
        type: { type: 'string', description: 'Remove all elements of this type.' },
        clearAll: { type: 'boolean', description: 'Remove all elements.' },
      },
      required: []
    }
  },
  {
    name: 'get_scene_info',
    description: 'Get detailed info about the current scene: all elements with their IDs, types, positions, sizes, and key props.',
    input_schema: { type: 'object' as const, properties: {}, required: [] }
  },
  // ── Save tools ──
  {
    name: 'save_as_template',
    description: 'Save the current scene as a reusable custom template.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Template name.' },
        description: { type: 'string', description: 'Template description.' },
        category: { type: 'string', description: 'Category (custom, pitcher, batter, team, social).' },
      },
      required: ['name']
    }
  },
  {
    name: 'fetch_player_headshot_url',
    description: 'Get the MLB headshot image URL for a player ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        playerId: { type: 'number', description: 'MLB player ID.' }
      },
      required: ['playerId']
    },
  },
  // ── Design rules tools ──
  {
    name: 'save_design_rule',
    description: 'Save a design rule or pattern to remember for future graphics. Use when the user says "remember this", "save this pattern", or when you notice a successful design pattern worth preserving. Categories: layout, typography, color, spacing, composition, data-viz, general.',
    input_schema: {
      type: 'object' as const,
      properties: {
        rule: { type: 'string', description: 'The design rule or pattern to remember. Be specific and actionable.' },
        category: { type: 'string', enum: ['layout', 'typography', 'color', 'spacing', 'composition', 'data-viz', 'general'], description: 'Rule category.' },
      },
      required: ['rule', 'category']
    },
  },
  {
    name: 'list_design_rules',
    description: 'List all saved design rules. Use to review current rules before building a graphic.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: { type: 'string', description: 'Optional: filter by category.' }
      },
      required: []
    },
  },
  {
    name: 'remove_design_rule',
    description: 'Remove a design rule by ID. Use when the user says to forget or remove a rule.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Rule UUID to remove.' }
      },
      required: ['id']
    },
    // Cache breakpoint: all tool definitions above this are cached
    cache_control: { type: 'ephemeral' as const },
  },
] as Anthropic.Tool[]

// ── Tool Handlers ────────────────────────────────────────────────────────────

let zCounter = 200

interface ToolContext {
  scene: Scene
}

export async function handleAutoComposeTool(
  toolName: string,
  input: Record<string, any>,
  ctx: ToolContext
): Promise<{ result: string; sceneUpdate?: Partial<Scene> }> {
  const scene = ctx.scene

  switch (toolName) {
    // ── Data tools ──────────────────────────────────────────────────────────

    case 'query_database': {
      const { sql, explanation } = input as { sql: string; explanation: string }
      const sqlLower = sql.toLowerCase().trim()
      if (!sqlLower.startsWith('select') && !sqlLower.startsWith('with')) {
        return { result: JSON.stringify({ error: 'Only SELECT queries allowed.' }) }
      }
      const { data, error } = await supabase.rpc('run_query', { query_text: sql })
      if (error) return { result: JSON.stringify({ error: error.message }) }
      return { result: JSON.stringify({ explanation, data, row_count: Array.isArray(data) ? data.length : 0 }) }
    }

    case 'search_players': {
      const { name } = input as { name: string }
      const { data, error } = await supabase.rpc('search_players', { search_term: name, result_limit: 10 })
      return { result: JSON.stringify(error ? { error: error.message } : { players: data }) }
    }

    case 'get_team_roster': {
      const { team, season } = input as { team: string; season?: number }
      const abbrev = resolveTeamAbbrev(team)
      if (!abbrev) return { result: JSON.stringify({ error: `Could not resolve team: "${team}"` }) }
      const teamId = TEAM_IDS[abbrev]
      const yr = season || new Date().getFullYear()
      const res = await fetch(`${MLB_API}/teams/${teamId}/roster/active?season=${yr}`, { next: { revalidate: 60 } } as any)
      const data = await res.json()
      const roster = (data.roster || []).map((p: any) => ({
        name: p.person?.fullName, id: p.person?.id,
        position: p.position?.abbreviation, number: p.jerseyNumber,
        bats: p.person?.batSide?.code, throws: p.person?.pitchHand?.code,
      }))
      return { result: JSON.stringify({ team: abbrev, season: yr, roster, count: roster.length }) }
    }

    // ── Template tools ──────────────────────────────────────────────────────

    case 'list_templates': {
      const builtIn = DATA_DRIVEN_TEMPLATES.map(t => ({
        id: t.id, name: t.name, category: t.category, description: t.description,
      }))
      // Fetch custom templates
      let custom: any[] = []
      try {
        const { data } = await supabase
          .from('custom_templates')
          .select('id, name, description, category')
          .order('updated_at', { ascending: false })
          .limit(20)
        custom = (data || []).map(t => ({ id: `custom:${t.id}`, name: t.name, category: t.category, description: t.description }))
      } catch {}
      return { result: JSON.stringify({ builtIn, custom }) }
    }

    case 'build_from_template': {
      const { templateId, playerType, primaryStat, secondaryStat, tertiaryStat, season, count, sortDir, minSample, playerId, playerName, teamAbbrev, pitchType, title } = input

      const template = DATA_DRIVEN_TEMPLATES.find(t => t.id === templateId)
      if (!template) return { result: JSON.stringify({ error: `Template "${templateId}" not found. Use list_templates to see available templates.` }) }

      const config = {
        templateId,
        playerType: playerType || template.defaultConfig.playerType || 'pitcher',
        primaryStat: primaryStat || template.defaultConfig.primaryStat || 'avg_velo',
        secondaryStat,
        tertiaryStat,
        dateRange: { type: 'season' as const, year: season || 2025 },
        sortDir: sortDir || template.defaultConfig.sortDir || 'desc',
        count: count || template.defaultConfig.count || 5,
        minSample,
        playerId,
        playerName,
        teamAbbrev,
        pitchType,
        title,
      }

      try {
        // Fetch data based on template type
        let data: any = []

        if (templateId === 'rotation-depth-chart' || templateId === 'bullpen-depth-chart') {
          const team = teamAbbrev || 'NYY'
          const year = season || new Date().getFullYear()
          const isBullpen = templateId === 'bullpen-depth-chart'
          const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/scene-stats?depthChart=true${isBullpen ? '&bullpenChart=true' : ''}&team=${team}&gameYear=${year}`)
          const json = await res.json()
          data = isBullpen ? json.bullpenChart : json.depthChart
        } else if (templateId === 'percentile-rankings') {
          if (!playerId) return { result: JSON.stringify({ error: 'percentile-rankings requires playerId' }) }
          const year = season || 2025
          const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/scene-stats?percentile=true&playerId=${playerId}&playerType=${playerType || 'pitcher'}&gameYear=${year}`)
          const json = await res.json()
          data = json.percentiles || []
        } else if (templateId === 'pitcher-outing-report' || templateId === 'starter-card') {
          if (!playerId) return { result: JSON.stringify({ error: `${templateId} requires playerId and gamePk` }) }
          // Without gamePk, return empty template
          const rebuilt = template.rebuild(config, null)
          return { result: JSON.stringify({ success: true, message: `Built ${template.name} template. Set playerId and gamePk to populate with data.` }), sceneUpdate: rebuilt }
        } else {
          // Default: leaderboard fetch
          const params = new URLSearchParams({
            leaderboard: 'true',
            metric: config.primaryStat,
            playerType: config.playerType,
            limit: String(config.count),
            sortDir: config.sortDir,
            minSample: String(config.minSample ?? (config.playerType === 'batter' ? 150 : 300)),
            gameYear: String(config.dateRange.year),
          })
          if (pitchType) params.set('pitchType', pitchType)
          if (secondaryStat) params.set('secondaryMetric', secondaryStat)
          if (tertiaryStat) params.set('tertiaryMetric', tertiaryStat)
          const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/scene-stats?${params}`)
          const json = await res.json()
          data = json.leaderboard || json.depthChart || json.percentiles || []
        }

        const rebuilt = template.rebuild(config, data)
        return {
          result: JSON.stringify({ success: true, message: `Built ${template.name} with ${Array.isArray(data) ? data.length : 'N/A'} data rows.` }),
          sceneUpdate: rebuilt,
        }
      } catch (err: any) {
        return { result: JSON.stringify({ error: err.message }) }
      }
    }

    case 'load_custom_template': {
      const { nameOrId } = input as { nameOrId: string }
      const cleanId = nameOrId.replace(/^custom:/, '')
      // Try by ID first, then by name
      let { data } = await supabase
        .from('custom_templates')
        .select('*')
        .eq('id', cleanId)
        .single()
      if (!data) {
        const res = await supabase
          .from('custom_templates')
          .select('*')
          .ilike('name', `%${nameOrId}%`)
          .limit(1)
          .single()
        data = res.data
      }
      if (!data) return { result: JSON.stringify({ error: `Custom template "${nameOrId}" not found.` }) }

      const templateScene: Scene = {
        id: Math.random().toString(36).slice(2, 10),
        name: data.name,
        width: data.width || 1920,
        height: data.height || 1080,
        background: data.background || '#09090b',
        elements: data.elements || [],
        duration: 5,
        fps: 30,
      }
      return {
        result: JSON.stringify({ success: true, name: data.name, elementCount: templateScene.elements.length }),
        sceneUpdate: templateScene,
      }
    }

    // ── Scene manipulation tools ────────────────────────────────────────────

    case 'set_scene_properties': {
      const updates: Partial<Scene> = {}
      if (input.background !== undefined) updates.background = input.background
      if (input.width !== undefined) updates.width = input.width
      if (input.height !== undefined) updates.height = input.height
      if (input.name !== undefined) updates.name = input.name
      return {
        result: JSON.stringify({ success: true, updated: Object.keys(updates) }),
        sceneUpdate: updates,
      }
    }

    case 'add_elements': {
      const { elements: elDefs } = input as { elements: any[] }
      const newElements: SceneElement[] = []

      for (const def of elDefs) {
        const type = def.type as ElementType
        if (!ELEMENT_CATALOG.find(c => c.type === type) && !type.startsWith('rc-')) {
          continue // Skip invalid types
        }

        // Create element with defaults, then overlay user props
        const base = createElement(type, def.x + (def.width || 200) / 2, def.y + (def.height || 100) / 2)
        const el: SceneElement = {
          ...base,
          x: def.x,
          y: def.y,
          width: def.width || base.width,
          height: def.height || base.height,
          zIndex: def.zIndex ?? ++zCounter,
          opacity: def.opacity ?? 1,
          rotation: def.rotation ?? 0,
          props: { ...base.props, ...(def.props || {}) },
        }
        newElements.push(el)
      }

      return {
        result: JSON.stringify({ success: true, added: newElements.length, ids: newElements.map(e => e.id) }),
        sceneUpdate: { elements: [...scene.elements, ...newElements] },
      }
    }

    case 'update_elements': {
      const { updates } = input as { updates: any[] }
      let updatedCount = 0
      let updatedElements = [...scene.elements]

      for (const upd of updates) {
        let targetIds: string[] = []

        if (upd.id) {
          targetIds = [upd.id]
        } else if (upd.selector) {
          targetIds = updatedElements
            .filter(el => {
              if (upd.selector.type && el.type !== upd.selector.type) return false
              if (upd.selector.propMatch) {
                for (const [k, v] of Object.entries(upd.selector.propMatch)) {
                  if (el.props[k] !== v) return false
                }
              }
              return true
            })
            .map(el => el.id)
        }

        for (const id of targetIds) {
          updatedElements = updatedElements.map(el => {
            if (el.id !== id) return el
            updatedCount++
            const { props: propUpdates, ...directUpdates } = upd.set || {}
            return {
              ...el,
              ...directUpdates,
              props: propUpdates ? { ...el.props, ...propUpdates } : el.props,
            }
          })
        }
      }

      return {
        result: JSON.stringify({ success: true, updated: updatedCount }),
        sceneUpdate: { elements: updatedElements },
      }
    }

    case 'remove_elements': {
      const { ids, type, clearAll } = input as { ids?: string[]; type?: string; clearAll?: boolean }
      let remaining = scene.elements

      if (clearAll) {
        remaining = []
      } else if (ids?.length) {
        const idSet = new Set(ids)
        remaining = remaining.filter(el => !idSet.has(el.id))
      } else if (type) {
        remaining = remaining.filter(el => el.type !== type)
      }

      const removed = scene.elements.length - remaining.length
      return {
        result: JSON.stringify({ success: true, removed, remaining: remaining.length }),
        sceneUpdate: { elements: remaining },
      }
    }

    case 'get_scene_info': {
      const info = scene.elements.map(el => {
        const summary: Record<string, any> = {
          id: el.id,
          type: el.type,
          x: el.x, y: el.y,
          width: el.width, height: el.height,
          zIndex: el.zIndex,
        }
        // Include key props based on type
        if (el.type === 'text') {
          summary.text = el.props.text?.slice(0, 50)
          summary.fontSize = el.props.fontSize
          summary.color = el.props.color
        } else if (el.type === 'stat-card') {
          summary.label = el.props.label
          summary.value = el.props.value
          summary.color = el.props.color
        } else if (el.type === 'shape') {
          summary.shape = el.props.shape
          summary.fill = el.props.fill
        } else if (el.type === 'player-image') {
          summary.playerId = el.props.playerId
          summary.playerName = el.props.playerName
        } else if (el.type === 'comparison-bar') {
          summary.label = el.props.label
          summary.value = el.props.value
        } else if (el.type === 'image') {
          summary.src = el.props.src?.slice(0, 80)
        } else if (el.type === 'rc-table') {
          summary.title = el.props.title
          summary.rowCount = el.props.rows?.length ?? 0
        }
        return summary
      })
      return {
        result: JSON.stringify({
          name: scene.name,
          width: scene.width,
          height: scene.height,
          background: scene.background,
          elementCount: scene.elements.length,
          elements: info,
        }),
      }
    }

    // ── Save tools ──────────────────────────────────────────────────────────

    case 'save_as_template': {
      const { name, description, category } = input as { name: string; description?: string; category?: string }
      try {
        const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'
        const { data, error } = await supabase
          .from('custom_templates')
          .insert({
            user_id: DEFAULT_USER_ID,
            name,
            description: description || '',
            category: category || 'custom',
            icon: '',
            width: scene.width,
            height: scene.height,
            background: scene.background,
            elements: scene.elements,
            input_fields: { schemaType: 'generic', inputSections: [] },
            data_query: null,
          })
          .select('id')
          .single()
        if (error) return { result: JSON.stringify({ error: error.message }) }
        return { result: JSON.stringify({ success: true, templateId: data.id, message: `Saved as custom template "${name}"` }) }
      } catch (err: any) {
        return { result: JSON.stringify({ error: err.message }) }
      }
    }

    case 'fetch_player_headshot_url': {
      const { playerId } = input as { playerId: number }
      const url = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`
      return { result: JSON.stringify({ playerId, url }) }
    }

    // ── Design rules tools ──────────────────────────────────────────────

    case 'save_design_rule': {
      const { rule, category } = input as { rule: string; category: string }
      const { data, error } = await supabase
        .from('design_rules')
        .insert({ rule, category, source: 'agent' })
        .select('id')
        .single()
      if (error) return { result: JSON.stringify({ error: error.message }) }
      return { result: JSON.stringify({ success: true, id: data.id, message: `Saved design rule: "${rule}"` }) }
    }

    case 'list_design_rules': {
      const { category } = input as { category?: string }
      let query = supabase.from('design_rules').select('id, rule, category, source, created_at').order('created_at', { ascending: true })
      if (category) query = query.eq('category', category)
      const { data, error } = await query
      if (error) return { result: JSON.stringify({ error: error.message }) }
      return { result: JSON.stringify({ rules: data, count: data?.length || 0 }) }
    }

    case 'remove_design_rule': {
      const { id } = input as { id: string }
      const { error } = await supabase.from('design_rules').delete().eq('id', id)
      if (error) return { result: JSON.stringify({ error: error.message }) }
      return { result: JSON.stringify({ success: true, message: 'Rule removed.' }) }
    }

    default:
      return { result: JSON.stringify({ error: `Unknown tool: ${toolName}` }) }
  }
}
