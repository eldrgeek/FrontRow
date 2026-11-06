import { AccessToken } from 'livekit-server-sdk'
import { requireUser } from './lib/auth'
import { isFrontrowAdmin } from './lib/appAdmin'

// LiveKit keys are not scoped to rooms, so a token minted here could join any
// room on the server. FrontRow only uses frontrow-* rooms.
// Kit rooms are frontrow-<venue>--<room> (src/lib/roomScope.ts), up to 91 characters.
const ROOM_PATTERN = /^frontrow-[a-z0-9-]{1,100}$/

// Every audience page shows whatever the participant named "performer"
// publishes (src/hooks/useLiveKit.ts), so that identity, and the performer
// role, are minted only for a signed-in FrontRow admin (the green room's gate,
// /api/am-i-frontrow-admin). Audience tokens stay open: no account, by design.
const PERFORMER_IDENTITY = 'performer'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const reply = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, private', ...CORS_HEADERS },
  body: JSON.stringify(body),
})

export async function isPerformerAllowed(authHeader: string | undefined): Promise<boolean> {
  try {
    const user = await requireUser(authHeader)
    return await isFrontrowAdmin(user)
  } catch {
    return false
  }
}

export const handler = async (event: any) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' }

  const params = event.queryStringParameters || {}
  const identity = String(params.identity || 'Guest').slice(0, 40)
  const role = params.role || 'audience'
  const room = params.room || 'frontrow-main'

  if (!ROOM_PATTERN.test(room)) return reply(403, { error: 'Room not allowed' })

  const wantsPerformer = role === 'performer' || identity.trim().toLowerCase() === PERFORMER_IDENTITY
  if (wantsPerformer) {
    const auth = event.headers?.authorization || event.headers?.Authorization
    if (!(await isPerformerAllowed(auth))) {
      return reply(403, { error: 'Only a signed-in FrontRow admin can go on as the performer' })
    }
  }

  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret) {
    return reply(500, { error: 'Server misconfigured: missing LiveKit credentials' })
  }

  // A performer token always carries the reserved identity, so no one else's
  // name can sit on the stage screen.
  const tokenIdentity = wantsPerformer ? PERFORMER_IDENTITY : identity
  const at = new AccessToken(apiKey, apiSecret, { identity: tokenIdentity, name: tokenIdentity, ttl: '2h' })
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true })

  return reply(200, { token: await at.toJwt() })
}
