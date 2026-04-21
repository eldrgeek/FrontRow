import { AccessToken } from 'livekit-server-sdk'

export const handler = async (event) => {
  const params = event.queryStringParameters || {}
  const identity = (params.identity || 'Guest').slice(0, 40)
  const role = params.role || 'audience'
  const room = params.room || 'frontrow-main'

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
    ttl: '8h',
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
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify({ token }),
  }
}
