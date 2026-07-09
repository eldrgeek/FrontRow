// WQ-128 — wires the SOMA soma-feedback widget's optional identity hook
// (SOMA-APP-STANDARD.md §8, item 2: "auto-populate identity for signed-in
// users… we know where they are") to Playmaker's real Supabase session.
//
// The widget reads `window.somaFeedbackIdentity` fresh every time its panel
// opens (never cached), so this only needs to be installed once at app
// start — it always reflects whatever session is live at call time.
//
// Falls back to the widget's own localStorage-remembered fields when there
// is no session (signed-out visitor) or when the hook throws/rejects — see
// soma-feedback.js's resolveIdentity(), which treats a null/undefined
// return as "no identity, use the remembered fields."
import { supabase } from './supabase';

export interface SomaFeedbackIdentity {
  name?: string;
  email?: string;
}

declare global {
  interface Window {
    somaFeedbackIdentity?: () => Promise<SomaFeedbackIdentity | null>;
  }
}

export function installSomaFeedbackIdentityHook(): void {
  window.somaFeedbackIdentity = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return null;
    const user = data.session.user;
    if (!user) return null;
    const name =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      undefined;
    const email = user.email || undefined;
    if (!name && !email) return null;
    return { name, email };
  };
}
