// Wires the soma-feedback widget's optional auth-header hook to PlayMaker's
// real Supabase session, so submit-feedback-widget.ts can verify
// is_app_admin('playmaker') for the caller instead of trusting a client claim.
//
// Companion to somaFeedbackIdentity.ts (name/email autofill) — this hook
// carries the actual bearer token. The widget reads window.somaFeedbackAuthHeader
// fresh on every submit, so installing it once at app start is enough; falls
// back to no header (anonymous submission) when signed out or on any error.
import { supabase } from './supabase';

declare global {
  interface Window {
    somaFeedbackAuthHeader?: () => Promise<string | null>;
  }
}

export function installSomaFeedbackAuthHook(): void {
  window.somaFeedbackAuthHeader = async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) return null;
      return `Bearer ${data.session.access_token}`;
    } catch {
      return null;
    }
  };
}
