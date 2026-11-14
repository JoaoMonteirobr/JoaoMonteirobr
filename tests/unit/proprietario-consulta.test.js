import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('proprietário · consulta geral com telefone e senha', () => {
  const ui = read('simple-ui.js');
  const shell = read('app1.js');
  const access = read('app3.js');
  const secureUi = read('contact-security.js');
  const admin = read('supabase/functions/admin-create-user/index.ts');
  const login = read('supabase/functions/secure-login/index.ts');
  const sql = read('supabase/migrations/20261108_proprietario_consulta_telefone.sql');
  const index = read('index.html');
  const gastos = read('gastos.js');

  it('mantém usuários antigos com e-mail e libera login do proprietário por telefone', () => {
    expect(shell).toContain('Telefone ou e-mail');
    expect(secureUi).toContain('login:email,password:pw');
    expect(login).toContain('normalizeBrazilPhone');
    expect(login).toContain("eq('telefone_login', phone)");
    expect(login).toContain("eq('role', 'proprietario_consulta')");
    expect(login).toContain("authClient.auth.signInWithPassword({ email: resolvedEmail, password })");
    expect(login).toContain('ACCOUNT_MAX_ATTEMPTS = 5');
    expect(login).toContain('IP_MAX_ATTEMPTS = 20');
    expect(login).toContain('email: auditIdentity');
  });

  it('restringe criação e redefinição de senha a administradores autenticados', () => {
    expect(admin).toContain('await requireAdmin(req)');
    expect(admin).toContain("body.action");
    expect(admin).toContain("action === 'reset_password'");
    expect(admin).toContain('admin.auth.admin.updateUserById');
    expect(admin).toContain('password.length < 12');
    expect(admin).toContain("role === 'proprietario_consulta'");
    expect(admin).toContain('normalizedBrazilMobile(linked.data.telefone) !== phone');
    expect(admin).not.toContain('serviceRole:');
    expect(access).toContain('data-owner-reset');
    expect(access).toContain('id="acc_phone"');
    expect(access).toContain('value="proprietario_consulta"');
  });

  it('limita a consulta geral a um novo papel separado do proprietário comum', () => {
    expect(sql).toContain("'proprietario_consulta'");
    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).toContain('perfis_telefone_login_unique');
    expect(sql).toContain('RLS');
    const policies = [...sql.matchAll(/CREATE POLICY (\w+)_consulta_geral_select ON public\.(\w+)/g)];
    expect(policies.length).toBeGreaterThanOrEqual(15);
    expect(policies.map((m) => m[2])).toEqual(expect.arrayContaining([
      'imoveis', 'inquilinos', 'contratos', 'cobrancas', 'financeiro', 'gastos', 'documentos',
    ]));
    expect(sql).not.toMatch(/FOR (UPDATE|INSERT|DELETE|ALL) TO authenticated/);
    expect(sql).toContain("bucket_id = 'comprovantes'");
    expect(sql).toContain('EXISTS (SELECT 1 FROM public.cobrancas');
    expect(sql).toContain("bucket_id = 'documentos-imoveis'");
  });

  it('apresenta todas as consultas e PDFs sem botões de escrita', () => {
    expect(shell).toContain("currentRole==='proprietario_consulta'?consultaMenus");
    expect(ui).toContain("currentRole==='proprietario_consulta'");
    expect(ui).toContain('Somente consulta');
    expect(ui).toContain("currentRole==='admin'?'<button id=\"newProperty\"");
    expect(ui).toContain("currentRole==='admin'?'<button id=\"newContract\"");
    expect(gastos).toContain("currentRole!=='admin'&&currentRole!=='proprietario_consulta'");
    expect(gastos).toContain('var C=E(\'content\'),readOnly=currentRole!==\'admin\'');
    expect(ui).toContain('Baixar PDF completo com anexos');
    expect(ui).toContain("if(page==='Relatórios')return simpleReports()");
  });

  it('publica os scripts atualizados sem invalidar testes prévios', () => {
    expect(index).toContain('/app1.js?v=20261113-4');
    expect(index).toContain('/app3.js?v=20261108-2');
    expect(index).toContain('/simple-ui.js?v=18');
    expect(index).toContain('/contact-security.js?v=2');
    expect(index).toContain('/gastos.js?v=2');
  });
});
