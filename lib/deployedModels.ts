import type { FilterDef } from '@/components/FilterEngine'

interface DeployedModel {
  id: string
  name: string
  description: string | null
  formula: string
  column_name: string
  status: string
  deploy_config: {
    dashboardTabs?: { pitcher?: boolean; hitter?: boolean }
    reportsBuilder?: boolean
    category?: string
    format?: { decimals?: number }
  }
  deployed_at: string
}

let cache: { models: DeployedModel[]; ts: number } | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function fetchDeployedModels(): Promise<DeployedModel[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.models
  try {
    const res = await fetch('/api/models?status=deployed')
    const data = await res.json()
    const models = data.models || []
    cache = { models, ts: Date.now() }
    return models
  } catch {
    return cache?.models || []
  }
}

export function getModelFilterDefs(models: DeployedModel[]): FilterDef[] {
  return models
    .filter(m => m.deploy_config.reportsBuilder !== false)
    .map(m => ({
      key: m.column_name,
      label: m.name,
      category: m.deploy_config.category || 'Custom Models',
      type: 'range' as const,
    }))
}

export function getModelColumnNames(models: DeployedModel[]): string[] {
  return models.map(m => m.column_name)
}

export function getDashboardModels(models: DeployedModel[], dashboardType: 'pitcher' | 'hitter'): DeployedModel[] {
  return models.filter(m => {
    const tabs = m.deploy_config.dashboardTabs
    return dashboardType === 'pitcher' ? tabs?.pitcher : tabs?.hitter
  })
}

export type { DeployedModel }
