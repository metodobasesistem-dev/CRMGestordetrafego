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
          
          // Timeout de 5 segundos para a busca do perfil
          const fetchWithTimeout = async () => {
            return await supabase
              .from('profiles')
              .select('*')
              .eq('id', supabaseUser.id)
              .single();
          };

          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout ao buscar perfil')), 5000)
          );

          const { data: profile, error } = await Promise.race([
            fetchWithTimeout(),
            timeoutPromise
          ]) as any;

          if (error) {
            if (error.code === 'PGRST116') {
              console.log('AuthProvider: Profile missing. Creating default...');
              const isOwner = supabaseUser.email === 'natanvileladesouza@gmail.com' || supabaseUser.email === 'contato@natanvilela.com.br';
              const defaultProfile = {
                id: supabaseUser.id,
                name: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'Novo Usuário',
                email: supabaseUser.email,
                role: isOwner ? 'admin' : 'client',
                allowed_clients: [],
              };
              
              const { error: insertError } = await supabase
                .from('profiles')
                .insert([defaultProfile]);

              if (insertError) {
                console.error('AuthProvider: Bootstrap failed:', insertError);
                setUser(null);
              } else {
                setUser({
                  uid: supabaseUser.id,
                  email: supabaseUser.email!,
                  ...defaultProfile,
                  allowedClients: []
                } as any);
              }
            } else {
              console.error('AuthProvider: Database error:', error);
              setUser(null);
            }
          } else {
            setUser({
              uid: supabaseUser.id,
              email: supabaseUser.email!,
              ...profile,
              allowedClients: profile.allowed_clients || []
            } as any);
          }
        } catch (e) {
          console.error('AuthProvider: Unexpected error:', e);
          setUser(null);
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
