import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const read=(file)=>fs.readFileSync(path.join(process.cwd(),file),'utf8');
const ui=read('access-management.js');
const backend=read('supabase/functions/admin-create-user/index.ts');
const index=read('index.html');

const owner1='11111111-1111-4111-8111-111111111111';
const owner2='22222222-2222-4222-8222-222222222222';
const ownerUser='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const scopedUser='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const tenantUser='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const adminUser='dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function createHarness(role='admin'){
 const dom=new JSDOM('<div id="content"></div>',{url:'https://matos.example'});
 const owners=[
  {id:owner1,nome:'Proprietária Exemplo',telefone:'68999991111'},
  {id:owner2,nome:'Proprietário Futuro',telefone:'68999992222'},
 ];
 const tenants=[{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',nome:'Inquilino Exemplo'}];
 const accounts=[
  {user_id:ownerUser,nome:'Proprietária Exemplo',role:'proprietario_consulta',
   proprietario_id:owner1,telefone_login:'68999991111',gerenciavel:true},
  {user_id:scopedUser,nome:'Proprietário Futuro',role:'proprietario',
   proprietario_id:owner2,email:'futuro@example.com',gerenciavel:true},
  {user_id:tenantUser,nome:'Inquilino Exemplo',role:'inquilino',
   inquilino_id:tenants[0].id,email:'inquilino@example.com',gerenciavel:true},
  {user_id:adminUser,nome:'Admin Matos',role:'admin',email:'admin@example.com',
   gerenciavel:false},
 ];
 const requests=[];
 const ctx={
  document:dom.window.document,
  window:null,
  currentRole:role,
  session:{access_token:'jwt-exemplo'},
  cache:{},
  crypto:dom.window.crypto,
  Intl,
  Date,
  E:(id)=>dom.window.document.getElementById(id),
  esc:(s)=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
  authHeaders:(t)=>({Authorization:'Bearer '+t}),
  dbGet:vi.fn(async(t)=>t==='proprietarios'?owners:tenants),
  request:vi.fn(async(url,opts)=>{
   requests.push({url,body:JSON.parse(opts.body)});
   if(url.includes('admin-create-user')&&requests.at(-1).body.action==='list_access'){
    return {ok:true,items:accounts};
   }
   return {ok:true,action:requests.at(-1).body.action};
  }),
  load:vi.fn(async()=>{}),
  confirm:vi.fn(()=>true),
  MatosSettings:{open:vi.fn()},
 };
 ctx.window=ctx;
 vm.runInNewContext(ui,ctx,{filename:'access-management.js'});
 return {ctx,dom,requests,owners,accounts};
}

describe('Gerenciamento de acessos — tela do administrador',()=>{
 it('mostra criação, busca e ações individuais sem barra horizontal de tabela',async()=>{
  const env=createHarness();
  await env.ctx.accesses();
  const doc=env.dom.window.document;
  expect(doc.querySelector('#newAccessRole')).toBeTruthy();
  expect(doc.querySelectorAll('.access-user-card')).toHaveLength(4);
  expect(doc.querySelector('[data-access-edit="'+ownerUser+'"]')).toBeTruthy();
  expect(doc.querySelector('[data-access-password="'+ownerUser+'"]')).toBeTruthy();
  expect(doc.querySelector('[data-access-delete="'+ownerUser+'"]')).toBeTruthy();
  expect(doc.querySelector('[data-access-delete="'+adminUser+'"]')).toBeNull();
  expect(doc.getElementById('content').textContent).toContain('Conta administrativa protegida');
  expect(doc.getElementById('content').textContent).toContain('Proprietário Futuro');
  expect(env.requests.filter(x=>x.body.action==='list_access')).toHaveLength(1);
 });

 it('permite cadastrar mais de um proprietário e escolher vínculo e permissão',async()=>{
  const env=createHarness();await env.ctx.accesses();
  const doc=env.dom.window.document;
  expect(doc.getElementById('newAccessLink').querySelectorAll('option')).toHaveLength(3);
  doc.getElementById('newAccessLink').value=owner2;
  doc.getElementById('newAccessLink').onchange();
  expect(doc.getElementById('newAccessName').value).toBe('Proprietário Futuro');
  expect(doc.getElementById('newAccessPhone').value).toContain('99999');
  doc.getElementById('newOwnerLink').click();
  expect(env.ctx.MatosSettings.open).toHaveBeenCalledWith('Proprietários');
  doc.getElementById('newAccessPassword').value='Senha-forte-2026!';
  await doc.getElementById('newAccessSave').onclick();
  const created=env.requests.filter(x=>x.body.action==='create');
  expect(created).toHaveLength(1);
  expect(created[0].body.proprietario_id).toBe(owner2);
  expect(created[0].body.telefone).toBe('68999992222');
  expect(created[0].body.role).toBe('proprietario_consulta');
  expect(env.ctx.load).toHaveBeenCalledOnce();
 });

 it('edita vínculos, nome, papel e e-mail de contas não administrativas',async()=>{
  const env=createHarness();await env.ctx.accesses();
  const doc=env.dom.window.document;
  doc.querySelector('[data-access-edit="'+ownerUser+'"]').click();
  expect(doc.getElementById('editAccessRole').value).toBe('proprietario_consulta');
  doc.getElementById('editAccessRole').value='proprietario';
  doc.getElementById('editAccessRole').onchange();
  doc.getElementById('editAccessLink').value=owner2;
  doc.getElementById('editAccessEmail').value='novo@example.com';
  doc.getElementById('editAccessName').value='Novo Proprietário';
  await doc.getElementById('editAccessSave').onclick();
  const updated=env.requests.filter(x=>x.body.action==='update_access');
  expect(updated).toHaveLength(1);
  expect(updated[0].body.role).toBe('proprietario');
  expect(updated[0].body.proprietario_id).toBe(owner2);
  expect(updated[0].body.email).toBe('novo@example.com');
  expect(env.ctx.confirm).toHaveBeenCalledOnce();
  expect(env.ctx.load).toHaveBeenCalledOnce();
 });

 it('exige nova senha forte antes de enviar redefinição autenticada',async()=>{
  const env=createHarness();await env.ctx.accesses();
  const doc=env.dom.window.document;
  doc.querySelector('[data-access-password="'+scopedUser+'"]').click();
  doc.getElementById('accessResetInput').value='curta';
  await doc.getElementById('accessResetSave').onclick();
  expect(env.requests.filter(x=>x.body.action==='reset_password')).toHaveLength(0);
  doc.getElementById('accessResetInput').value='Nova-Senha-2026!';
  await doc.getElementById('accessResetSave').onclick();
  const sent=env.requests.filter(x=>x.body.action==='reset_password');
  expect(sent).toHaveLength(1);
  expect(sent[0].body.user_id).toBe(scopedUser);
  expect(env.ctx.load).toHaveBeenCalledOnce();
 });

 it('não exclui conta sem motivo e confirmação digitada',async()=>{
  const env=createHarness();await env.ctx.accesses();
  const doc=env.dom.window.document;
  doc.querySelector('[data-access-delete="'+ownerUser+'"]').click();
  await doc.getElementById('removeAccessSave').onclick();
  expect(env.requests.filter(x=>x.body.action==='delete_access')).toHaveLength(0);
  doc.getElementById('removeAccessReason').value='Acesso cadastrado por engano';
  doc.getElementById('removeAccessConfirm').value='EXCLUIR';
  await doc.getElementById('removeAccessSave').onclick();
  const sent=env.requests.filter(x=>x.body.action==='delete_access');
  expect(sent).toHaveLength(1);
  expect(sent[0].body.reason).toBe('Acesso cadastrado por engano');
  expect(env.ctx.load).toHaveBeenCalledOnce();
 });

 it('oculta gerenciamento para proprietário e inquilino',async()=>{
  for(const role of ['proprietario_consulta','proprietario','inquilino']){
   const env=createHarness(role);await env.ctx.accesses();
   expect(env.dom.window.document.querySelector('.access-user-card')).toBeNull();
   expect(env.dom.window.document.getElementById('content').textContent).toContain('exclusivo para administradores');
   expect(env.ctx.request).not.toHaveBeenCalled();
  }
 });

 it('filtra registros pelo nome sem modificar os dados cadastrados',async()=>{
  const env=createHarness();await env.ctx.accesses();
  const doc=env.dom.window.document;
  const input=doc.getElementById('accessSearch');
  input.value='Futuro';
  input.oninput();
  expect(doc.querySelectorAll('.access-user-card')).toHaveLength(1);
  expect(doc.getElementById('accessList').textContent).toContain('Proprietário Futuro');
 });

 it('mantém autenticação de servidor, auditoria e proteção das contas admin',()=>{
  expect(backend).toContain('await requireAdmin(req)');
  expect(backend).toContain("action === 'list_access'");
  expect(backend).toContain("action === 'update_access'");
  expect(backend).toContain("action === 'delete_access'");
  expect(backend).toContain("action === 'reset_password'");
  expect(backend).toContain("profile.role !== 'admin'");
  expect(backend).toContain("admin.auth.admin.deleteUser");
  expect(backend).toContain("admin.auth.admin.updateUserById");
  expect(backend).toContain("await auditAccess");
  expect(backend).toContain("normalizedBrazilMobile(linked.data.telefone)");
  expect(backend).toContain("role === 'proprietario_consulta'");
  expect(backend).not.toContain('serviceRole:');
  expect(index).toContain('/access-management.js?v=1');
  expect(index).toContain('/access-management.css?v=1');
 });
});
