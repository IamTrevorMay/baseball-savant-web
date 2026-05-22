'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useDevice } from '@/lib/hooks/useDeviceContext'

interface Profile { id: string; full_name: string; title: string | null }
interface Channel { id: string; name: string; description: string | null; created_by: string; is_default: boolean; sort_order: number }
interface Message { id: string; channel_id: string; user_id: string; content: string; mentions: string[]; is_pinned: boolean; edited_at: string | null; created_at: string; profile: Profile }

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|@\w+(?:\s\w+)?)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-bold text-zinc-200">{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i} className="italic text-zinc-300">{part.slice(1, -1)}</em>
    if (part.startsWith('@')) return <span key={i} className="bg-sky-500/15 text-sky-400 px-1 rounded font-semibold">{part}</span>
    return part
  })
}

function formatContent(content: string): React.ReactNode {
  if (!content.includes('\n') && !/^[-•] /.test(content)) return formatInline(content)
  const lines = content.split('\n')
  const result: React.ReactNode[] = []
  let bulletItems: string[] = []
  const flushBullets = () => {
    if (bulletItems.length > 0) {
      result.push(<ul key={`ul-${result.length}`} className="list-disc list-inside my-1 text-zinc-300">{bulletItems.map((item, j) => <li key={j}>{formatInline(item)}</li>)}</ul>)
      bulletItems = []
    }
  }
  lines.forEach((line, i) => {
    const m = line.match(/^[-•] (.*)/)
    if (m) { bulletItems.push(m[1]) }
    else { flushBullets(); result.push(line.trim() === '' ? <div key={`l-${i}`} className="h-2" /> : <div key={`l-${i}`}>{formatInline(line)}</div>) }
  })
  flushBullets()
  return <>{result}</>
}

