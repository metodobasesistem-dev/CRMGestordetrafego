import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Tenta carregar o usuário do cache local para renderização instantânea
  const [user, setUser] = useState<User | null>(() => {
    const cached = localStorage.getItem('crm_user_cache');
    return cached ? JSON.parse(cached) : null;
  });
  const [loading, setLoading] = useState(!user); // Se não tem cache, mostra loading

  const loadedUserIdRef = useRef<string | null>(user?.id || null);

  const fetchAndSetProfile = async (supabaseUser: any) => {
    if (loadedUserIdRef.current === supabaseUser.id && user) {
      setLoading(false);
      return;
    }

    try {
      // Timeout reduzido para 5s para não travar o usuário
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );

      const fetchPromise = supabase
        .from('profiles')
        .select('id, name, email, role, allowed_clients')
        .eq('id', supabaseUser.id)
        .single();

      let profileData = null;
      let profileError: any = null;

      try {
        const result = await Promise.race([fetchPromise, timeoutPromise]) as any;
        profileData = result.data;
        profileError = result.error;
      } catch (raceError: any) {
        profileError = raceError;
      }

      const userData: User = profileError || !profileData 
        ? {
            uid: supabaseUser.id,
            id: supabaseUser.id,
            email: supabaseUser.email!,
            name: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'Usuário',
            role: 'admin',
            allowedClients: [],
          } as any
        : {
            uid: supabaseUser.id,
            id: supabaseUser.id,
            email: supabaseUser.email!,
            ...profileData,
            name: profileData.name || supabaseUser.email?.split('@')[0],
            role: profileData.role || 'admin',
            allowedClients: profileData.allowed_clients || [],
          } as any;

      setUser(userData);
      localStorage.setItem('crm_user_cache', JSON.stringify(userData));
      loadedUserIdRef.current = supabaseUser.id;
    } catch (e) {
      console.error('AuthProvider Error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED') return;
      
      if (event === 'SIGNED_IN' && session?.user && loadedUserIdRef.current === session.user.id) {
        setLoading(false);
        return;
      }

      if (session?.user) {
        await fetchAndSetProfile(session.user);
      } else {
        localStorage.removeItem('crm_user_cache');
        loadedUserIdRef.current = null;
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    localStorage.removeItem('crm_user_cache');
    loadedUserIdRef.current = null;
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
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
