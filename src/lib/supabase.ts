import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export type UserRole = 'cliente' | 'cozinha' | 'caixa' | 'admin' | 'atendente' | 'entregador' | 'gerente';

export type User = {
  id: string;
  email: string;
  full_name?: string;
  phone?: string;
  role?: UserRole;
  status?: string;
  avatar_url?: string;
};