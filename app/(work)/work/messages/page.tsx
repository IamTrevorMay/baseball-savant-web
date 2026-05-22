'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useDevice } from '@/lib/hooks/useDeviceContext'

interface Profile { id: string; full_name: string; title: string | null }
interface Participant { user_id: string; profile: Profile }
interface Conversation { id: string; name: string | null; is_group: boolean; created_by: string; created_at: string; participants: Participant[]; lastMessage?: { content: string; created_at: string; user_id: string } }
interface DirectMessage { id: string; conversation_id: string; user_id: string; content: string; created_at: string; profile: Profile }

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|#\w+(?:-\w+)*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-bold text-zinc-200">{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i} className="italic text-zinc-300">{part.slice(1, -1)}</em>
    if (part.startsWith('#')) return <span key={i} className="bg-sky-500/15 text-sky-400 px-1 rounded font-semibold">{part}</span>
    return part
  })
}

export default function MessagesPage() {
  const { isMobile, isLoading: deviceLoading } = useDevice()
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [teamMembers, setTeamMembers] = useState<Profile[]>([])
  const [showNewConvo, setShowNewConvo] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')
  const [searchUsers, setSearchUsers] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Init
  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: prof } = await supabase.from('profiles').select('id, full_name, title').eq('id', user.id).single()
      if (prof) setProfile(prof as Profile)
      const { data: tm } = await supabase.from('profiles').select('id, full_name, title').neq('id', user.id)
      setTeamMembers(tm || [])
      setLoading(false)
    })()
  }, [])

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!profile?.id) return
    const { data: participantData } = await supabase
      .from('work_conversation_participants')
      .select('conversation_id')
      .eq('user_id', profile.id)
    if (!participantData?.length) { setConversations([]); return }

    const convoIds = participantData.map(p => p.conversation_id)
    const { data: convos } = await supabase
      .from('work_conversations')
      .select('*')
      .in('id', convoIds)
      .order('created_at', { ascending: false })

    const enriched = await Promise.all((convos || []).map(async (convo) => {
      const { data: participants } = await supabase
        .from('work_conversation_participants')
        .select('user_id, profile:profiles(id, full_name, title)')
        .eq('conversation_id', convo.id)

      const { data: lastMsg } = await supabase
        .from('work_direct_messages')
        .select('content, created_at, user_id')
        .eq('conversation_id', convo.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      return { ...convo, participants: participants || [], lastMessage: lastMsg } as Conversation
    }))

    enriched.sort((a, b) => {
      const aTime = a.lastMessage?.created_at || a.created_at
      const bTime = b.lastMessage?.created_at || b.created_at
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })

    setConversations(enriched)
  }, [profile?.id])

  useEffect(() => { if (profile?.id) fetchConversations() }, [profile?.id, fetchConversations])

  // Fetch messages for active conversation
  const fetchMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true)
    const { data } = await supabase
      .from('work_direct_messages')
      .select('*, profile:profiles(id, full_name, title)')
      .eq('conversation_id', conversationId)
      .order('created_at')
      .limit(100)
    setMessages((data as DirectMessage[]) || [])
    setLoadingMessages(false)
  }, [])

  useEffect(() => {
    if (!activeConversation) return
    fetchMessages(activeConversation.id)
  }, [activeConversation, fetchMessages])

  // Realtime
  useEffect(() => {
    if (!activeConversation) return
    let mounted = true
    const channel = supabase
      .channel(`work-dm-${activeConversation.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'work_direct_messages',
        filter: `conversation_id=eq.${activeConversation.id}`,
      }, async (payload) => {
        const { data } = await supabase
          .from('work_direct_messages')
          .select('*, profile:profiles(id, full_name, title)')
          .eq('id', payload.new.id)
          .single()
        if (data && mounted) setMessages(prev => [...prev, data as DirectMessage])
      })
      .subscribe()
    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [activeConversation?.id])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!newMessage.trim() || !activeConversation || !profile?.id) return
    await supabase.from('work_direct_messages').insert({
      conversation_id: activeConversation.id,
      user_id: profile.id,
      content: newMessage.trim(),
    })
    setNewMessage('')
    inputRef.current?.focus()
  }

  async function handleStartConversation() {
    if (selectedUsers.length === 0 || !profile?.id) return
    try {
      if (selectedUsers.length === 1 && !groupName) {
        const { data, error } = await supabase.rpc('work_get_or_create_dm', { other_user_id: selectedUsers[0] })
        if (error) throw error
        await fetchConversations()
        const { data: convo } = await supabase.from('work_conversations').select('*').eq('id', data).single()
        if (convo) {
          const { data: participants } = await supabase
            .from('work_conversation_participants')
            .select('user_id, profile:profiles(id, full_name, title)')
            .eq('conversation_id', convo.id)
          setActiveConversation({ ...convo, participants: participants || [] } as Conversation)
        }
      } else {
        const { data: convo, error } = await supabase
          .from('work_conversations')
          .insert({ name: groupName || null, is_group: selectedUsers.length > 1, created_by: profile.id })
          .select()
          .single()
        if (error) throw error
        const participants = [profile.id, ...selectedUsers].map(uid => ({ conversation_id: convo.id, user_id: uid }))
        await supabase.from('work_conversation_participants').insert(participants)
        await fetchConversations()
        setActiveConversation({ ...convo, participants: [] } as unknown as Conversation)
      }
      setShowNewConvo(false)
      setSelectedUsers([])
      setGroupName('')
      setSearchUsers('')
    } catch (err) {
      console.error('Error creating conversation:', err)
    }
  }

  function getConvoDisplayName(convo: Conversation) {
    if (convo.name) return convo.name
    const others = convo.participants
      ?.filter(p => p.user_id !== profile?.id)
      .map(p => p.profile?.full_name || 'Unknown')
    return others?.join(', ') || 'Conversation'
  }

  function getConvoInitial(convo: Conversation) {
    return getConvoDisplayName(convo).charAt(0).toUpperCase()
  }

  function toggleUserSelection(userId: string) {
    setSelectedUsers(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId])
  }

  const filteredTeam = teamMembers.filter(m => m.full_name.toLowerCase().includes(searchUsers.toLowerCase()))

  if (deviceLoading || loading) return <div className="flex items-center justify-center h-full text-zinc-500">Loading...</div>

  // Mobile view: show conversation list or chat, not both
  if (isMobile) {
    if (activeConversation) {
      return (
        <div className="flex flex-col h-[calc(100vh-7rem)]">
          {/* Mobile header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
            <button onClick={() => setActiveConversation(null)} className="text-zinc-400 hover:text-zinc-200">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-400 flex items-center justify-center text-sm font-bold text-white shrink-0">
              {activeConversation.is_group ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" /></svg>
              ) : getConvoInitial(activeConversation)}
            </div>
            <h2 className="text-sm font-semibold text-zinc-200 truncate">{getConvoDisplayName(activeConversation)}</h2>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {loadingMessages ? (
              <p className="text-center text-zinc-500 pt-10">Loading...</p>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-zinc-500">Start the conversation!</div>
            ) : (
              messages.map((msg, i) => {
                const isOwn = msg.user_id === profile?.id
                const showAvatar = i === 0 || messages[i - 1].user_id !== msg.user_id
                return (
                  <div key={msg.id} className={`flex gap-2 mb-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    {!isOwn && showAvatar && (
                      <div className="w-7 h-7 rounded-md bg-violet-500/20 flex items-center justify-center text-[11px] font-semibold text-violet-400 shrink-0 mt-auto">
                        {msg.profile?.full_name?.charAt(0)}
                      </div>
                    )}
                    {!isOwn && !showAvatar && <div className="w-7" />}
                    <div className={`max-w-[75%] px-3 py-2 rounded-xl border ${isOwn ? 'bg-violet-500/20 border-violet-500/15' : 'bg-zinc-800/50 border-zinc-700/50'}`}>
                      {showAvatar && !isOwn && <div className="text-[11px] font-semibold text-violet-400 mb-0.5">{msg.profile?.full_name}</div>}
                      <div className="text-[13px] text-zinc-200 leading-relaxed break-words">{formatInline(msg.content)}</div>
                      <div className="text-[10px] text-zinc-500 mt-1">{formatTime(msg.created_at)}</div>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSendMessage} className="flex gap-2 px-4 py-3 border-t border-zinc-800 shrink-0">
            <input
              ref={inputRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-3 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-violet-500/50"
            />
            <button type="submit" disabled={!newMessage.trim()} className="w-10 h-10 flex items-center justify-center bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-lg text-white transition">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z" /></svg>
            </button>
          </form>
        </div>
      )
    }

    // Mobile conversation list
    return (
      <div className="flex flex-col h-[calc(100vh-7rem)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <h3 className="text-base font-semibold text-zinc-200">Messages</h3>
          <button onClick={() => setShowNewConvo(!showNewConvo)} className="w-7 h-7 flex items-center justify-center bg-violet-500/15 text-violet-400 rounded-lg text-sm">
            {showNewConvo ? '✕' : '+'}
          </button>
        </div>
        {showNewConvo && renderNewConvoPanel()}
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.map(convo => renderConvoItem(convo))}
          {conversations.length === 0 && !showNewConvo && (
            <div className="text-center py-10">
              <p className="text-zinc-400 text-sm">No conversations yet.</p>
              <p className="text-zinc-500 text-xs mt-1">Tap + to start a conversation</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Desktop
  function renderNewConvoPanel() {
    return (
      <div className="p-3 border-b border-zinc-800 flex flex-col gap-2">
        <input
          value={searchUsers}
          onChange={(e) => setSearchUsers(e.target.value)}
          placeholder="Search people..."
          className="px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-[13px] text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-violet-500/50"
        />
        {selectedUsers.length > 1 && (
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name (optional)"
            className="px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-[13px] text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-violet-500/50"
          />
        )}
        <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
          {filteredTeam.map(m => (
            <button
              key={m.id}
              onClick={() => toggleUserSelection(m.id)}
              className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left transition ${selectedUsers.includes(m.id) ? 'bg-violet-500/12' : 'hover:bg-zinc-800/60'}`}
            >
              <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center text-[12px] font-semibold text-violet-400 shrink-0">
                {m.full_name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-zinc-200 truncate">{m.full_name}</div>
                <div className="text-[11px] text-zinc-500 truncate">{m.title || 'Team Member'}</div>
              </div>
              {selectedUsers.includes(m.id) && <span className="text-violet-400 font-bold text-sm">✓</span>}
            </button>
          ))}
        </div>
        {selectedUsers.length > 0 && (
          <button onClick={handleStartConversation} className="px-3 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-[13px] font-semibold text-white transition">
            {selectedUsers.length === 1 ? 'Start DM' : `Start Group (${selectedUsers.length})`}
          </button>
        )}
      </div>
    )
  }

  function renderConvoItem(convo: Conversation) {
    return (
      <button
        key={convo.id}
        onClick={() => setActiveConversation(convo)}
        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition mb-0.5 ${activeConversation?.id === convo.id ? 'bg-violet-500/10' : 'hover:bg-zinc-800/60'}`}
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-400 flex items-center justify-center text-sm font-bold text-white shrink-0">
          {convo.is_group ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" /></svg>
          ) : getConvoInitial(convo)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-zinc-200 truncate">{getConvoDisplayName(convo)}</div>
          {convo.lastMessage && (
            <div className="text-[12px] text-zinc-500 truncate mt-0.5">
              {convo.lastMessage.content.substring(0, 40)}{convo.lastMessage.content.length > 40 ? '...' : ''}
            </div>
          )}
        </div>
        {convo.lastMessage && <span className="text-[11px] text-zinc-600 shrink-0">{formatTime(convo.lastMessage.created_at)}</span>}
      </button>
    )
  }

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      {/* Conversations Sidebar */}
      <div className="w-80 min-w-[320px] border-r border-zinc-800 flex flex-col bg-zinc-900/30">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800 shrink-0">
          <h3 className="text-base font-semibold text-zinc-200">Messages</h3>
          <button onClick={() => setShowNewConvo(!showNewConvo)} className="w-7 h-7 flex items-center justify-center bg-violet-500/15 hover:bg-violet-500/25 text-violet-400 rounded-lg text-sm transition">
            {showNewConvo ? '✕' : '+'}
          </button>
        </div>

        {showNewConvo && renderNewConvoPanel()}

        <div className="flex-1 overflow-y-auto p-1.5">
          {conversations.map(convo => renderConvoItem(convo))}
          {conversations.length === 0 && !showNewConvo && (
            <div className="text-center py-10">
              <p className="text-zinc-400 text-sm">No conversations yet.</p>
              <p className="text-zinc-500 text-xs mt-1">Click + to start a conversation</p>
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeConversation ? (
          <>
            <div className="flex items-center gap-3 px-6 py-3.5 border-b border-zinc-800 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-violet-400 flex items-center justify-center text-sm font-bold text-white">
                {activeConversation.is_group ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" /></svg>
                ) : getConvoInitial(activeConversation)}
              </div>
              <h2 className="text-base font-semibold text-zinc-200">{getConvoDisplayName(activeConversation)}</h2>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loadingMessages ? (
                <p className="text-center text-zinc-500 pt-10">Loading...</p>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-zinc-500">Start the conversation!</div>
              ) : (
                messages.map((msg, i) => {
                  const isOwn = msg.user_id === profile?.id
                  const showAvatar = i === 0 || messages[i - 1].user_id !== msg.user_id
                  return (
                    <div key={msg.id} className={`flex gap-2 mb-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      {!isOwn && showAvatar && (
                        <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center text-[12px] font-semibold text-violet-400 shrink-0 mt-auto">
                          {msg.profile?.full_name?.charAt(0)}
                        </div>
                      )}
                      {!isOwn && !showAvatar && <div className="w-8" />}
                      <div className={`max-w-[65%] px-3.5 py-2.5 rounded-xl border ${isOwn ? 'bg-violet-500/20 border-violet-500/15' : 'bg-zinc-800/50 border-zinc-700/50'}`}>
                        {showAvatar && !isOwn && <div className="text-[12px] font-semibold text-violet-400 mb-0.5">{msg.profile?.full_name}</div>}
                        <div className="text-[14px] text-zinc-200 leading-relaxed break-words">{formatInline(msg.content)}</div>
                        <div className="text-[10px] text-zinc-500 mt-1">{formatTime(msg.created_at)}</div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="flex gap-2 px-6 py-3.5 border-t border-zinc-800 shrink-0">
              <input
                ref={inputRef}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-violet-500/50 transition"
              />
              <button type="submit" disabled={!newMessage.trim()} className="w-11 h-11 flex items-center justify-center bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-xl text-white transition">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z" /></svg>
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-zinc-700 mb-3">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <h3 className="text-lg font-semibold text-zinc-200 mb-1">Your Messages</h3>
            <p className="text-sm text-zinc-500">Select a conversation or start a new one</p>
          </div>
        )}
      </div>
    </div>
  )
}
