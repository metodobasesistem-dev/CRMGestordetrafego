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
            // Se falhar ou der timeout, usamos um perfil temporário baseado no Auth do Supabase
            // Isso evita o loop de redirecionamento para o login
            console.log('AuthProvider: Using fallback session to prevent redirect loop');
            const isOwner = supabaseUser.email === 'natanvileladesouza@gmail.com' || supabaseUser.email === 'contato@natanvilela.com.br';
            
            setUser({
              uid: supabaseUser.id,
              id: supabaseUser.id,
              email: supabaseUser.email!,
              name: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'Usuário',
              role: isOwner ? 'admin' : 'client',
              allowedClients: []
            } as any);

            // Se o erro foi que o perfil não existe (PGRST116), tentamos criar em background
            if (profileError?.code === 'PGRST116') {
              const defaultProfile = {
                id: supabaseUser.id,
                name: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0],
                email: supabaseUser.email,
                role: isOwner ? 'admin' : 'client'
              };
              supabase.from('profiles').insert([defaultProfile]).then(({error}) => {
                if (error) console.error('AuthProvider: Background profile creation failed:', error);
              });
            }
          } else {
            // Perfil carregado com sucesso
            setUser({
              uid: supabaseUser.id,
              id: supabaseUser.id,
              email: supabaseUser.email!,
              ...profileData,
              name: profileData.name || profileData.full_name || supabaseUser.email?.split('@')[0],
              allowedClients: profileData.allowed_clients || []
            } as any);
          }
        } catch (e) {
          console.error('AuthProvider: Unexpected error:', e);
          // Mesmo em erro inesperado, tentamos manter o usuário logado se houver sessão do Supabase
          setUser({ uid: supabaseUser.id, email: supabaseUser.email!, role: 'admin' } as any);
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
