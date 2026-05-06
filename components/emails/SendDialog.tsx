'use client'

import { useState, useCallback } from 'react'
import { X, Send, Loader2, CheckCircle2, AlertCircle, Mail, Megaphone } from 'lucide-react'
import AudienceSelector from './AudienceSelector'

interface SendDialogProps {
  open: boolean
  onClose: () => void
  productId: string
  templateId: string
}

type Tab = 'test' | 'campaign'
type Status = 'idle' | 'loading' | 'success' | 'error'

export default function SendDialog({ open, onClose, productId, templateId }: SendDialogProps) {
  const [activeTab, setActiveTab] = useState<Tab>('test')

  // Test send state
  const [testEmail, setTestEmail] = useState('')
  const [testStatus, setTestStatus] = useState<Status>('idle')
  const [testError, setTestError] = useState('')

  // Campaign send state
  const [audienceIds, setAudienceIds] = useState<string[]>([])
  const [subjectOverride, setSubjectOverride] = useState('')
  const [campaignStatus, setCampaignStatus] = useState<Status>('idle')
  const [campaignError, setCampaignError] = useState('')

  const resetState = useCallback(() => {
    setTestStatus('idle')
    setTestError('')
    setCampaignStatus('idle')
    setCampaignError('')
  }, [])

  const handleClose = useCallback(() => {
    resetState()
    onClose()
  }, [onClose, resetState])

  const handleTestSend = useCallback(async () => {
    if (!testEmail.trim()) return

    setTestStatus('loading')
    setTestError('')

    try {
      const res = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          template_id: templateId,
          send_type: 'test',
          test_emails: [testEmail.trim()],
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Send failed (${res.status})`)
      }

      setTestStatus('success')
    } catch (err) {
      setTestStatus('error')
      setTestError(err instanceof Error ? err.message : 'Failed to send test email')
    }
  }, [testEmail, productId, templateId])

  const handleCampaignSend = useCallback(async () => {
    if (audienceIds.length === 0) return

    setCampaignStatus('loading')
    setCampaignError('')

    try {
      const res = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          template_id: templateId,
          send_type: 'campaign',
          audience_ids: audienceIds,
          subject_override: subjectOverride.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Send failed (${res.status})`)
      }

      setCampaignStatus('success')
    } catch (err) {
      setCampaignStatus('error')
      setCampaignError(err instanceof Error ? err.message : 'Failed to send campaign')
    }
  }, [audienceIds, subjectOverride, productId, templateId])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl
                     shadow-2xl pointer-events-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-200">Send Email</h2>
            <button
              onClick={handleClose}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-zinc-800">
            <button
              onClick={() => { setActiveTab('test'); resetState() }}
              className={`
                flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors
                border-b-2 -mb-px
                ${activeTab === 'test'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'}
              `}
            >
              <Mail className="w-3.5 h-3.5" />
              Test Send
            </button>
            <button
              onClick={() => { setActiveTab('campaign'); resetState() }}
              className={`
                flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors
                border-b-2 -mb-px
                ${activeTab === 'campaign'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'}
              `}
            >
              <Megaphone className="w-3.5 h-3.5" />
              Campaign Send
            </button>
          </div>

          {/* Body */}
          <div className="p-4">
            {activeTab === 'test' && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-zinc-400 mb-1.5 block">
                    Recipient Email
                  </label>
                  <input
                    type="email"
                    value={testEmail}
                    onChange={e => setTestEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={testStatus === 'loading'}
                    className="w-full px-3 py-2 rounded-md bg-zinc-800 border border-zinc-700
                               text-sm text-zinc-200 placeholder:text-zinc-600
                               focus:border-emerald-500 focus:outline-none
                               disabled:opacity-50"
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleTestSend()
                    }}
                  />
                </div>

                {/* Status messages */}
                {testStatus === 'success' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="text-xs text-emerald-300">
                      Test email sent successfully!
                    </span>
                  </div>
                )}

                {testStatus === 'error' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span className="text-xs text-red-300">{testError}</span>
                  </div>
                )}

                <button
                  onClick={handleTestSend}
                  disabled={!testEmail.trim() || testStatus === 'loading'}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5
                             rounded-md bg-emerald-600 text-white text-sm font-medium
                             hover:bg-emerald-500 transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testStatus === 'loading' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {testStatus === 'loading' ? 'Sending...' : 'Send Test Email'}
                </button>
              </div>
            )}

            {activeTab === 'campaign' && (
              <div className="space-y-4">
                {/* Audience selector */}
                <div>
                  <label className="text-xs text-zinc-400 mb-1.5 block">
                    Audiences
                  </label>
                  <AudienceSelector
                    productId={productId}
                    selectedIds={audienceIds}
                    onChange={setAudienceIds}
                  />
                </div>

                {/* Subject override */}
                <div>
                  <label className="text-xs text-zinc-400 mb-1.5 block">
                    Subject Override
                    <span className="text-zinc-600 ml-1">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={subjectOverride}
                    onChange={e => setSubjectOverride(e.target.value)}
                    placeholder="Leave blank to use template subject"
                    disabled={campaignStatus === 'loading'}
                    className="w-full px-3 py-2 rounded-md bg-zinc-800 border border-zinc-700
                               text-sm text-zinc-200 placeholder:text-zinc-600
                               focus:border-emerald-500 focus:outline-none
                               disabled:opacity-50"
                  />
                </div>

                {/* Status messages */}
                {campaignStatus === 'success' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="text-xs text-emerald-300">
                      Campaign queued successfully!
                    </span>
                  </div>
                )}

                {campaignStatus === 'error' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span className="text-xs text-red-300">{campaignError}</span>
                  </div>
                )}

                <button
                  onClick={handleCampaignSend}
                  disabled={audienceIds.length === 0 || campaignStatus === 'loading'}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5
                             rounded-md bg-emerald-600 text-white text-sm font-medium
                             hover:bg-emerald-500 transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {campaignStatus === 'loading' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Megaphone className="w-4 h-4" />
                  )}
                  {campaignStatus === 'loading'
                    ? 'Sending...'
                    : `Send to ${audienceIds.length} audience${audienceIds.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
