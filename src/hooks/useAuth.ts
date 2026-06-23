import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, UserRole } from '@/lib/supabase';

import { getBaseUrl } from "@/lib/getBaseUrl";

const AUTH_TIMEOUT_MS = 8000;

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
    console.log('[AUTH] getProfile start for user:', authUser.id);
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
          console.error('[AUTH] getProfile error (attempt', attempts, '):', profileError);
        }

        if (profile) {
          console.log('[AUTH] getProfile SUCCESS (attempt', attempts, '). ROLE:', profile.role, 'FOR USER:', authUser.id);
          // Se usuário inativo, retornar null para bloquear acesso
          if (profile.status !== 'ativo') {
            console.log('[AUTH] Usuário inativo detectado:', authUser.id, 'status:', profile.status);
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

        console.log('[AUTH] Profile não encontrado (attempt', attempts, ') para', authUser.id);
        if (attempts < maxAttempts) {
          console.log('[AUTH] Retrying getProfile em 500ms...');
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (err) {
        console.error('[AUTH] getProfile exception (attempt', attempts, '):', err);
        if (attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    // Após todas as tentativas, NÃO criar profile automaticamente - isso pode sobrescrever roles existentes
    // Se o perfil não foi encontrado, retornar null para forçar re-login
    console.log('[AUTH] Profile não encontrado após', maxAttempts, 'tentativas para', authUser.id, '- NÃO será criado automaticamente para evitar sobrescrever roles');
    return null;
  }, []);

  // Processa evento de auth de forma async (separado do callback síncrono do onAuthStateChange)
  const processSession = useCallback(async (session: { user: { id: string; email?: string } } | null) => {
    if (processingRef.current) {
      console.log('[AUTH] processSession pulado: já está processando');
      return;
    }
    processingRef.current = true;
    startAuthTimeout();

    try {
      if (session?.user) {
        console.log('[AUTH] Processando sessão para user:', session.user.id);
        const profile = await getProfile(session.user);
        if (mountedRef.current) {
          if (profile === null) {
            console.log('[AUTH] Profile null (usuário inativo), fazendo signOut');
            setUser(null);
            await supabase.auth.signOut();
          } else {
            console.log('[AUTH] User setado com role:', profile.role);
            setUser(profile);
          }
        }
      } else {
        console.log('[AUTH] Sem sessão, limpando user');
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

  // Inicialização + listener
  useEffect(() => {
    mountedRef.current = true;
    console.log('[AUTH] useAuth montado');

    const init = async () => {
      startAuthTimeout();
      try {
        console.log('[AUTH] getSession start');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error('[AUTH] getSession error:', sessionError);
        }
        console.log('[AUTH] getSession result:', session ? 'tem sessão' : 'sem sessão');
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

    // CRITICAL: callback SÍNCRONO para onAuthStateChange (Supabase v2 não suporta async aqui)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AUTH] onAuthStateChange event:', event);
      if (!mountedRef.current) return;

      // NUNCA faça await dentro deste callback. Agende o processamento async.
      if (event === 'SIGNED_OUT') {
        if (mountedRef.current) {
          setUser(null);
          setLoading(false);
          clearAuthTimeout();
        }
      } else {
        setTimeout(() => {
          processSession(session);
        }, 0);
      }
    });

    return () => {
      console.log('[AUTH] useAuth desmontando');
      mountedRef.current = false;
      subscription.unsubscribe();
      clearAuthTimeout();
    };
  }, [processSession, startAuthTimeout, clearAuthTimeout]);

  const signIn = async (email: string, password: string) => {
    console.log('[AUTH] signIn start');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('[AUTH] signIn error:', error.message);
        return { data: null, error };
      }
      console.log('[AUTH] signIn success, session:', data.session ? 'sim' : 'não');

      // Verificar se o usuário está ativo antes de permitir login
      if (data.session?.user?.id) {
        const profile = await getProfile(data.session.user);
        if (profile === null || profile.status !== 'ativo') {
          // Deslogar o usuário imediatamente
          await supabase.auth.signOut();
          console.log('[AUTH] Usuário inativo, bloqueando login');
          return {
            data: null,
            error: new Error('inactive_account'),
          };
        }
      }

      // Processa sessão imediatamente para atualizar estado sem esperar onAuthStateChange
      if (data.session) {
        await processSession(data.session);
      }
      return { data, error: null };
    } catch (err) {
      console.error('[AUTH] signIn exception:', err);
      return { data: null, error: err instanceof Error ? err : new Error('Erro no login') };
    }
  };

  const signUp = async (email: string, password: string, fullName: string, phone?: string) => {
    console.log('[AUTH] signUp start');
    try {
      const redirectUrl = `${getBaseUrl()}/auth/callback`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, phone },
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        console.error('[AUTH] signUp error:', error.message);
        return { data: null, error };
      }

      console.log('[AUTH] signUp success, user:', data.user?.id, 'session:', data.session ? 'sim' : 'não');

      // Se tem user (com ou sem session), criar profile
      const userId = data.session?.user?.id || data.user?.id;
      const userEmail = data.session?.user?.email || data.user?.email;
      if (userId) {
        console.log('[AUTH] signUp — verificando/criando profile para user:', userId);
        try {
          // ═══ PROTEÇÃO: verificar se profile JÁ EXISTE antes de upsert ═══
          const { data: existingProfile, error: checkError } = await supabase
            .from('profiles')
            .select('id, role, status, full_name, phone')
            .eq('id', userId)
            .maybeSingle();

          if (checkError) {
            console.error('[AUTH] Erro ao verificar profile existente:', checkError);
          }

          if (existingProfile) {
            // Profile JÁ EXISTE — NUNCA sobrescrever role nem status!
            // Só atualiza campos seguros: nome, telefone, updated_at
            console.log('[AUTH] signUp — profile já existe. Role:', existingProfile.role, 'Status:', existingProfile.status, '— PRESERVANDO ambos');
            const { error: updateError } = await supabase
              .from('profiles')
              .update({
                full_name: fullName || existingProfile.full_name,
                phone: phone || existingProfile.phone || '',
                updated_at: new Date().toISOString(),
              })
              .eq('id', userId);
            if (updateError) {
              console.error('[AUTH] Erro ao atualizar profile existente:', updateError);
            } else {
              console.log('[AUTH] Profile existente atualizado (role e status preservados)');
            }
          } else {
            // Profile NÃO EXISTE — criar normalmente
            // Usar RPC count_admins para verificar se existe admin (ignora RLS)
            const { data: adminCount, error: rpcError } = await supabase.rpc('count_admins');
            if (rpcError) {
              console.error('[AUTH] Erro ao contar admins via RPC:', rpcError);
            }
            const isFirstAdmin = !rpcError && (adminCount === 0 || adminCount === null);
            const role = isFirstAdmin ? 'admin' : 'cliente';
            console.log('[AUTH] Admin count:', adminCount, 'isFirstAdmin:', isFirstAdmin, 'role:', role);

            const { error: insertError } = await supabase.from('profiles').insert({
              id: userId,
              full_name: fullName,
              phone: phone || '',
              role,
              email: userEmail,
              status: 'ativo',
            });
            if (insertError) {
              console.error('[AUTH] Erro ao criar profile no cadastro:', insertError);
            } else {
              console.log('[AUTH] Profile NOVO criado com role:', role);
            }
          }
        } catch (profileErr) {
          console.error('[AUTH] Exceção ao gerenciar profile no cadastro:', profileErr);
        }
      }

      // Se tem session, processar login automático
      if (data.session) {
        await processSession(data.session);
      }

      return { data, error: null };
    } catch (err) {
      console.error('[AUTH] signUp exception:', err);
      return { data: null, error: err instanceof Error ? err : new Error('Erro no cadastro') };
    }
  };

  const resendConfirmation = async (email: string) => {
    console.log('[AUTH] resendConfirmation start');
    try {
      const redirectUrl = `${getBaseUrl()}/auth/callback`;
      const { data, error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: redirectUrl },
      });
      if (error) {
        console.error('[AUTH] resendConfirmation error:', error);
      } else {
        console.log('[AUTH] resendConfirmation success');
      }
      return { data, error };
    } catch (err) {
      console.error('[AUTH] resendConfirmation exception:', err);
      return { data: null, error: err instanceof Error ? err : new Error('Erro ao reenviar') };
    }
  };

  const signOut = async () => {
    console.log('[AUTH] signOut start');
    try {
      await supabase.auth.signOut();
      console.log('[AUTH] signOut success');
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
      if (error) {
        console.error('[AUTH] updateUserRole error:', error);
      }
      return { error };
    } catch (err) {
      console.error('[AUTH] updateUserRole exception:', err);
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
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: payload,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) {
        return { data: null, error: new Error(error.message || 'Erro ao criar funcionário') };
      }
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error('Erro ao criar funcionário') };
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
      const { data, error } = await supabase.functions.invoke('admin-manage-user', {
        body: payload,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) {
        return { data: null, error: new Error(error.message || 'Erro na operação') };
      }
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error('Erro na operação') };
    }
  };

  const resetPassword = async (email: string) => {
    console.log('[AUTH] resetPassword start for:', email);
    try {
      const redirectUrl = `${getBaseUrl()}/redefinir-senha`;
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });
      if (error) {
        console.error('[AUTH] resetPassword error:', error.message);
      } else {
        console.log('[AUTH] resetPassword success');
      }
      return { data, error };
    } catch (err) {
      console.error('[AUTH] resetPassword exception:', err);
      return { data: null, error: err instanceof Error ? err : new Error('Erro ao enviar email de recuperação') };
    }
  };

  return { user, loading, error, signIn, signUp, signOut, resendConfirmation, getAllProfiles, updateUserRole, createEmployee, adminManageUser, resetPassword };
}

export type { User, UserRole };