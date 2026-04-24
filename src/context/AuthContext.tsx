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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Ref para rastrear o ID do usuário já carregado — evita refetch ao trocar de aba
  const loadedUserIdRef = useRef<string | null>(null);

  const fetchAndSetProfile = async (supabaseUser: any) => {
    // Se já carregamos o perfil desse usuário, não fazemos nada (evita reload ao trocar aba)
    if (loadedUserIdRef.current === supabaseUser.id) {
      console.log('AuthProvider: Profile already loaded for this user. Skipping refetch.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('AuthProvider: Fetching profile for:', supabaseUser.id);

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout ao buscar perfil')), 15000)
      );

      const fetchPromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

      let profileData = null;
      let profileError: any = null;

      try {
        const result = await Promise.race([fetchPromise, timeoutPromise]) as any;
        profileData = result.data;
        profileError = result.error;
      } catch (raceError: any) {
        console.warn('AuthProvider: Profile fetch timed out or failed, using fallback.');
        profileError = raceError;
      }

      if (profileError || !profileData) {
        console.log('AuthProvider: Using fallback session to prevent redirect loop.');
        const fallbackRole = 'admin';

        setUser({
          uid: supabaseUser.id,
          id: supabaseUser.id,
          email: supabaseUser.email!,
          name: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'Usuário',
          role: fallbackRole,
          allowedClients: [],
        } as any);

        // Marca como carregado mesmo no fallback para não refazer infinitamente
        loadedUserIdRef.current = supabaseUser.id;

        // Se o perfil não existe, cria em background
        if (profileError?.code === 'PGRST116') {
          const defaultProfile = {
            id: supabaseUser.id,
            name: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'Usuário',
            email: supabaseUser.email,
            role: fallbackRole,
            allowed_clients: [],
          };
          supabase.from('profiles').insert([defaultProfile]).then(({ error: insertErr }) => {
            if (insertErr) console.error('AuthProvider: Background profile creation failed:', insertErr);
            else console.log('AuthProvider: Profile created in background successfully.');
          });
        }
      } else {
        setUser({
          uid: supabaseUser.id,
          id: supabaseUser.id,
          email: supabaseUser.email!,
          ...profileData,
          name: profileData.name || profileData.full_name || supabaseUser.email?.split('@')[0],
          role: profileData.role || 'admin',
          allowedClients: profileData.allowed_clients || [],
        } as any);

        // Marca o usuário como carregado
        loadedUserIdRef.current = supabaseUser.id;
      }
    } catch (e) {
      console.error('AuthProvider: Unexpected error:', e);
      setUser({ uid: supabaseUser.id, id: supabaseUser.id, email: supabaseUser.email!, role: 'admin', allowedClients: [] } as any);
      loadedUserIdRef.current = supabaseUser.id;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('AuthProvider: Setting up Supabase auth listener...');

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('AuthProvider: Auth state changed. Event:', event);

      // ✅ FIX: Ignorar renovações de token silenciosas — acontecem ao trocar de aba
      // Esses eventos NÃO significam que o usuário fez logout/login novamente
      if (event === 'TOKEN_REFRESHED') {
        console.log('AuthProvider: Token refreshed silently. No action needed.');
        return;
      }

      // ✅ FIX: Ignorar SIGNED_IN se o usuário já está carregado com o mesmo ID
      // Evita o reload ao voltar de outra aba
      if (event === 'SIGNED_IN' && session?.user && loadedUserIdRef.current === session.user.id) {
        console.log('AuthProvider: SIGNED_IN but user already loaded. Ignoring.');
        setLoading(false);
        return;
      }

      const supabaseUser = session?.user;

      if (supabaseUser) {
        await fetchAndSetProfile(supabaseUser);
      } else {
        // Usuário fez logout de verdade
        loadedUserIdRef.current = null;
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
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
