import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, UserRole } from '@/lib/supabase';

import { getBaseUrl } from "@/lib/getBaseUrl";

const AUTH_TIMEOUT_MS = 8000;

const getSupabaseUrl = () => {
  return (
    import.meta.env.VITE_SUPABASE_URL ||
    (supabase as unknown as { supabaseUrl?: string }).supabaseUrl ||
    ""
  );
};

const getSupabaseAnonKey = () => {
  return (
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    (supabase as unknown as { supabaseKey?: string }).supabaseKey ||
    ""
  );
};

async function invokeEdgeFunction(functionName: string, token: string, body: unknown) {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (!supabaseUrl) {
    throw new Error("URL do Supabase não encontrada");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.error || result?.message || `Erro ${response.status} na Edge Function`);
  }

  return result;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);

  const clearAuthTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startAuthTimeout = useCallback(() => {
    clearAuthTimeout();
    timeoutRef.current = setTimeout(() => {
      console.error('[AUTH] Timeout: autenticação demorou mais de 8s. Forçando loading=false.');
      if (mountedRef.current) {
        setLoading(false);
        setError('A conexão está lenta. Tente recarregar a página.');
      }
    }, AUTH_TIMEOUT_MS);
  }, [clearAuthTimeout]);

  const getProfile = useCallback(async (authUser: { id: string; email?: string }): Promise<User | null> => {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, phone, role, status, email, avatar_url')
          .eq('id', authUser.id)
          .maybeSingle();

        if (profileError) {
          console.error('[AUTH] getProfile error:', profileError);
        }

        if (profile) {
          if (profile.status !== 'ativo') {
            return null;
          }

          return {
            id: authUser.id,
            email: authUser.email || profile.email || '',
            full_name: profile.full_name || '',
            phone: profile.phone || '',
            role: (profile.role as UserRole) || 'cliente',
            status: profile.status || 'ativo',
            avatar_url: profile.avatar_url || '',
          };
        }

        if (attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (err) {
        console.error('[AUTH] getProfile exception:', err);
        if (attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    return null;
  }, []);

  const processSession = useCallback(async (session: { user: { id: string; email?: string } } | null) => {
    if (processingRef.current) return;

    processingRef.current = true;
    startAuthTimeout();

    try {
      if (session?.user) {
        const profile = await getProfile(session.user);

        if (mountedRef.current) {
          if (profile === null) {
            setUser(null);
            await supabase.auth.signOut();
          } else {
            setUser(profile);
          }
        }
      } else {
        if (mountedRef.current) setUser(null);
      }
    } catch (err) {
      console.error('[AUTH] processSession error:', err);
      if (mountedRef.current) setUser(null);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        clearAuthTimeout();
      }
      processingRef.current = false;
    }
  }, [getProfile, startAuthTimeout, clearAuthTimeout]);

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      startAuthTimeout();
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await processSession(session);
      } catch (err) {
        console.error('[AUTH] init error:', err);
        if (mountedRef.current) {
          setLoading(false);
          clearAuthTimeout();
        }
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
        clearAuthTimeout();
      } else {
        setTimeout(() => {
          processSession(session);
        }, 0);
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
      clearAuthTimeout();
    };
  }, [processSession, startAuthTimeout, clearAuthTimeout]);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) return { data: null, error };

      if (data.session?.user?.id) {
        const profile = await getProfile(data.session.user);

        if (profile === null || profile.status !== 'ativo') {
          await supabase.auth.signOut();
          return {
            data: null,
            error: new Error('inactive_account'),
          };
        }
      }

      if (data.session) {
        await processSession(data.session);
      }

      return { data, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error('Erro no login') };
    }
  };

  const signUp = async (email: string, password: string, fullName: string, phone?: string) => {
    try {
      const redirectUrl = `https://np-emporio.vercel.app/auth/callback`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, phone },
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) return { data: null, error };

      const userId = data.session?.user?.id || data.user?.id;
      const userEmail = data.session?.user?.email || data.user?.email;

      if (userId) {
        try {
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id, role, status, full_name, phone')
            .eq('id', userId)
            .maybeSingle();

          if (existingProfile) {
            await supabase
              .from('profiles')
              .update({
                full_name: fullName || existingProfile.full_name,
                phone: phone || existingProfile.phone || '',
                updated_at: new Date().toISOString(),
              })
              .eq('id', userId);
          } else {
            const { data: adminCount, error: rpcError } = await supabase.rpc('count_admins');
            const isFirstAdmin = !rpcError && (adminCount === 0 || adminCount === null);
            const role = isFirstAdmin ? 'admin' : 'cliente';

            await supabase.from('profiles').insert({
              id: userId,
              full_name: fullName,
              phone: phone || '',
              role,
              email: userEmail,
              status: 'ativo',
            });
          }
        } catch (profileErr) {
          console.error('[AUTH] Erro ao gerenciar profile:', profileErr);
        }
      }

      if (data.session) {
        await processSession(data.session);
      }

      return { data, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error('Erro no cadastro') };
    }
  };

  const resendConfirmation = async (email: string) => {
    try {
      const redirectUrl = `https://np-emporio.vercel.app/auth/callback`;

      const { data, error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: redirectUrl },
      });

      return { data, error };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error('Erro ao reenviar') };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[AUTH] signOut exception:', err);
    }

    setUser(null);
    setLoading(false);
  };

  const getAllProfiles = async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('*');

      if (error) {
        console.error('[AUTH] getAllProfiles error:', error);
      }

      return data || [];
    } catch (err) {
      console.error('[AUTH] getAllProfiles exception:', err);
      return [];
    }
  };

  const updateUserRole = async (userId: string, role: UserRole) => {
    try {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);

      return { error };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Erro ao atualizar função') };
    }
  };

  const createEmployee = async (payload: {
    email: string;
    password: string;
    full_name: string;
    phone: string;
    role: UserRole;
    avatar_url?: string;
  }) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        return { data: null, error: new Error('Não autenticado') };
      }

      const data = await invokeEdgeFunction('admin-create-user', token, payload);

      return { data, error: null };
    } catch (err) {
      console.error('[AUTH] createEmployee error:', err);
      return {
        data: null,
        error: err instanceof Error ? err : new Error('Erro ao criar funcionário'),
      };
    }
  };

  const adminManageUser = async (payload: {
    action: 'reset_password' | 'update_profile' | 'delete';
    userId: string;
    newPassword?: string;
    status?: string;
    email?: string;
    phone?: string;
    full_name?: string;
    role?: UserRole;
    avatar_url?: string;
  }) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        return { data: null, error: new Error('Não autenticado') };
      }

      const data = await invokeEdgeFunction('admin-manage-user', token, payload);

      return { data, error: null };
    } catch (err) {
      console.error('[AUTH] adminManageUser error:', err);
      return {
        data: null,
        error: err instanceof Error ? err : new Error('Erro na operação'),
      };
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const redirectUrl = `${getBaseUrl()}/redefinir-senha`;

      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      return { data, error };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err : new Error('Erro ao enviar email de recuperação'),
      };
    }
  };

  return {
    user,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    resendConfirmation,
    getAllProfiles,
    updateUserRole,
    createEmployee,
    adminManageUser,
    resetPassword,
  };
}

export type { User, UserRole };