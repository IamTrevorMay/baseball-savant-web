'use client'

import type { BroadcastAsset } from '@/lib/broadcastTypes'
import type { WidgetConfig, ChatMessage, Topic, CountdownState, LowerThirdMessage, Notification } from '@/lib/widgetTypes'
import ChatOverlay from './widgets/ChatOverlay'
import LowerThirdOverlay from './widgets/LowerThirdOverlay'
import CountdownOverlay from './widgets/CountdownOverlay'
import TopicOverlay from './widgets/TopicOverlay'
import NotificationFeedOverlay from './widgets/NotificationFeedOverlay'
import UsernameStackOverlay from './widgets/UsernameStackOverlay'

interface WidgetOverlayState {
  chatMessages: ChatMessage[]
  topics: Topic[]
  activeTopicIndex: number
  countdown: CountdownState
  lowerThird: LowerThirdMessage | null
  lowerThirdVisible: boolean
  notifications: Notification[]
  usernameStack: string[]
}

interface Props {
  asset: BroadcastAsset
  widgetState: WidgetOverlayState
  effectiveX: number
  effectiveY: number
  effectiveW: number
  effectiveH: number
  effectiveLayer: number
  assetOpacity: number
}

export default function WidgetOverlayRenderer({ asset, widgetState, effectiveX, effectiveY, effectiveW, effectiveH, effectiveLayer, assetOpacity }: Props) {
  const config = asset.widget_config as WidgetConfig | undefined
  if (!config) return null

  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: effectiveX,
    top: effectiveY,
    width: effectiveW,
    height: effectiveH,
    zIndex: effectiveLayer,
    opacity: assetOpacity,
    overflow: 'hidden',
  }

  switch (config.widget_type) {
    case 'chat':
      return (
        <div style={wrapperStyle}>
          <ChatOverlay messages={widgetState.chatMessages} config={config} width={effectiveW} height={effectiveH} />
        </div>
      )
    case 'lowerthird':
      return (
        <div style={wrapperStyle}>
          <LowerThirdOverlay message={widgetState.lowerThird} visible={widgetState.lowerThirdVisible} config={config} width={effectiveW} height={effectiveH} />
        </div>
      )
    case 'countdown':
      return (
        <div style={wrapperStyle}>
          <CountdownOverlay countdown={widgetState.countdown} config={config} />
        </div>
      )
    case 'topic':
      return (
        <div style={wrapperStyle}>
          <TopicOverlay topics={widgetState.topics} activeIndex={widgetState.activeTopicIndex} config={config} width={effectiveW} height={effectiveH} />
        </div>
      )
    case 'notifications':
      return (
        <div style={wrapperStyle}>
          <NotificationFeedOverlay notifications={widgetState.notifications} config={config} />
        </div>
      )
    case 'usernames':
      return (
        <div style={wrapperStyle}>
          <UsernameStackOverlay usernames={widgetState.usernameStack} config={config} />
        </div>
      )
    default:
      return null
  }
}
