// Supabase client initialization + SOMA Auth integration for FrontRow
// Uses the shared Supabase project (omfwcodoimjmbrhssvfl)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://omfwcodoimjmbrhssvfl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vi2qDWjozUJ5mi9dwirkLA_rj6UaqLf';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// ============================================================================
// FrontRow-specific auth helpers
// ============================================================================

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('frontrow_admins')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (error) return false;
  return !!data;
}

export async function getVenuesForUser(userId: string) {
  // Theater managers see their own venues + can browse others
  // Performers see only venues where they're invited to perform
  // Everyone else sees all active venues

  const isSuperAdminUser = await isSuperAdmin(userId);

  if (isSuperAdminUser) {
    // Super admin sees all venues
    const { data, error } = await supabase
      .from('venues')
      .select('*')
      .is('super_venue_id', null) // theaters only; screens are child venues
      .order('name');
    return { data: data || [], error };
  }

  // All authenticated users see all active venues
  // (They can then navigate into the venue and see their role)
  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .eq('active', true)
    .is('super_venue_id', null)
    .order('name');
  return { data: data || [], error };
}

export async function getSession(sessionId: string) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*, venue:venues(*), settings:session_settings(*)')
    .eq('id', sessionId)
    .single();

  return { data, error };
}

export async function getUserRole(userId: string, venueId: string): Promise<string | null> {
  // Determine user's role in a specific venue/session
  // Returns: 'super_admin' | 'theater_manager' | 'performance_manager' | 'performer' | null

  if (await isSuperAdmin(userId)) return 'super_admin';

  const { data: venueData } = await supabase
    .from('venues')
    .select('theater_manager_id')
    .eq('id', venueId)
    .single();

  if (venueData?.theater_manager_id === userId) return 'theater_manager';

  // TODO: check for performance_manager role per-session
  // (will be added when we implement session invites)

  return null; // Audience member
}

export async function registerSuperAdmin(email: string) {
  // Called by super admin setup flow
  // Requires SUPABASE_SERVICE_ROLE_KEY (run server-side only)
  console.warn('registerSuperAdmin should be called server-side only via Netlify function');
  return null;
}
