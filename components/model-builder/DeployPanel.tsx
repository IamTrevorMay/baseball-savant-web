'use client'
import { useState } from 'react'

interface DeployConfig {
  dashboardTabs?: { pitcher?: boolean; hitter?: boolean }
  reportsBuilder?: boolean
  category?: string
  format?: { decimals?: number }
}

interface Props {
  modelId: string | null
  modelName: string
  status: string
  deployConfig: DeployConfig
  onDeployConfigChange: (config: DeployConfig) => void
  onDeploy: () => void
  deployProgress: { remaining: number; total: number } | null
  deployError: string | null
}

export default function DeployPanel({ modelId, modelName, status, deployConfig, onDeployConfigChange, onDeploy, deployProgress, deployError }: Props) {
  const isDeploying = status === 'deploying'
  const isDeployed = status === 'deployed'
  const isFailed = status === 'failed'

  const config = {
    dashboardTabs: { pitcher: false, hitter: false, ...deployConfig.dashboardTabs },
    reportsBuilder: deployConfig.reportsBuilder !== false,
    category: deployConfig.category || 'Custom Models',
    format: { decimals: deployConfig.format?.decimals ?? 2 },
  }

  function toggle(path: string, value: boolean) {
    const next = { ...deployConfig }
    if (path === 'pitcher') next.dashboardTabs = { ...config.dashboardTabs, pitcher: value }
    else if (path === 'hitter') next.dashboardTabs = { ...config.dashboardTabs, hitter: value }
    else if (path === 'reportsBuilder') next.reportsBuilder = value
    onDeployConfigChange(next)
  }

  const progressPct = deployProgress && deployProgress.total > 0
    ? Math.round(((deployProgress.total - deployProgress.remaining) / deployProgress.total) * 100)
    : 0

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-800/50">
        <span className="text-sm font-semibold text-white">Deploy Model</span>
      </div>
      <div className="p-4 space-y-3">
        {/* Integration checkboxes */}
        <div className="space-y-2">
          <label className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">Integrations</label>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={config.reportsBuilder} onChange={e => toggle('reportsBuilder', e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 w-3.5 h-3.5" />
              <span className="text-zinc-300">FilterEngine + Reports Builder</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={config.dashboardTabs.pitcher} onChange={e => toggle('pitcher', e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 w-3.5 h-3.5" />
              <span className="text-zinc-300">Pitcher Dashboard Tab</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={config.dashboardTabs.hitter} onChange={e => toggle('hitter', e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 w-3.5 h-3.5" />
              <span className="text-zinc-300">Hitter Dashboard Tab</span>
            </label>
          </div>
        </div>

        {/* Category + Decimals */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-zinc-500 block mb-1">Category</label>
            <input type="text" value={config.category}
              onChange={e => onDeployConfigChange({ ...deployConfig, category: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:border-emerald-600 focus:outline-none" />
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 block mb-1">Decimal Places</label>
            <select value={config.format.decimals}
              onChange={e => onDeployConfigChange({ ...deployConfig, format: { decimals: Number(e.target.value) } })}
              className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none focus:border-emerald-600">
              {[0, 1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {/* Deploy progress */}
        {isDeploying && deployProgress && (
          <div>
            <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
              <span>Deploying...</span>
              <span>{progressPct}%</span>
            </div>
            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">
              {(deployProgress.total - deployProgress.remaining).toLocaleString()} / {deployProgress.total.toLocaleString()} rows
            </p>
          </div>
        )}

        {isFailed && deployError && (
          <div className="bg-red-900/20 border border-red-800/50 rounded px-3 py-2 text-[12px] text-red-400">
            {deployError}
          </div>
        )}

        {isDeployed && (
          <div className="bg-emerald-900/20 border border-emerald-800/50 rounded px-3 py-2 text-[12px] text-emerald-400">
            Model deployed successfully!
          </div>
        )}

        {/* Deploy button */}
        <button
          onClick={onDeploy}
          disabled={!modelId || isDeploying || isDeployed}
          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg text-sm font-semibold transition"
        >
          {isDeploying ? 'Deploying...' : isDeployed ? 'Deployed' : 'Deploy the Model!'}
        </button>
      </div>
    </div>
  )
}
