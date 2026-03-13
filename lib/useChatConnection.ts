'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { ChatMessage, ChatMessagePart, Notification } from './widgetTypes'

interface ChatConnectionOptions {
  twitchChannel: string
  youtubeVideoId: string
  connected: boolean
  onMessage: (msg: ChatMessage) => void
  onBatch: (msgs: ChatMessage[]) => void
  onNotification: (notif: Notification) => void
  onUsernameStackUpdate: (name: string) => void
}

// Parse Twitch IRC message tags
function parseTwitchTags(raw: string): Record<string, string> {
  const tags: Record<string, string> = {}
  if (!raw.startsWith('@')) return tags
  const tagStr = raw.slice(1, raw.indexOf(' '))
  for (const pair of tagStr.split(';')) {
    const [k, v] = pair.split('=')
    if (k) tags[k] = v || ''
  }
  return tags
}

// Parse Twitch emotes tag into positions
function parseTwitchEmotes(emotesTag: string, text: string): ChatMessagePart[] {
  if (!emotesTag) return [{ type: 'text', text }]

  const positions: { start: number; end: number; id: string }[] = []
  for (const emote of emotesTag.split('/')) {
    const [id, rangesStr] = emote.split(':')
    if (!rangesStr) continue
    for (const range of rangesStr.split(',')) {
      const [s, e] = range.split('-')
      positions.push({ start: parseInt(s), end: parseInt(e), id })
    }
  }
  positions.sort((a, b) => a.start - b.start)

  const parts: ChatMessagePart[] = []
  let lastEnd = 0
  for (const pos of positions) {
    if (pos.start > lastEnd) {
      parts.push({ type: 'text', text: text.slice(lastEnd, pos.start) })
    }
    parts.push({
      type: 'emote',
      url: `https://static-cdn.jtvnbs.net/emoticons/v2/${pos.id}/default/dark/1.0`,
      text: text.slice(pos.start, pos.end + 1),
    })
    lastEnd = pos.end + 1
  }
  if (lastEnd < text.length) {
    parts.push({ type: 'text', text: text.slice(lastEnd) })
  }
  return parts
}

