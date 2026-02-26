'use client'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import GenerateReportModal from './GenerateReportModal'

interface Props {
  playerId: number
  playerName: string
  playerData: any[]
  dashboardType: 'pitching' | 'hitting'
}

export default function GenerateReportDropdown({ playerId, playerName, playerData, dashboardType }: Props) {
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([])
  const [modalTemplate, setModalTemplate] = useState<{ id: string; name: string } | null>(null)
  const [showModal, setShowModal] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleOpen() {
    setOpen(!open)
    if (!open) {
      const { data } = await supabase
        .from('report_templates')
        .select('id, name, subject_type')
        .eq('subject_type', dashboardType)
        .order('created_at', { ascending: false })
      setTemplates(data || [])
    }
  }

  function selectTemplate(t: { id: string; name: string }) {
    setModalTemplate(t)
    setShowModal(true)
    setOpen(false)
  }

  function openBlank() {
    setModalTemplate(null)
    setShowModal(true)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={handleOpen}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition flex items-center gap-1.5">
        Generate Report
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 w-56 overflow-hidden">
          {templates.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-wider font-semibold bg-zinc-800/80">Templates</div>
              {templates.map(t => (
                <button key={t.id} onClick={() => selectTemplate(t)}
                  className="w-full text-left px-3 py-2 text-[12px] text-zinc-300 hover:bg-zinc-700 hover:text-white transition border-b border-zinc-700/30 last:border-0">
                  {t.name}
                </button>
              ))}
              <div className="border-t border-zinc-700" />
            </>
          )}
          <button onClick={openBlank}
            className="w-full text-left px-3 py-2 text-[12px] text-zinc-400 hover:bg-zinc-700 hover:text-white transition">
            Blank Report
          </button>
        </div>
      )}

      {showModal && (
        <GenerateReportModal
          playerId={playerId}
          playerName={playerName}
          playerData={playerData}
          dashboardType={dashboardType}
          templateId={modalTemplate?.id || null}
          templateName={modalTemplate?.name || null}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
