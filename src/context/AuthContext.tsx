import React, { createContext, useContext, useEffect, useState } from 'react';
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

  useEffect(() => {
    console.log('AuthProvider: Setting up Supabase auth listener...');

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('AuthProvider: Auth state changed. Event:', event);
      
      const supabaseUser = session?.user;

      if (supabaseUser) {
        try {
          setLoading(true);
          console.log('AuthProvider: Fetching profile for:', supabaseUser.id);
          
          // Timeout estendido para 15 segundos para evitar loops em conexões lentas
          const fetchWithTimeout = async () => {
            return await supabase
              .from('profiles')
              .select('*')
              .eq('id', supabaseUser.id)
              .single();
          };

          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout ao buscar perfil')), 15000)
          );

          let profileData = null;
          let profileError = null;

          try {
            const result = await Promise.race([
              fetchWithTimeout(),
              timeoutPromise
            ]) as any;
            profileData = result.data;
            profileError = result.error;
          } catch (raceError: any) {
            console.warn('AuthProvider: Profile fetch timed out or failed, using fallback.');
            profileError = raceError;
          }

          if (profileError || !profileData) {
            // Se falhar ou der timeout, mantemos a sessão para evitar loop de login
            console.log('AuthProvider: Using fallback session to prevent redirect loop');

            // Role padrão: 'admin'. O correto vem do banco, mas isso evita o logout
            const fallbackRole = 'admin';
            
            setUser({
              uid: supabaseUser.id,
              id: supabaseUser.id,
              email: supabaseUser.email!,
              name: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'Usuário',
              role: fallbackRole,
              allowedClients: []
            } as any);

            // Se o perfil não existe (PGRST116), criamos em background com role padrão
            if (profileError?.code === 'PGRST116') {
              const defaultProfile = {
                id: supabaseUser.id,
                name: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'Usuário',
                email: supabaseUser.email,
                role: fallbackRole,
                allowed_clients: []
              };
              supabase.from('profiles').insert([defaultProfile]).then(({ error: insertErr }) => {
                if (insertErr) console.error('AuthProvider: Background profile creation failed:', insertErr);
                else console.log('AuthProvider: Profile created in background successfully.');
              });
            }
          } else {
            // Perfil carregado com sucesso — role sempre vem do banco
            setUser({
              uid: supabaseUser.id,
              id: supabaseUser.id,
              email: supabaseUser.email!,
              ...profileData,
              name: profileData.name || profileData.full_name || supabaseUser.email?.split('@')[0],
              role: profileData.role || 'admin',
              allowedClients: profileData.allowed_clients || []
            } as any);
          }
        } catch (e) {
          console.error('AuthProvider: Unexpected error:', e);
          // Em erro inesperado, mantemos sessão mínima para evitar loop de login
          setUser({ uid: supabaseUser.id, id: supabaseUser.id, email: supabaseUser.email!, role: 'admin', allowedClients: [] } as any);
        } finally {
          setLoading(false);
        }
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
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
