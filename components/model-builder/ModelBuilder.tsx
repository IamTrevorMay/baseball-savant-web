'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import ModelWindow from './ModelWindow'
import TestResults from './TestResults'
import DeployPanel from './DeployPanel'

interface Model {
  id: string
  name: string
  description: string | null
  formula: string
  column_name: string
  versions: { version: number; formula: string; created_at: string }[]
  current_version: number
  status: string
  deploy_config: any
  deploy_error: string | null
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface FormulaUpdate {
  formula: string
  name: string
  columnName: string
  description: string
}

function parseFormulaUpdates(text: string): FormulaUpdate | null {
  const match = text.match(/FORMULA_UPDATE:\s*(\{[^}]+\})/)
  if (!match) return null
  try { return JSON.parse(match[1]) } catch { return null }
}

export default function ModelBuilder() {
  // Model state
  const [models, setModels] = useState<Model[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string>('new')
  const [model, setModel] = useState<Partial<Model>>({
    name: '', formula: '', column_name: '', description: null,
    versions: [], current_version: 0, status: 'draft', deploy_config: {},
  })

  // Chat state
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  // Test state
  const [testResults, setTestResults] = useState<{ sampleRows: any[]; stats: any } | null>(null)
  const [testing, setTesting] = useState(false)

  // Deploy state
  const [deployProgress, setDeployProgress] = useState<{ remaining: number; total: number } | null>(null)
  const [deployError, setDeployError] = useState<string | null>(null)

  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { fetchModels() }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Cleanup poll on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function fetchModels() {
    const res = await fetch('/api/models')
    const data = await res.json()
    if (data.models) setModels(data.models)
  }

  function handleSelectModel(id: string) {
    setSelectedModelId(id)
    setMessages([])
    setTestResults(null)
    setDeployProgress(null)
    setDeployError(null)
    if (id === 'new') {
      setModel({ name: '', formula: '', column_name: '', description: null, versions: [], current_version: 0, status: 'draft', deploy_config: {} })
    } else {
      const m = models.find(m => m.id === id)
      if (m) setModel(m)
    }
  }

  function handleGo() {
    if (selectedModelId === 'new') {
      setModel({ name: '', formula: '', column_name: '', description: null, versions: [], current_version: 0, status: 'draft', deploy_config: {} })
      setMessages([])
      setTestResults(null)
    } else {
      const m = models.find(m => m.id === selectedModelId)
      if (m) setModel(m)
    }
  }

  async function saveModel(updates: Partial<Model>): Promise<Model | null> {
    const merged = { ...model, ...updates }
    if (model.id) {
      // Update
      const res = await fetch('/api/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: model.id, ...updates })
      })
      const data = await res.json()
      if (data.model) { setModel(data.model); fetchModels(); return data.model }
    } else {
      // Create
      if (!merged.name || !merged.formula || !merged.column_name) return null
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: merged.name,
          description: merged.description,
          formula: merged.formula,
          columnName: merged.column_name,
          deployConfig: merged.deploy_config || {},
        })
      })
      const data = await res.json()
      if (data.model) {
        setModel(data.model)
        setSelectedModelId(data.model.id)
        fetchModels()
        return data.model
      }
    }
    return null
  }

  async function send(text?: string) {
    const msg = text || input.trim()
    if (!msg || loading) return
    const userMsg: Message = { role: 'user', content: msg }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, mode: 'model-builder' })
      })
      const data = await res.json()
      const responseText = data.error ? `Error: ${data.error}` : data.response
      setMessages([...newMessages, { role: 'assistant', content: responseText }])

      // Check for FORMULA_UPDATE
      if (!data.error) {
        const update = parseFormulaUpdates(responseText)
        if (update) {
          const newModel = {
            ...model,
            formula: update.formula,
            name: update.name || model.name,
            column_name: update.columnName || model.column_name,
            description: update.description || model.description,
          }
          // Push version
          const versions = [...(model.versions || [])]
          const newVer = versions.length + 1
          versions.push({ version: newVer, formula: update.formula, created_at: new Date().toISOString() })
          newModel.versions = versions
          newModel.current_version = newVer
          setModel(newModel)

          // Auto-save if we have enough info
          if (newModel.name && newModel.formula && newModel.column_name) {
            await saveModel({
              name: newModel.name,
              formula: newModel.formula,
              column_name: newModel.column_name,
              description: newModel.description || undefined,
            } as any)
          }

          // Auto-test the formula
          runTest(update.formula)
        }
      }
    } catch (e: any) {
      setMessages([...newMessages, { role: 'assistant', content: `Error: ${e.message}` }])
    }
    setLoading(false)
  }

  async function runTest(formula?: string) {
    const f = formula || model.formula
    if (!f) return
    setTesting(true)
    try {
      const res = await fetch('/api/models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formula: f })
      })
      const data = await res.json()
      if (data.error) {
        setTestResults(null)
      } else {
        setTestResults({ sampleRows: data.sampleRows, stats: data.stats })
      }
    } catch {}
    setTesting(false)
  }

  function renderCurrent() {
    if (!model.formula) return
    const prompt = `Here is my current formula. Please analyze it and suggest improvements:\n\nFormula: ${model.formula}\nName: ${model.name}\nDescription: ${model.description || 'N/A'}`
    send(prompt)
  }

  async function handleDeploy() {
    if (!model.id) {
      // Need to save first
      const saved = await saveModel(model as any)
      if (!saved) return
    }

    const modelId = model.id
    setDeployError(null)
    setDeployProgress(null)

    // Save deploy config
    await saveModel({ deploy_config: model.deploy_config } as any)

    try {
      const res = await fetch('/api/models/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId })
      })
      const data = await res.json()
      if (data.error) { setDeployError(data.error); return }

      setModel(prev => ({ ...prev, status: 'deploying' }))

      if (data.status === 'deployed') {
        setModel(prev => ({ ...prev, status: 'deployed' }))
        fetchModels()
        return
      }

      setDeployProgress({ remaining: data.remaining, total: data.remaining })

      // Poll for progress
      pollRef.current = setInterval(async () => {
        try {
          const contRes = await fetch('/api/models/deploy/continue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId })
          })
          const contData = await contRes.json()
          if (contData.error) {
            setDeployError(contData.error)
            setModel(prev => ({ ...prev, status: 'failed' }))
            if (pollRef.current) clearInterval(pollRef.current)
            return
          }
          setDeployProgress({ remaining: contData.remaining, total: contData.total })
          if (contData.status === 'deployed') {
            setModel(prev => ({ ...prev, status: 'deployed' }))
            if (pollRef.current) clearInterval(pollRef.current)
            fetchModels()
          }
        } catch {
          if (pollRef.current) clearInterval(pollRef.current)
        }
      }, 2000)
    } catch (e: any) {
      setDeployError(e.message)
    }
  }

  function handleVersionChange(version: number) {
    const v = model.versions?.find(v => v.version === version)
    if (v) setModel(prev => ({ ...prev, formula: v.formula, current_version: version }))
  }

  // Chat message rendering (simplified from analyst page)
  function renderContent(text: string) {
    // Strip FORMULA_UPDATE blocks from display
    const cleaned = text.replace(/FORMULA_UPDATE:\s*\{[^}]+\}/g, '').trim()
    return cleaned.split('\n').map((line, i) => {
      if (line.startsWith('### ')) return <h3 key={i} className="text-sm font-bold text-white mt-2 mb-1">{line.slice(4)}</h3>
      if (line.startsWith('## ')) return <h2 key={i} className="text-base font-bold text-white mt-2 mb-1">{line.slice(3)}</h2>
      if (line.startsWith('- ')) return <div key={i} className="ml-3 flex gap-2 text-[12px]"><span className="text-emerald-500">&#8226;</span><span>{line.slice(2)}</span></div>
      if (line.startsWith('**') && line.endsWith('**')) return <div key={i} className="font-semibold text-white mt-2 text-[12px]">{line.slice(2, -2)}</div>
      if (line.trim() === '') return <div key={i} className="h-1" />
      return <p key={i} className="text-[12px] leading-relaxed">{line}</p>
    })
  }

  return (
    <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full px-4 py-4 gap-4 overflow-auto">
      {/* Selector Bar */}
      <div className="flex items-center gap-2">
        <select
          value={selectedModelId}
          onChange={e => handleSelectModel(e.target.value)}
          className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white focus:border-emerald-600 focus:outline-none"
        >
          <option value="new">+ Create New Model</option>
          {models.map(m => (
            <option key={m.id} value={m.id}>{m.name} ({m.status})</option>
          ))}
        </select>
        <button onClick={handleGo} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition">
          Go
        </button>
      </div>

      {/* Model Window */}
      <ModelWindow
        name={model.name || ''}
        formula={model.formula || ''}
        versions={model.versions || []}
        currentVersion={model.current_version || 0}
        onNameChange={name => setModel(prev => ({ ...prev, name }))}
        onVersionChange={handleVersionChange}
      />

      {/* Test Results */}
      {testing && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />
          <span className="text-sm text-zinc-400">Testing formula...</span>
        </div>
      )}
      {testResults && <TestResults sampleRows={testResults.sampleRows} stats={testResults.stats} />}

      {/* Chat Section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col min-h-[250px] max-h-[400px]">
        <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-800/50">
          <span className="text-sm font-semibold text-white">Model Builder Chat</span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <p className="text-zinc-600 text-sm text-center py-8">
              Describe the metric you want to build. The agent will help you create a formula.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
                m.role === 'user'
                  ? 'bg-emerald-700/30 border border-emerald-700/40 text-emerald-100 text-[12px]'
                  : 'bg-zinc-800 border border-zinc-700 text-zinc-300 text-[12px]'
              }`}>
                {m.role === 'assistant' ? renderContent(m.content) : <p>{m.content}</p>}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 text-zinc-500 text-[11px]">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{animationDelay:'0ms'}} />
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{animationDelay:'150ms'}} />
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{animationDelay:'300ms'}} />
                  </div>
                  <span>Building...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        {/* Input */}
        <div className="border-t border-zinc-800 px-3 py-2 flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Describe the metric you want to build..."
            rows={1}
            className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-[12px] text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none resize-none"
            style={{ minHeight: '36px', maxHeight: '80px' }}
          />
          {model.formula && (
            <button onClick={renderCurrent} disabled={loading}
              className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-300 rounded-lg text-[11px] font-medium transition whitespace-nowrap">
              Render Current
            </button>
          )}
          <button onClick={() => send()} disabled={loading || !input.trim()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg text-[12px] font-medium transition">
            Send
          </button>
        </div>
      </div>

      {/* Deploy Panel */}
      <DeployPanel
        modelId={model.id || null}
        modelName={model.name || ''}
        status={model.status || 'draft'}
        deployConfig={model.deploy_config || {}}
        onDeployConfigChange={config => setModel(prev => ({ ...prev, deploy_config: config }))}
        onDeploy={handleDeploy}
        deployProgress={deployProgress}
        deployError={deployError}
      />
    </div>
  )
}
