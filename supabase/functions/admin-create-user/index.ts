import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { corsHeaders, json, readJson, requireAdmin } from './http.ts';

function normalizedBrazilMobile(value: unknown): string | null {
  const raw = String(value || '').replace(/\D/g, '');
  const digits = raw.length === 13 && raw.startsWith('55') ? raw.slice(2) : raw;
  // DDD brasileiro + 9 dígitos de celular.
  if (!/^[1-9][0-9]9[0-9]{8}$/.test(digits)) return null;
  return digits;
}
const isUuid = (value: unknown) =>
  typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);


const manageableRoles = ['proprietario_consulta', 'proprietario', 'inquilino'] as const;
const validEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value) && value.length <= 254;
const publicEmail = (role: string, email: string | undefined) =>
  role === 'proprietario_consulta' || (email || '').endsWith('@matos.invalid')
    ? null : (email || null);

// O histórico não inclui senha, token, nem e-mail de autenticação interno.
async function auditAccess(
  db: ReturnType<typeof createClient>,
  actor: string,
  target: string,
  action: string,
  detail: Record<string, unknown>,
) {
  const result = await db.from('auditoria').insert({
    tabela: 'perfis',
    registro_id: target,
    acao: action,
    usuario_id: actor,
    dados_novos: detail,
  });
  if (result.error) console.error('access_audit_failed', result.error.code);
}

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

    // Contas administrativas nunca podem ser editadas, redefinidas ou excluídas
    // por essa interface. Protege inclusive o administrador conectado.
    const findManagedProfile = async (uid: unknown) => {
      if (!isUuid(uid) || uid === authorization.user.id) return null;
      const { data, error } = await admin.from('perfis')
        .select('user_id,role,nome,telefone_login,proprietario_id,inquilino_id')
        .eq('user_id', uid).maybeSingle();
      if (error) throw error;
      return data && manageableRoles.includes(data.role as typeof manageableRoles[number]) ? data : null;
    };

    if (action === 'list_access') {
      const profileResult = await admin.from('perfis')
        .select('user_id,role,nome,telefone_login,proprietario_id,inquilino_id,created_at')
        .order('created_at', { ascending: false });
      if (profileResult.error) throw profileResult.error;
      const authUsers = new Map<string, { email?: string; last_sign_in_at?: string }>();
      // API de administração com paginação: suporta o crescimento da carteira.
      for (let page = 1; page <= 30; page++) {
        const batch = await admin.auth.admin.listUsers({ page, perPage: 100 });
        if (batch.error) throw batch.error;
        for (const u of batch.data.users || []) authUsers.set(u.id, u);
        if (!batch.data.nextPage || !batch.data.users?.length) break;
        if (page === 30) return json(req, { error: 'Limite de consulta atingido.' }, 503);
      }
      const items = (profileResult.data || []).map((profile) => {
        const authUser = authUsers.get(profile.user_id);
        return {
          ...profile,
          email: publicEmail(profile.role, authUser?.email),
          ultimo_login: authUser?.last_sign_in_at || null,
          gerenciavel: profile.role !== 'admin' && profile.user_id !== authorization.user.id,
        };
      });
      return json(req, { ok: true, items });
    }

    if (action === 'reset_password') {
      if (!isUuid(body.user_id) || password.length < 12 || password.length > 128) {
        return json(req, { error: 'Informe uma senha entre 12 e 128 caracteres.' }, 400);
      }
      const profile = await findManagedProfile(body.user_id);
      if (!profile) return json(req, { error: 'Acesso não encontrado ou protegido.' }, 404);
      const result = await admin.auth.admin.updateUserById(body.user_id, { password });
      if (result.error) throw result.error;
      await auditAccess(admin, authorization.user.id, body.user_id, 'REDEFINIR_SENHA_ACESSO', {
        role: profile.role, nome: profile.nome,
      });
      return json(req, { ok: true, action: 'reset_password' });
    }

    if (action === 'delete_access') {
      const profile = await findManagedProfile(body.user_id);
      if (!profile) return json(req, { error: 'Acesso não encontrado ou protegido.' }, 404);
      const reason = String(body.reason || '').trim();
      if (reason.length < 8 || reason.length > 240) {
        return json(req, { error: 'Informe um motivo de 8 a 240 caracteres para excluir o acesso.' }, 400);
      }
      const removed = await admin.auth.admin.deleteUser(profile.user_id);
      if (removed.error) {
        const message = removed.error.message || '';
        if (/storage|object|owner|foreign key|constraint/i.test(message)) {
          return json(req, {
            error: 'A conta possui arquivos vinculados e não pode ser excluída sem preservá-los. A exclusão foi cancelada.',
          }, 409);
        }
        throw removed.error;
      }
      // Auth User -> perfis ON DELETE CASCADE; registros de imóvel e financeiro
      // não são apagados. O histórico desta exclusão sobrevive à conta.
      await auditAccess(admin, authorization.user.id, profile.user_id, 'EXCLUIR_ACESSO', {
        nome: profile.nome, role: profile.role, proprietario_id: profile.proprietario_id,
        inquilino_id: profile.inquilino_id, motivo: reason,
      });
      return json(req, { ok: true, action: 'delete_access' });
    }

    if (action === 'update_access') {
      const old = await findManagedProfile(body.user_id);
      if (!old) return json(req, { error: 'Acesso não encontrado ou protegido.' }, 404);
      const newRole = String(body.role || old.role);
      if (!manageableRoles.includes(newRole as typeof manageableRoles[number])) {
        return json(req, { error: 'Tipo de acesso inválido.' }, 400);
      }
      const newName = String(body.nome || '').trim();
      if (!newName || newName.length > 160) {
        return json(req, { error: 'Informe um nome de até 160 caracteres.' }, 400);
      }
      const linkedOwnerId = newRole.startsWith('proprietario') ? body.proprietario_id : null;
      const linkedTenantId = newRole === 'inquilino' ? body.inquilino_id : null;
      if ((newRole.startsWith('proprietario') && !isUuid(linkedOwnerId)) ||
          (newRole === 'inquilino' && !isUuid(linkedTenantId))) {
        return json(req, { error: 'Selecione a pessoa correta para este acesso.' }, 400);
      }
      const isPhone = newRole === 'proprietario_consulta';
      const newPhone = isPhone ? normalizedBrazilMobile(body.telefone) : null;
      const newEmail = isPhone ? '' : String(body.email || '').trim().toLowerCase();
      if (isPhone && !newPhone) {
        return json(req, { error: 'Informe um celular válido com DDD.' }, 400);
      }
      if (!isPhone && (!validEmail(newEmail) || newEmail.endsWith('@matos.invalid'))) {
        return json(req, { error: 'Informe um e-mail de login válido.' }, 400);
      }
      if (newRole.startsWith('proprietario')) {
        const linked = await admin.from('proprietarios').select('id,telefone')
          .eq('id', linkedOwnerId).maybeSingle();
        if (linked.error) throw linked.error;
        if (!linked.data) return json(req, { error: 'Proprietário vinculado não encontrado.' }, 404);
        // O telefone de login e o telefone do proprietário precisam ser iguais:
        // altere o cadastro da pessoa antes de trocar o telefone da conta.
        if (isPhone && normalizedBrazilMobile(linked.data.telefone) !== newPhone) {
          return json(req, {
            error: 'Primeiro atualize o celular no cadastro do proprietário. O telefone de login deve ser igual.',
          }, 400);
        }
      } else {
        const linked = await admin.from('inquilinos').select('id')
          .eq('id', linkedTenantId).maybeSingle();
        if (linked.error) throw linked.error;
        if (!linked.data) return json(req, { error: 'Inquilino vinculado não encontrado.' }, 404);
      }
      if (newPhone) {
        const duplicate = await admin.from('perfis').select('user_id')
          .eq('telefone_login', newPhone).neq('user_id', old.user_id).limit(1);
        if (duplicate.error) throw duplicate.error;
        if (duplicate.data?.length) {
          return json(req, { error: 'Esse celular já pertence a outra conta.' }, 409);
        }
      }

      const currentAuth = await admin.auth.admin.getUserById(old.user_id);
      if (currentAuth.error || !currentAuth.data.user) {
        return json(req, { error: 'Conta de autenticação não encontrada.' }, 404);
      }
      const prevAuth = currentAuth.data.user;
      const previousEmail = prevAuth.email || '';
      const desiredEmail = isPhone
        ? (old.role === 'proprietario_consulta' && previousEmail.endsWith('@matos.invalid')
          ? previousEmail : 'conta+' + crypto.randomUUID() + '@matos.invalid')
        : newEmail;
      const updateAttrs: Record<string, unknown> = {
        user_metadata: { ...(prevAuth.user_metadata || {}), nome: newName },
      };
      if (desiredEmail !== previousEmail) {
        updateAttrs.email = desiredEmail;
        updateAttrs.email_confirm = true;
      }
      const authUpdated = await admin.auth.admin.updateUserById(old.user_id, updateAttrs);
      if (authUpdated.error) {
        const conflict = /already|registered|exists|duplicate/i.test(authUpdated.error.message || '');
        return json(req, {
          error: conflict ? 'Esse e-mail já está em uso.' : 'Não foi possível atualizar a conta de autenticação.',
        }, conflict ? 409 : 500);
      }
      const newProfile = {
        role: newRole, nome: newName, proprietario_id: linkedOwnerId,
        inquilino_id: linkedTenantId, telefone_login: newPhone,
      };
      const profileUpdated = await admin.from('perfis').update(newProfile)
        .eq('user_id', old.user_id).select('user_id').maybeSingle();
      if (profileUpdated.error || !profileUpdated.data) {
        // Compensação: evita login alterado com perfil antigo se a atualização
        // de perfil falhar (restrição única, relacionamento, etc.).
        const restore: Record<string, unknown> = { user_metadata: prevAuth.user_metadata || {} };
        if (desiredEmail !== previousEmail) {
          restore.email = previousEmail;
          restore.email_confirm = true;
        }
        const rollback = await admin.auth.admin.updateUserById(old.user_id, restore);
        if (rollback.error) console.error('access_update_rollback_failed', rollback.error.name);
        return json(req, { error: 'Não foi possível salvar os dados do acesso. Confira telefone e vínculo.' }, 409);
      }
      await auditAccess(admin, authorization.user.id, old.user_id, 'ALTERAR_ACESSO', {
        role_anterior: old.role, role_novo: newRole, nome_anterior: old.nome,
        nome_novo: newName, proprietario_anterior: old.proprietario_id,
        proprietario_novo: linkedOwnerId, inquilino_anterior: old.inquilino_id,
        inquilino_novo: linkedTenantId,
      });
      return json(req, { ok: true, action: 'update_access', user_id: old.user_id });
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

    await auditAccess(admin, authorization.user.id, created.data.user.id, 'CRIAR_ACESSO', {
      role, nome, proprietario_id: proprietarioId, inquilino_id: inquilinoId,
    });
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
