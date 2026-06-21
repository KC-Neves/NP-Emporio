import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  role: string;
  avatar_url?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verificar se o chamador é admin
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: only admin can create users' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    const body: CreateUserRequest = await req.json();
    const { email, password, full_name, phone, role, avatar_url } = body;

    if (!email || !password || !full_name || !role) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Validar role
    const allowedRoles = ['cliente', 'cozinha', 'caixa', 'atendente', 'entregador', 'admin'];
    if (!allowedRoles.includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Criar usuário com service role
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: authError?.message || 'Failed to create user' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // O trigger on_auth_user_created cria o profile automaticamente,
    // mas usamos UPSERT aqui como garantia e para sobrescrever role/status corretos
    const profileData: Record<string, unknown> = {
      id: authData.user.id,
      full_name,
      phone: phone || null,
      role,
      email,
      status: 'ativo',
    };
    if (avatar_url) profileData.avatar_url = avatar_url;

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profileData, { onConflict: 'id' });

    if (profileError) {
      // Tentar deletar o usuário criado se profile falhou
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return new Response(JSON.stringify({ error: profileError.message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      success: true,
      userId: authData.user.id,
      email,
      password,
      message: 'User created successfully',
    }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
});