export function useChatConnection(options: ChatConnectionOptions) {
  const { twitchChannel, youtubeVideoId, connected, onMessage, onBatch, onNotification, onUsernameStackUpdate } = options
  const wsRef = useRef<WebSocket | null>(null)
  const ytIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const ytPageTokenRef = useRef<string | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)

  // Twitch IRC connection
  const connectTwitch = useCallback(() => {
    if (!twitchChannel) return

    const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443')
    wsRef.current = ws

    ws.onopen = () => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
      ws.send('PASS JUSTINFAN' + Math.floor(Math.random() * 99999))
      ws.send('NICK justinfan' + Math.floor(Math.random() * 99999))
      ws.send(`JOIN #${twitchChannel.toLowerCase()}`)
      reconnectAttemptsRef.current = 0
    }

    ws.onmessage = (event) => {
      const lines = event.data.split('\r\n')
      for (const line of lines) {
        if (!line) continue

        // Respond to PING
        if (line.startsWith('PING')) {
          ws.send('PONG :tmi.twitch.tv')
          continue
        }

        // Parse PRIVMSG
        if (line.includes('PRIVMSG')) {
          const tags = parseTwitchTags(line)
          const displayName = tags['display-name'] || 'Anonymous'
          const color = tags.color || '#FFFFFF'
          const msgMatch = line.match(/PRIVMSG #\S+ :(.+)/)
          const text = msgMatch?.[1] || ''
          const emotesParsed = parseTwitchEmotes(tags.emotes || '', text)

          // Detect bits/cheers
          const bits = parseInt(tags.bits || '0')
          const isBits = bits > 0

          const msg: ChatMessage = {
            id: tags.id || crypto.randomUUID(),
            displayName,
            content: emotesParsed,
            provider: 'twitch',
            type: isBits ? 'cheer' : 'message',
            color,
            timestamp: Date.now(),
            ...(isBits && { amount: `${bits} bits` }),
          }

          onMessage(msg)
          onUsernameStackUpdate(displayName)

          if (isBits) {
            onNotification({
              id: crypto.randomUUID(),
              type: 'cheer',
              displayName,
              amount: `${bits} bits`,
              provider: 'twitch',
              timestamp: Date.now(),
            })
          }
        }

        // Parse USERNOTICE (subs, giftsubs, etc.)
        if (line.includes('USERNOTICE')) {
          const tags = parseTwitchTags(line)
          const displayName = tags['display-name'] || 'Anonymous'
          const color = tags.color || '#FF8200'
          const msgId = tags['msg-id'] || ''
          const systemMsg = tags['system-msg']?.replace(/\\s/g, ' ') || ''

          let type: ChatMessage['type'] = 'sub'
          if (msgId === 'resub') type = 'resub'
          else if (msgId === 'subgift') type = 'giftsub'

          const months = parseInt(tags['msg-param-cumulative-months'] || '0')
          const plan = tags['msg-param-sub-plan'] || ''

          const msg: ChatMessage = {
            id: tags.id || crypto.randomUUID(),
            displayName,
            content: [{ type: 'text', text: systemMsg }],
            provider: 'twitch',
            type,
            color,
            timestamp: Date.now(),
            months,
            plan,
          }

          onMessage(msg)
          onNotification({
            id: crypto.randomUUID(),
            type,
            displayName,
            months,
            provider: 'twitch',
            timestamp: Date.now(),
          })
          onUsernameStackUpdate(displayName)
        }
      }
    }

    ws.onclose = () => {
      wsRef.current = null
      if (connected) {
        // Reconnect with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
        reconnectAttemptsRef.current++
        reconnectTimeoutRef.current = setTimeout(connectTwitch, delay)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [twitchChannel, connected, onMessage, onNotification, onUsernameStackUpdate])

  // YouTube chat polling
  const pollYouTube = useCallback(async () => {
    if (!youtubeVideoId) return
    try {
      const params = new URLSearchParams({ video_id: youtubeVideoId })
      if (ytPageTokenRef.current) params.set('page_token', ytPageTokenRef.current)

      const res = await fetch(`/api/broadcast/youtube-chat?${params}`)
      const data = await res.json()

      if (data.messages?.length) {
        const msgs: ChatMessage[] = data.messages.map((m: any) => ({
          id: m.id || crypto.randomUUID(),
          displayName: m.authorDisplayName || 'Anonymous',
          content: [{ type: 'text', text: m.displayMessage || '' }],
          provider: 'youtube' as const,
          type: m.type === 'superChatEvent' ? 'superchat' :
                m.type === 'newSponsorEvent' ? 'membership' : 'message',
          color: '#FF0000',
          profileImageUrl: m.authorProfileImageUrl,
          timestamp: Date.now(),
          ...(m.superChatDetails?.amountDisplayString && { amount: m.superChatDetails.amountDisplayString }),
        }))

        onBatch(msgs)

        // Process notifications
        for (const msg of msgs) {
          if (msg.type === 'superchat' || msg.type === 'membership') {
            onNotification({
              id: crypto.randomUUID(),
              type: msg.type,
              displayName: msg.displayName,
              amount: msg.amount,
              provider: 'youtube',
              timestamp: Date.now(),
            })
          }
          onUsernameStackUpdate(msg.displayName)
        }
      }

      if (data.nextPageToken) {
        ytPageTokenRef.current = data.nextPageToken
      }
    } catch (err) {
      console.error('YouTube chat poll error:', err)
    }
  }, [youtubeVideoId, onBatch, onNotification, onUsernameStackUpdate])

  // Connect/disconnect effect
  useEffect(() => {
    if (!connected) {
      // Disconnect
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (ytIntervalRef.current) {
        clearInterval(ytIntervalRef.current)
        ytIntervalRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      return
    }

    // Connect Twitch
    if (twitchChannel) {
      connectTwitch()
    }

    // Connect YouTube
    if (youtubeVideoId) {
      ytPageTokenRef.current = null
      pollYouTube() // Initial poll
      ytIntervalRef.current = setInterval(pollYouTube, 10000)
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (ytIntervalRef.current) {
        clearInterval(ytIntervalRef.current)
        ytIntervalRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }
  }, [connected, twitchChannel, youtubeVideoId, connectTwitch, pollYouTube])
}
