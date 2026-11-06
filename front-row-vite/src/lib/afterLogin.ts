// Where to return after signing in. Only front-of-house paths are accepted, so
// a crafted ?next= cannot send a fresh session anywhere else.
const KEY = 'frontrow_after_login';

function safe(path: string | null | undefined): string | null {
  return path && /^\/show\/[a-z0-9-]+(\/[a-z-]+)?$/.test(path) ? path : null;
}

export function rememberAfterLogin(path: string | null | undefined): void {
  const p = safe(path);
  try {
    if (p) sessionStorage.setItem(KEY, p);
  } catch {
    /* falls back to /venues */
  }
}

export function takeAfterLogin(): string | null {
  try {
    const p = safe(sessionStorage.getItem(KEY));
    sessionStorage.removeItem(KEY);
    return p;
  } catch {
    return null;
  }
}