function groupMessages(msgs: Message[]) {
  const groups: { user: Profile; messages: Message[] }[] = []
  msgs.forEach((msg, i) => {
    const prev = i > 0 ? msgs[i - 1] : null
    const sameUser = prev && prev.user_id === msg.user_id
    const withinTime = prev && (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < 300000
    if (sameUser && withinTime) groups[groups.length - 1].messages.push(msg)
    else groups.push({ user: msg.profile, messages: [msg] })
  })
  return groups
}

function MessageRow({ msg, isAdmin, profileId, onPin, onEdit, onDelete }: {
  msg: Message; isAdmin: boolean; profileId: string; onPin: (id: string, pinned: boolean) => void; onEdit: (id: string, content: string) => void; onDelete: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(msg.content)
  const menuRef = useRef<HTMLDivElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)

  const isOwner = msg.user_id === profileId

  useEffect(() => {
    if (!menuOpen) return
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  useEffect(() => { if (editing && editRef.current) { editRef.current.focus(); editRef.current.selectionStart = editRef.current.value.length } }, [editing])

  return (
    <div
      className={`flex items-start gap-1.5 rounded-md -mx-1 px-1 py-0.5 ${hovered || menuOpen ? 'bg-zinc-800/30' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {editing ? (
        <div className="flex-1">
          <textarea
            ref={editRef}
            rows={1}
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (editContent.trim() && editContent.trim() !== msg.content) onEdit(msg.id, editContent); setEditing(false) }
              if (e.key === 'Escape') { setEditContent(msg.content); setEditing(false) }
            }}
            className="w-full bg-zinc-800/50 border border-sky-500/30 rounded-lg p-2 text-sm text-white outline-none resize-none"
          />
          <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-600">
            <span>Enter to save, Esc to cancel</span>
            <button onClick={() => { setEditContent(msg.content); setEditing(false) }} className="text-zinc-500 hover:text-zinc-300">Cancel</button>
            <button onClick={() => { if (editContent.trim() && editContent.trim() !== msg.content) onEdit(msg.id, editContent); setEditing(false) }} className="text-sky-400">Save</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 text-sm text-zinc-400 leading-relaxed break-words">
            {msg.is_pinned && <span className="mr-1">📌</span>}
            {formatContent(msg.content)}
            {msg.edited_at && <span className="text-[10px] text-zinc-600 ml-1">(edited)</span>}
          </div>
          <div className="relative shrink-0">
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
              className={`text-zinc-600 hover:text-zinc-400 text-xs px-1 transition ${hovered || menuOpen ? 'opacity-70' : 'opacity-0'}`}
            >⋯</button>
            {menuOpen && (
              <div ref={menuRef} className="absolute right-0 top-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg py-1 shadow-xl z-10 min-w-[120px]">
                {isOwner && <button onClick={() => { setEditContent(msg.content); setEditing(true); setMenuOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700/50">Edit</button>}
                {isAdmin && <button onClick={() => { onPin(msg.id, msg.is_pinned); setMenuOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700/50">{msg.is_pinned ? 'Unpin' : 'Pin'}</button>}
                <button onClick={() => { navigator.clipboard.writeText(msg.content); setMenuOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700/50">Copy</button>
                {(isAdmin || isOwner) && <button onClick={() => { onDelete(msg.id); setMenuOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-700/50">Delete</button>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function ChannelsPage() {
  const { isMobile } = useDevice()
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [channels, setChannels] = useState<Channel[]>([])
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [channelName, setChannelName] = useState('')
  const [channelDesc, setChannelDesc] = useState('')
  const [teamMembers, setTeamMembers] = useState<Profile[]>([])
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Init
  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: prof } = await supabase.from('profiles').select('id, full_name, title, role').eq('id', user.id).single()
      if (prof) {
        setProfile(prof as Profile)
        setIsAdmin(prof.role === 'owner' || prof.role === 'admin')
      }
      const [{ data: ch }, { data: tm }] = await Promise.all([
        supabase.from('work_channels').select('*').order('sort_order').order('is_default', { ascending: false }).order('name'),
        supabase.from('profiles').select('id, full_name, title'),
      ])
      setChannels(ch || [])
      setTeamMembers(tm || [])
      if (ch?.length) setActiveChannel(ch[0])
      setLoading(false)
    })()
  }, [])

  // Fetch messages
  const fetchMessages = useCallback(async (channelId: string) => {
    setLoadingMessages(true)
    const { data } = await supabase.from('work_channel_messages').select('*, profile:profiles(id, full_name, title)').eq('channel_id', channelId).order('created_at').limit(100)
    setMessages((data as Message[]) || [])
    setLoadingMessages(false)
  }, [])

  const fetchPinnedMessages = useCallback(async (channelId: string) => {
    const { data } = await supabase.from('work_channel_messages').select('*, profile:profiles(id, full_name, title)').eq('channel_id', channelId).eq('is_pinned', true).order('created_at', { ascending: false })
    setPinnedMessages((data as Message[]) || [])
  }, [])

  useEffect(() => {
    if (!activeChannel) return
    fetchMessages(activeChannel.id)
    fetchPinnedMessages(activeChannel.id)
  }, [activeChannel, fetchMessages, fetchPinnedMessages])

  // Realtime
  useEffect(() => {
    if (!activeChannel) return
    let mounted = true
    const channel = supabase
      .channel(`work-ch-${activeChannel.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'work_channel_messages', filter: `channel_id=eq.${activeChannel.id}` }, async (payload) => {
        const { data } = await supabase.from('work_channel_messages').select('*, profile:profiles(id, full_name, title)').eq('id', payload.new.id).single()
        if (data && mounted) setMessages(prev => [...prev, data as Message])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'work_channel_messages', filter: `channel_id=eq.${activeChannel.id}` }, (payload) => {
        if (!mounted) return
        setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, content: payload.new.content as string, edited_at: payload.new.edited_at as string, is_pinned: payload.new.is_pinned as boolean } : m))
        fetchPinnedMessages(activeChannel.id)
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'work_channel_messages', filter: `channel_id=eq.${activeChannel.id}` }, (payload) => {
        if (mounted) setMessages(prev => prev.filter(m => m.id !== payload.old.id))
      })
      .subscribe()
    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [activeChannel, fetchPinnedMessages])

  // Auto-scroll
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Auto-resize input
  useEffect(() => {
    if (inputRef.current) { inputRef.current.style.height = 'auto'; inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + 'px' }
  }, [newMessage])

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!newMessage.trim() || !activeChannel || !profile) return
    const mentionRegex = /@(\w+(?:\s\w+)?)/g
    const mentions: string[] = []
    let match
    while ((match = mentionRegex.exec(newMessage)) !== null) {
      const mentioned = teamMembers.find(m => m.full_name.toLowerCase().includes(match![1].toLowerCase()))
      if (mentioned) mentions.push(mentioned.id)
    }
    await supabase.from('work_channel_messages').insert({ channel_id: activeChannel.id, user_id: profile.id, content: newMessage.trim(), mentions })
    setNewMessage('')
    setShowMentions(false)
  }

  async function handleCreateChannel(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    const name = channelName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const { error } = await supabase.from('work_channels').insert({ name, description: channelDesc || null, created_by: profile.id })
    if (error) return
    setChannelName(''); setChannelDesc(''); setShowCreateChannel(false)
    const { data } = await supabase.from('work_channels').select('*').order('sort_order').order('name')
    setChannels(data || [])
  }

  async function handlePinMessage(id: string, isPinned: boolean) {
    await supabase.from('work_channel_messages').update({ is_pinned: !isPinned }).eq('id', id)
    if (activeChannel) fetchPinnedMessages(activeChannel.id)
  }

  async function handleEditMessage(id: string, content: string) {
    await supabase.from('work_channel_messages').update({ content, edited_at: new Date().toISOString() }).eq('id', id)
    setMessages(prev => prev.map(m => m.id === id ? { ...m, content, edited_at: new Date().toISOString() } : m))
  }

  async function handleDeleteMessage(id: string) {
    await supabase.from('work_channel_messages').delete().eq('id', id)
    setMessages(prev => prev.filter(m => m.id !== id))
    if (activeChannel) fetchPinnedMessages(activeChannel.id)
  }

  async function handleMoveChannel(channelId: string, direction: number) {
    const idx = channels.findIndex(c => c.id === channelId)
    const swapIdx = idx + direction
    if (swapIdx < 0 || swapIdx >= channels.length) return
    await supabase.from('work_channels').update({ sort_order: swapIdx }).eq('id', channels[idx].id)
    await supabase.from('work_channels').update({ sort_order: idx }).eq('id', channels[swapIdx].id)
    const { data } = await supabase.from('work_channels').select('*').order('sort_order').order('name')
    setChannels(data || [])
  }

  async function handleDeleteChannel(channelId: string) {
    if (!confirm('Delete this channel and all messages?')) return
    await supabase.from('work_channels').delete().eq('id', channelId)
    if (activeChannel?.id === channelId) setActiveChannel(null)
    const { data } = await supabase.from('work_channels').select('*').order('sort_order').order('name')
    setChannels(data || [])
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value
    setNewMessage(value)
    const lastAt = value.lastIndexOf('@')
    if (lastAt >= 0) {
      const after = value.substring(lastAt + 1)
      if ((!after.includes(' ') || after.split(' ').length <= 2) && !after.includes('\n')) { setShowMentions(true); setMentionFilter(after.toLowerCase()) }
      else setShowMentions(false)
    } else setShowMentions(false)
  }

  function handleMentionSelect(member: Profile) {
    const lastAt = newMessage.lastIndexOf('@')
    setNewMessage(newMessage.substring(0, lastAt) + `@${member.full_name} `)
    setShowMentions(false)
    inputRef.current?.focus()
  }

  const filteredMentions = teamMembers.filter(m => m.full_name.toLowerCase().includes(mentionFilter))
  const messageGroups = groupMessages(messages)

  if (loading) return <div className="flex items-center justify-center h-full text-zinc-500 text-sm">Loading...</div>

  return (
    <div className="flex h-full">
      {/* Channel sidebar */}
      <div className="w-60 min-w-[240px] border-r border-zinc-800 flex flex-col bg-zinc-900/50">
        <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-800">
          <h3 className="text-[13px] font-bold text-zinc-500 uppercase tracking-wide">Channels</h3>
          <button onClick={() => setShowCreateChannel(!showCreateChannel)} className="w-6 h-6 flex items-center justify-center rounded-md bg-zinc-800 text-zinc-500 text-sm hover:text-zinc-300 transition">+</button>
        </div>

        {showCreateChannel && (
          <form onSubmit={handleCreateChannel} className="p-3 border-b border-zinc-800 flex flex-col gap-2">
            <input value={channelName} onChange={e => setChannelName(e.target.value)} placeholder="channel-name" required className="bg-zinc-800/50 border border-zinc-700 rounded-md px-2.5 py-1.5 text-[13px] text-white outline-none" />
            <input value={channelDesc} onChange={e => setChannelDesc(e.target.value)} placeholder="Description (optional)" className="bg-zinc-800/50 border border-zinc-700 rounded-md px-2.5 py-1.5 text-[13px] text-white outline-none" />
            <button type="submit" className="bg-sky-500 text-white rounded-md py-1.5 text-xs font-semibold hover:bg-sky-400 transition">Create</button>
          </form>
        )}

        <div className="flex-1 overflow-y-auto p-2">
          {channels.map((ch, idx) => (
            <div key={ch.id} className="flex items-center group">
              <button
                onClick={() => setActiveChannel(ch)}
                className={`flex items-center gap-2 flex-1 px-2.5 py-1.5 rounded-lg text-sm transition ${activeChannel?.id === ch.id ? 'bg-sky-500/12 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
              >
                <span className="text-base font-bold opacity-50">#</span>
                <span className="truncate">{ch.name}</span>
              </button>
              {isAdmin && (
                <div className="hidden group-hover:flex items-center gap-0">
                  <button onClick={() => handleMoveChannel(ch.id, -1)} disabled={idx === 0} className="text-[10px] text-zinc-600 hover:text-zinc-400 px-0.5 disabled:opacity-20">↑</button>
                  <button onClick={() => handleMoveChannel(ch.id, 1)} disabled={idx === channels.length - 1} className="text-[10px] text-zinc-600 hover:text-zinc-400 px-0.5 disabled:opacity-20">↓</button>
                  {!ch.is_default && <button onClick={() => handleDeleteChannel(ch.id)} className="text-[10px] text-red-500/50 hover:text-red-400 px-0.5">✕</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeChannel ? (
          <>
            <div className="flex items-center gap-2.5 px-6 py-3 border-b border-zinc-800 shrink-0">
              <span className="text-xl font-bold text-zinc-600">#</span>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-zinc-200">{activeChannel.name}</h2>
                {activeChannel.description && <p className="text-xs text-zinc-500">{activeChannel.description}</p>}
              </div>
            </div>

            {/* Pinned */}
            {pinnedMessages.length > 0 && (
              <div className="bg-amber-500/5 border-b border-amber-500/10 px-4 py-2 max-h-[200px] overflow-y-auto">
                <div className="text-xs font-bold text-amber-400 mb-1.5">📌 Pinned ({pinnedMessages.length})</div>
                {pinnedMessages.map(msg => (
                  <div key={msg.id} className="bg-zinc-800/30 border border-amber-500/10 rounded-lg px-3 py-2 mb-1.5">
                    <div className="flex gap-2 items-center mb-0.5">
                      <span className="text-xs font-semibold text-zinc-300">{msg.profile?.full_name}</span>
                      <span className="text-[10px] text-zinc-600">{new Date(msg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div className="text-[13px] text-zinc-400 leading-snug">{formatContent(msg.content)}</div>
                    {isAdmin && <button onClick={() => handlePinMessage(msg.id, true)} className="text-[10px] text-zinc-600 hover:text-zinc-400 mt-1">Unpin</button>}
                  </div>
                ))}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loadingMessages ? (
                <p className="text-center text-zinc-500 text-sm pt-10">Loading messages...</p>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="text-5xl font-bold text-sky-500/20 bg-sky-500/5 w-20 h-20 rounded-2xl flex items-center justify-center mb-4">#</div>
                  <h3 className="text-lg font-semibold text-zinc-200 mb-1">Welcome to #{activeChannel.name}</h3>
                  <p className="text-sm text-zinc-500">Start the conversation!</p>
                </div>
              ) : (
                messageGroups.map((group, gi) => (
                  <div key={gi} className="flex gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                      {group.user?.full_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-zinc-200">{group.user?.full_name || 'Unknown'}</span>
                        <span className="text-[11px] text-zinc-600">{formatTime(group.messages[0].created_at)}</span>
                      </div>
                      {group.messages.map(msg => (
                        <MessageRow key={msg.id} msg={msg} isAdmin={isAdmin} profileId={profile?.id || ''} onPin={handlePinMessage} onEdit={handleEditMessage} onDelete={handleDeleteMessage} />
                      ))}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-6 pb-4 pt-2 relative shrink-0">
              {showMentions && filteredMentions.length > 0 && (
                <div className="absolute bottom-full left-6 right-6 bg-zinc-800 border border-zinc-700 rounded-xl py-1.5 shadow-xl mb-1 max-h-[200px] overflow-y-auto z-10">
                  {filteredMentions.slice(0, 6).map(m => (
                    <button key={m.id} onClick={() => handleMentionSelect(m)} className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left hover:bg-zinc-700/50 transition">
                      <div className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center text-xs font-semibold text-sky-400">{m.full_name.charAt(0)}</div>
                      <div>
                        <div className="text-[13px] font-semibold text-zinc-200">{m.full_name}</div>
                        <div className="text-[11px] text-zinc-500">{m.title || 'Team Member'}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={newMessage}
                  onChange={handleInputChange}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e) } }}
                  placeholder={`Message #${activeChannel.name}... (@ to mention)`}
                  className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none resize-none min-h-[42px] max-h-[150px]"
                />
                <button type="submit" disabled={!newMessage.trim()} className="w-10 h-10 flex items-center justify-center bg-sky-500 rounded-xl text-white hover:bg-sky-400 disabled:opacity-40 transition">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z" /></svg>
                </button>
              </form>
              <div className="text-[11px] text-zinc-600 mt-1 px-1">
                <strong>**bold**</strong>  <em>*italic*</em>  - bullet  |  Shift+Enter for new line
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-500">Select a channel to start chatting</div>
        )}
      </div>
    </div>
  )
}
