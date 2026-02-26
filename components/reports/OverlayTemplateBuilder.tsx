'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { OverlayRule } from '@/lib/overlayEngine'

const CONDITION_FIELDS = [
  { key: 'pitch_name', label: 'Pitch Name' },
  { key: 'pitch_type', label: 'Pitch Code' },
]

const FILTER_FIELDS = [
  { key: 'release_speed', label: 'Velocity' },
  { key: 'pfx_z_in', label: 'Induced Vertical Break (in)' },
  { key: 'pfx_x_in', label: 'Horizontal Movement (in)' },
  { key: 'release_spin_rate', label: 'Spin Rate' },
  { key: 'vaa', label: 'Vertical Approach Angle' },
  { key: 'release_extension', label: 'Extension' },
]

interface OverlayTemplate {
  id: string
  name: string
  description: string | null
  rules: OverlayRule[]
}

interface Props {
  onClose: () => void
  onSaved: () => void
}

function newRule(): OverlayRule {
  return {
    id: 'r_' + Date.now(),
    condition: { field: 'pitch_name', operator: 'in', values: [] },
    filters: [{ field: 'release_speed', metric: 'avg', offset: 2 }],
  }
}

export default function OverlayTemplateBuilder({ onClose, onSaved }: Props) {
  const [templates, setTemplates] = useState<OverlayTemplate[]>([])
  const [selected, setSelected] = useState<OverlayTemplate | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rules, setRules] = useState<OverlayRule[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadTemplates() }, [])

  async function loadTemplates() {
    const { data } = await supabase.from('overlay_templates').select('*').order('created_at', { ascending: false })
    if (data) setTemplates(data as OverlayTemplate[])
  }

  function selectTemplate(t: OverlayTemplate) {
    setSelected(t)
    setName(t.name)
    setDescription(t.description || '')
    setRules(t.rules || [])
  }

  function newTemplate() {
    setSelected(null)
    setName('')
    setDescription('')
    setRules([newRule()])
  }

  function addRule() {
    setRules([...rules, newRule()])
  }

  function removeRule(id: string) {
    setRules(rules.filter(r => r.id !== id))
  }

  function updateRule(id: string, updates: Partial<OverlayRule>) {
    setRules(rules.map(r => r.id === id ? { ...r, ...updates } : r))
  }

  function updateCondition(ruleId: string, field: string, values: string[]) {
    setRules(rules.map(r => r.id === ruleId ? {
      ...r, condition: { ...r.condition, field, values }
    } : r))
  }

  function addFilter(ruleId: string) {
    setRules(rules.map(r => r.id === ruleId ? {
      ...r, filters: [...r.filters, { field: 'release_speed', metric: 'avg' as const, offset: 2 }]
    } : r))
  }

  function removeFilter(ruleId: string, idx: number) {
    setRules(rules.map(r => r.id === ruleId ? {
      ...r, filters: r.filters.filter((_, i) => i !== idx)
    } : r))
  }

  function updateFilter(ruleId: string, idx: number, updates: Partial<OverlayRule['filters'][0]>) {
    setRules(rules.map(r => r.id === ruleId ? {
      ...r, filters: r.filters.map((f, i) => i === idx ? { ...f, ...updates } : f)
    } : r))
  }

  async function save() {
    if (!name.trim() || saving) return
    setSaving(true)
    if (selected) {
      await supabase.from('overlay_templates').update({
        name: name.trim(),
        description: description.trim() || null,
        rules,
      }).eq('id', selected.id)
    } else {
      await supabase.from('overlay_templates').insert({
        name: name.trim(),
        description: description.trim() || null,
        rules,
      })
    }
    setSaving(false)
    await loadTemplates()
    onSaved()
  }

  async function deleteTemplate() {
    if (!selected) return
    await supabase.from('overlay_templates').delete().eq('id', selected.id)
    setSelected(null)
    setName('')
    setDescription('')
    setRules([])
    await loadTemplates()
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[800px] max-h-[85vh] flex overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Left: Template List */}
        <div className="w-56 border-r border-zinc-800 flex flex-col shrink-0">
          <div className="px-3 py-3 border-b border-zinc-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Modifiers</h3>
            <button onClick={newTemplate} className="text-[10px] text-emerald-400 hover:text-emerald-300 transition">+ New</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {templates.map(t => (
              <button key={t.id} onClick={() => selectTemplate(t)}
                className={`w-full text-left px-3 py-2 text-[12px] border-b border-zinc-800/50 transition ${
                  selected?.id === t.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                }`}>
                <div className="font-medium">{t.name}</div>
                {t.description && <div className="text-[10px] text-zinc-600 mt-0.5 truncate">{t.description}</div>}
              </button>
            ))}
            {templates.length === 0 && (
              <div className="px-3 py-4 text-[11px] text-zinc-600 text-center">No modifier templates yet</div>
            )}
          </div>
        </div>

        {/* Right: Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              {selected ? 'Edit Modifier' : name ? 'New Modifier' : 'Modifier Builder'}
            </h3>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition text-lg">&times;</button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {/* Name + Description */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Name</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Fastball Stuff Match"
                  className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-[12px] text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Description</label>
                <input value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Optional description..."
                  className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-[12px] text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none" />
              </div>
            </div>

            {/* Rules */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Rules</label>
                <button onClick={addRule} className="text-[10px] text-emerald-400 hover:text-emerald-300 transition">+ Add Rule</button>
              </div>

              {rules.map((rule, ri) => (
                <div key={rule.id} className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 mb-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-zinc-500 font-medium">Rule {ri + 1}</span>
                    <button onClick={() => removeRule(rule.id)} className="text-[10px] text-zinc-600 hover:text-red-400 transition">&times; Remove</button>
                  </div>

                  {/* Condition */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] text-zinc-500 w-16">When</span>
                    <select value={rule.condition.field}
                      onChange={e => updateCondition(rule.id, e.target.value, rule.condition.values)}
                      className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none">
                      {CONDITION_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    <span className="text-[10px] text-zinc-500">is</span>
                    <input
                      value={rule.condition.values.join(', ')}
                      onChange={e => updateCondition(rule.id, rule.condition.field, e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                      placeholder="e.g. 4-Seam Fastball, Sinker"
                      className="flex-1 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-[11px] text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none" />
                  </div>

                  {/* Filters */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-500 w-16">Filters</span>
                      <button onClick={() => addFilter(rule.id)} className="text-[9px] text-emerald-400 hover:text-emerald-300 transition">+ Add</button>
                    </div>
                    {rule.filters.map((f, fi) => (
                      <div key={fi} className="flex items-center gap-2 ml-16">
                        <select value={f.field}
                          onChange={e => updateFilter(rule.id, fi, { field: e.target.value })}
                          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[10px] text-white focus:outline-none">
                          {FILTER_FIELDS.map(ff => <option key={ff.key} value={ff.key}>{ff.label}</option>)}
                        </select>
                        <span className="text-[10px] text-zinc-500">avg</span>
                        <span className="text-[10px] text-zinc-500">&plusmn;</span>
                        <input type="number" value={f.offset}
                          onChange={e => updateFilter(rule.id, fi, { offset: Number(e.target.value) || 0 })}
                          className="w-14 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-[10px] text-white focus:outline-none text-center" />
                        {rule.filters.length > 1 && (
                          <button onClick={() => removeFilter(rule.id, fi)} className="text-[9px] text-zinc-600 hover:text-red-400 transition">&times;</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {rules.length === 0 && (
                <div className="text-center py-6 text-[11px] text-zinc-600">
                  No rules yet. Click &quot;+ Add Rule&quot; to create one.
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between">
            {selected ? (
              <button onClick={deleteTemplate} className="text-[11px] text-red-400 hover:text-red-300 transition">Delete</button>
            ) : <div />}
            <div className="flex gap-2">
              <button onClick={onClose} className="px-3 py-1.5 bg-zinc-800 text-zinc-400 rounded text-[11px] hover:text-white transition">Cancel</button>
              <button onClick={save} disabled={!name.trim() || saving}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded text-[11px] hover:bg-emerald-500 transition disabled:opacity-50">
                {saving ? 'Saving...' : selected ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
