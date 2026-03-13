import { NextRequest, NextResponse } from 'next/server'

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || ''

export async function GET(req: NextRequest) {
  try {
    const videoId = req.nextUrl.searchParams.get('video_id')
    const pageToken = req.nextUrl.searchParams.get('page_token')

    if (!videoId) return NextResponse.json({ error: 'video_id required' }, { status: 400 })

    if (!YOUTUBE_API_KEY) {
      return NextResponse.json({ error: 'YouTube API key not configured' }, { status: 503 })
    }

    // First, get the live chat ID from the video
    let liveChatId = req.nextUrl.searchParams.get('live_chat_id')

    if (!liveChatId) {
      const videoRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`
      )
      const videoData = await videoRes.json()
      liveChatId = videoData.items?.[0]?.liveStreamingDetails?.activeLiveChatId

      if (!liveChatId) {
        return NextResponse.json({ error: 'No active live chat found for this video' }, { status: 404 })
      }
    }

    // Fetch chat messages
    const params = new URLSearchParams({
      part: 'snippet,authorDetails',
      liveChatId,
      maxResults: '200',
      key: YOUTUBE_API_KEY,
    })
    if (pageToken) params.set('pageToken', pageToken)

    const chatRes = await fetch(`https://www.googleapis.com/youtube/v3/liveChat/messages?${params}`)
    const chatData = await chatRes.json()

    if (chatData.error) {
      return NextResponse.json({ error: chatData.error.message }, { status: chatData.error.code || 500 })
    }

    const messages = (chatData.items || []).map((item: any) => ({
      id: item.id,
      authorDisplayName: item.authorDetails?.displayName,
      authorProfileImageUrl: item.authorDetails?.profileImageUrl,
      displayMessage: item.snippet?.displayMessage,
      type: item.snippet?.type || 'textMessageEvent',
      publishedAt: item.snippet?.publishedAt,
      superChatDetails: item.snippet?.superChatDetails,
    }))

    return NextResponse.json({
      messages,
      nextPageToken: chatData.nextPageToken,
      liveChatId,
      pollingIntervalMillis: chatData.pollingIntervalMillis || 10000,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
