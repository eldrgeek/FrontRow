import { AccessToken } from 'livekit-server-sdk'

// LiveKit keys are not scoped to rooms, so a token minted here could join any
// room on the server. FrontRow only uses frontrow-* rooms.
const ROOM_PATTERN = /^frontrow-[a-z0-9-]{1,60}$/

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export const handler = async (event) => {
  const params = event.queryStringParameters || {}
  const identity = (params.identity || 'Guest').slice(0, 40)
  const role = params.role || 'audience'
  const room = params.room || 'frontrow-main'

  if (!ROOM_PATTERN.test(room)) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ error: 'Room not allowed' }),
    }
  }

  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET

  if (!apiKey || !apiSecret) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server misconfigured: missing LiveKit credentials' }),
    }
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name: identity,
    ttl: '2h',
  })

  at.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })

  const token = await at.toJwt()

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify({ token }),
  }
}
