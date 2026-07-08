import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session as AuthSession } from '@supabase/supabase-js';
import { supabase, isSuperAdmin } from '../lib/supabase';
import { FrontRowUser } from '../types/frontrow';

// Identifies this app inside the shared SOMA Auth (Supabase) project. Passed as
// user metadata on sign-in so the shared auth email can name the site the link
// is for, instead of looking like it came from another SOMA app.
export const SITE_NAME = 'FrontRow Theater';

export interface Agent {
  id: string;
  email: string;
  is_ai: boolean;
}

interface AuthContextType {
  session: AuthSession | null;
  user: FrontRowUser | null;
  agents: Agent[]; // People/AIs this user has delegated to
  agentFor: Agent[]; // People this user is an agent for
  loading: boolean;
  isSuperAdmin: boolean;
  isAI: boolean;
  signInWithMagicLink: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (name: string, email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  delegateTo: (agentId: string) => Promise<void>;
  revokeDelegation: (agentId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<FrontRowUser | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentFor, setAgentFor] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdminUser, setIsSuperAdminUser] = useState(false);
  const [isAIUser, setIsAIUser] = useState(false);

  useEffect(() => {
    // Check active session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        initializeUser(session.user.id, session.user.email || '');
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        initializeUser(newSession.user.id, newSession.user.email || '');
      } else {
        setUser(null);
        setAgents([]);
        setAgentFor([]);
        setIsSuperAdminUser(false);
        setIsAIUser(false);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  async function initializeUser(userId: string, email: string) {
    try {
      const isAdmin = await isSuperAdmin(userId);
      setIsSuperAdminUser(isAdmin);

      // Get user profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('is_ai')
        .eq('id', userId)
        .single();

      setIsAIUser(profileData?.is_ai || false);

      // Get session token for API calls
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (token) {
        // Get delegations from API: who I've delegated to (my agents)
        const agentsRes = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/v1/delegations/agents`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const agentsData = agentsRes.ok ? await agentsRes.json() : [];
        setAgents(agentsData);

        // Get delegations from API: who I'm agent for
        const agentForRes = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/v1/delegations/agent-for`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const agentForData = agentForRes.ok ? await agentForRes.json() : [];
        setAgentFor(agentForData);
      } else {
        setAgents([]);
        setAgentFor([]);
      }

      setUser({
        id: userId,
        email,
        role: isAdmin ? 'super_admin' : 'audience',
        is_super_admin: isAdmin,
      });
    } catch (error) {
      console.error('Error initializing user:', error);
      setUser({
        id: userId,
        email,
        role: 'audience',
        is_super_admin: false,
      });
    }
  }

  async function delegateTo(agentId: string) {
    if (!user) throw new Error('Not authenticated');
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('No active session');

    const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/v1/delegations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ agent_id: agentId }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to delegate');
    }

    // Refresh delegations
    initializeUser(user.id, user.email);
  }

  async function revokeDelegation(agentId: string) {
    if (!user) throw new Error('Not authenticated');
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('No active session');

    const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/v1/delegations/${agentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to revoke delegation');
    }

    // Refresh delegations
    initializeUser(user.id, user.email);
  }

  async function signInWithMagicLink(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // Names the site in the shared SOMA auth email (see SITE_NAME).
        data: { site_name: SITE_NAME },
      },
    });
    if (error) throw error;
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
  }

  async function signInWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUpWithPassword(name: string, email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // full_name feeds the profiles row; site_name names the site in the
        // shared confirmation email.
        data: { full_name: name, site_name: SITE_NAME },
      },
    });
    if (error) throw error;
    // When email confirmation is required, Supabase returns a user with no
    // active session until the emailed link is clicked.
    return { needsConfirmation: !data.session };
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setUser(null);
    setAgents([]);
    setAgentFor([]);
    setIsSuperAdminUser(false);
    setIsAIUser(false);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        agents,
        agentFor,
        loading,
        isSuperAdmin: isSuperAdminUser,
        isAI: isAIUser,
        signInWithMagicLink,
        signInWithGoogle,
        signInWithPassword,
        signUpWithPassword,
        signOut,
        delegateTo,
        revokeDelegation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
