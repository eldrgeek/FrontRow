// ─────────────────────────────────────────────────────────────────────────────
// Auth gate for Functions. Verifies the caller is a logged-in Supabase user
// before an admin action runs, by asking Supabase /auth/v1/user with the
// bearer token. Ported from Playmaker's lib/auth.ts, MINUS the §14a AI-ingress
// (pmk_agent_) branch — FrontRow has no agent-credential system, so this is the
// plain human-JWT path only.
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthedUser {
  id: string;
  email: string | null;
  token: string;
}

export async function requireUser(authHeader: string | undefined): Promise<AuthedUser> {
  const token = (authHeader ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new AuthError('Missing Authorization bearer token');

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new AuthError('Server missing Supabase config', 500);

  const resp = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new AuthError('Invalid or expired session');

  const user: any = await resp.json();
  if (!user?.id) throw new AuthError('Invalid session');
  return { id: user.id, email: user.email ?? null, token };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}
