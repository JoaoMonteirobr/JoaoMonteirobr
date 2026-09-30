import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { corsHeaders, json, readJson, requireAdmin } from '../_shared/http.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);

  const authorization = await requireAdmin(req);
  if ('error' in authorization) {
    return json(req, { error: authorization.error }, authorization.error === 'forbidden' ? 403 : 401);
  }

  try {
    const body = await readJson(req);
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    const password = String(body.password || '');
    const role = String(body.role || '');
    const proprietarioId = role === 'proprietario' ? body.proprietario_id || null : null;
    const inquilinoId = role === 'inquilino' ? body.inquilino_id || null : null;
    const nome = String(body.nome || email)
      .trim()
      .slice(0, 160);

    if (!['proprietario', 'inquilino'].includes(role)) {
      return json(req, { error: 'Perfil de acesso inválido.' }, 400);
    }
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 6) {
      return json(req, { error: 'Informe um e-mail válido e senha com pelo menos 6 caracteres.' }, 400);
    }
    if (role === 'proprietario' && !proprietarioId) {
      return json(req, { error: 'Selecione o proprietário vinculado.' }, 400);
    }
    if (role === 'inquilino' && !inquilinoId) {
      return json(req, { error: 'Selecione o inquilino vinculado.' }, 400);
    }

    const url = Deno.env.get('SUPABASE_URL');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceRole) return json(req, { error: 'server_not_configured' }, 503);
    const admin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome },
    });
    if (created.error || !created.data.user) throw created.error || new Error('user_creation_failed');

    const profile = await admin.from('perfis').upsert(
      {
        user_id: created.data.user.id,
        role,
        proprietario_id: proprietarioId,
        inquilino_id: inquilinoId,
        nome,
      },
      { onConflict: 'user_id' },
    );
    if (profile.error) {
      await admin.auth.admin.deleteUser(created.data.user.id);
      throw profile.error;
    }

    return json(req, { ok: true, user_id: created.data.user.id, role });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'request_too_large') return json(req, { error: code }, 413);
    if (code === 'invalid_json') return json(req, { error: code }, 400);
    console.error('admin-create-user failed', error instanceof Error ? error.name : 'unknown_error');
    return json(req, { error: 'user_creation_failed' }, 500);
  }
});
