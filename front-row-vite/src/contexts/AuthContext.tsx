import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session as AuthSession } from '@supabase/supabase-js';
import { supabase, isSuperAdmin } from '../lib/supabase';
import { FrontRowUser, UserRole } from '../types/frontrow';

interface AuthContextType {
  session: AuthSession | null;
  user: FrontRowUser | null;
  loading: boolean;
  isSuperAdmin: boolean;
  signInWithMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<FrontRowUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuperAdminUser, setIsSuperAdminUser] = useState(false);

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
        setIsSuperAdminUser(false);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  async function initializeUser(userId: string, email: string) {
    try {
      const isAdmin = await isSuperAdmin(userId);
      setIsSuperAdminUser(isAdmin);
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
    setIsSuperAdminUser(false);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        isSuperAdmin: isSuperAdminUser,
        signInWithMagicLink,
        signOut,
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
