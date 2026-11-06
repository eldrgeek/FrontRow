// ─────────────────────────────────────────────────────────────────────────────
// GET /api/am-i-frontrow-admin: does the signed-in caller hold FrontRow admin?
//
// Used by the green room (front-row-vite/src/theater/GreenRoom.tsx) to decide
// whether to show the performer's controls. Same gate as every admin action
// (requireUser + isFrontrowAdmin: is_app_admin RPC, then the email allow-list).
// Answers only true/false; anonymous or bad tokens get { admin: false }.
// ─────────────────────────────────────────────────────────────────────────────

import { isFrontrowAdmin } from './lib/appAdmin';
import { requireUser } from './lib/auth';

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, private',
};

export async function handler(event: any) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'GET only' }) };
  }
  let admin = false;
  try {
    const user = await requireUser(event.headers?.authorization || event.headers?.Authorization);
    admin = await isFrontrowAdmin(user);
  } catch {
    admin = false;
  }
  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ admin }) };
}
