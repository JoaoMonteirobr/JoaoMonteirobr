import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { corsHeaders, json, readJson, requireAdmin } from '../_shared/http.ts';

function normalizedBrazilMobile(value: unknown): string | null {
  const raw = String(value || '').replace(/\D/g, '');
  const digits = raw.length === 13 && raw.startsWith('55') ? raw.slice(2) : raw;
  // DDD brasileiro + 9 dígitos de celular.
  if (!/^[1-9][0-9]9[0-9]{8}$/.test(digits)) return null;
  return digits;
}
const isUuid = (value: unknown) =>
  typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);

  const authorization = await requireAdmin(req);
  if ('error' in authorization) {
    return json(req, { error: authorization.error }, authorization.error === 'forbidden' ? 403 : 401);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRole) return json(req, { error: 'server_not_configured' }, 503);

  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await readJson(req, 16_384);
    const action = String(body.action || 'create');
    const password = String(body.password || '');

    // Senhas de proprietários são redefinidas APENAS por administradores.
    if (action === 'reset_password') {
      if (!isUuid(body.user_id) || password.length < 12 || password.length > 128) {
        return json(req, { error: 'Informe uma senha entre 12 e 128 caracteres.' }, 400);
      }
      const profile = await admin.from('perfis').select('role,proprietario_id')
        .eq('user_id', body.user_id).maybeSingle();
      if (profile.error || profile.data?.role !== 'proprietario_consulta' || !profile.data.proprietario_id) {
        return json(req, { error: 'Acesso de proprietário não encontrado.' }, 404);
      }
      const result = await admin.auth.admin.updateUserById(body.user_id, { password });
      if (result.error) throw result.error;
      return json(req, { ok: true, action: 'reset_password' });
    }

    if (action !== 'create') return json(req, { error: 'Ação inválida.' }, 400);
    const role = String(body.role || '');
    if (!['proprietario_consulta', 'proprietario', 'inquilino'].includes(role)) {
      return json(req, { error: 'Perfil inválido.' }, 400);
    }
    const proprietarioId = role.startsWith('proprietario') ? body.proprietario_id || null : null;
    const inquilinoId = role === 'inquilino' ? body.inquilino_id || null : null;
    if ((role.startsWith('proprietario') && !isUuid(proprietarioId)) ||
        (role === 'inquilino' && !isUuid(inquilinoId))) {
      return json(req, { error: 'Selecione a pessoa vinculada.' }, 400);
    }
    const phone = role === 'proprietario_consulta' ? normalizedBrazilMobile(body.telefone) : null;
    if (role === 'proprietario_consulta' && (!phone || password.length < 12 || password.length > 128)) {
      return json(req, { error: 'Informe celular válido com DDD e senha de 12 a 128 caracteres.' }, 400);
    }

    const email = role === 'proprietario_consulta'
      // Identificador interno aleatório, não mostrado ao proprietário e não usado para recuperação.
      ? 'conta+' + crypto.randomUUID() + '@matos.invalid'
      : String(body.email || '').trim().toLowerCase();

    if (role !== 'proprietario_consulta' && (!/^\S+@\S+\.\S+$/.test(email) || password.length < 6)) {
      return json(req, { error: 'Informe e-mail válido e senha de pelo menos 6 caracteres.' }, 400);
    }

    let linkedName = '';
    if (role.startsWith('proprietario')) {
      const linked = await admin.from('proprietarios').select('nome,telefone').eq('id', proprietarioId).maybeSingle();
      if (linked.error || !linked.data) return json(req, { error: 'Proprietário não encontrado.' }, 404);
      linkedName = linked.data.nome || '';
      if (role === 'proprietario_consulta' &&
          normalizedBrazilMobile(linked.data.telefone) !== phone) {
        return json(req, { error: 'O telefone deve coincidir com o cadastro do proprietário. Atualize o telefone cadastrado antes de criar o acesso.' }, 400);
      }
      if (role === 'proprietario_consulta') {
        const duplicate = await admin.from('perfis').select('user_id')
          .eq('telefone_login', phone).limit(1);
        if (duplicate.error) throw duplicate.error;
        if (duplicate.data?.length) return json(req, { error: 'Esse telefone já possui acesso cadastrado.' }, 409);
      }
    } else {
      const linked = await admin.from('inquilinos').select('nome').eq('id', inquilinoId).maybeSingle();
      if (linked.error || !linked.data) return json(req, { error: 'Inquilino não encontrado.' }, 404);
      linkedName = linked.data.nome || '';
    }
    const nome = String(body.nome || linkedName || email).trim().slice(0, 160);
    if (!nome) return json(req, { error: 'Informe o nome do usuário.' }, 400);
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome },
    });
    if (created.error || !created.data.user) throw created.error || new Error('user_creation_failed');

    const profile = await admin.from('perfis').upsert({
      user_id: created.data.user.id,
      role,
      proprietario_id: proprietarioId,
      inquilino_id: inquilinoId,
      telefone_login: phone,
      nome,
    }, { onConflict: 'user_id' });
    if (profile.error) {
      await admin.auth.admin.deleteUser(created.data.user.id);
      throw profile.error;
    }

    return json(req, {
      ok: true, user_id: created.data.user.id, role,
      telefone: phone ? '(' + phone.slice(0, 2) + ') ' + phone.slice(2, 7) + '-' + phone.slice(7) : null,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'request_too_large') return json(req, { error: code }, 413);
    if (code === 'invalid_json') return json(req, { error: code }, 400);
    console.error('admin-create-user', error instanceof Error ? error.name : 'unknown_error');
    return json(req, { error: 'Não foi possível processar o acesso. Confira os dados e tente novamente.' }, 500);
  }
});
