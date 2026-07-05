import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session as AuthSession } from '@supabase/supabase-js';
import { supabase, isSuperAdmin } from '../lib/supabase';
import { FrontRowUser, UserRole } from '../types/frontrow';

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

      // Get delegations: who I've delegated to (my agents)
      const { data: agentsData } = await supabase
        .from('delegations')
        .select('agent:agent_id(id, email, is_ai)')
        .eq('user_id', userId)
        .is('revoked_at', null);

      setAgents(agentsData?.map(d => (d.agent as any)) || []);

      // Get delegations: who I'm agent for
      const { data: agentForData } = await supabase
        .from('delegations')
        .select('user:user_id(id, email, is_ai)')
        .eq('agent_id', userId)
        .is('revoked_at', null);

      setAgentFor(agentForData?.map(d => (d.user as any)) || []);

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
    const { error } = await supabase
      .from('delegations')
      .insert({ user_id: user.id, agent_id: agentId });
    if (error) throw error;
    // Refresh delegations
    initializeUser(user.id, user.email);
  }

  async function revokeDelegation(agentId: string) {
    if (!user) throw new Error('Not authenticated');
    const { error } = await supabase
      .from('delegations')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('agent_id', agentId);
    if (error) throw error;
    // Refresh delegations
    initializeUser(user.id, user.email);
  }

  async function signInWithMagicLink(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
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
