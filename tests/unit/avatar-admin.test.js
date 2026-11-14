import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const read=(name)=>fs.readFileSync(path.join(process.cwd(),name),'utf8');
const src=read('avatar-admin.js'),profile=read('meu-perfil.js'),index=read('index.html');
const css=read('avatar-admin.css'),shell=read('app1.js');
const migration=read('supabase/migrations/20261113_admin_avatar_foto_emoji.sql');
const uid='12121212-1212-4212-8212-121212121212';
const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(t)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[t]));
function mount(role='admin'){
 const dom=new JSDOM('<header class="appbar"><div class="user"><div class="av">J</div></div></header><main id="content"></main>',{url:'https://matos.test/'});
 const blobs=[];
 const post=vi.fn(async(_url,opts)=>{
  const params=JSON.parse(opts.body);
  return {ok:true,avatar_tipo:params.p_tipo,
   avatar_emoji:params.p_emoji,avatar_path:params.p_path};
 });
 const fetcher=vi.fn(async(url,opts)=>({
  ok:true,status:200,
  text:async()=>'',
  blob:async()=>new Blob(['img'],{type:'image/jpeg'}),
 }));
 const fakeURL={
  createObjectURL:vi.fn(()=>{const value='blob:profile-'+blobs.length;blobs.push(value);return value}),
  revokeObjectURL:vi.fn(),
 };
 const ctx={
  window:null,document:dom.window.document,
  currentRole:role,currentProfile:{nome:'João',role,avatar_tipo:'inicial',avatar_emoji:null,avatar_path:null},
  session:{user:{id:uid,email:'joao@test.com'},access_token:'jwt-exemplo'},
  SUPA_URL:'https://fake.supabase.co',KEY:'sb_publishable_test',
  E:(id)=>dom.window.document.getElementById(id),esc:escapeHtml,
  request:post,fetch:fetcher,URL:fakeURL,
  authHeaders:(token)=>({apikey:'publishable',Authorization:'Bearer '+token,'Content-Type':'application/json'}),
  crypto:{randomUUID:()=> 'a1b2c3d4-1234-4234-8234-aabbccddeeff'},
  Blob,Promise,Uint8Array,
 };
 ctx.window=ctx;
 vm.runInNewContext(src,ctx,{filename:'avatar-admin.js'});
 return {dom,ctx,post,fetcher,fakeURL,blobs};
}
describe('Avatar do administrador — foto privada ou emoji',()=>{
 it('exibe 24 personagens para o administrador e não exibe para proprietário/inquilino',()=>{
  const x=mount();
  const html=x.ctx.MatosAvatar.pickerHtml();
  const dom=new JSDOM(html);
  expect(dom.window.document.querySelectorAll('[data-avatar-emoji]')).toHaveLength(24);
  expect(dom.window.document.getElementById('matosAvatarFile').getAttribute('accept'))
   .toBe('image/jpeg,image/png,image/webp');
  expect(dom.window.document.querySelector('#matosAvatarSavePhoto').disabled).toBe(true);
  for(const role of ['proprietario_consulta','proprietario','inquilino']){
   const test=mount(role);
   expect(test.ctx.MatosAvatar.pickerHtml()).toBe('');
   expect(test.ctx.MatosAvatar.headerHtml(test.ctx.currentProfile,'J')).toBe('J');
  }
  expect(profile).toContain("currentRole==='admin'&&root.MatosAvatar?root.MatosAvatar.pickerHtml()");
  expect(profile).toContain("root.MatosAvatar.mountPicker()");
 });
 it('substitui a inicial pelo emoji escolhido e persiste no banco sem expor senha',async()=>{
  const x=mount(),doc=x.dom.window.document;
  doc.getElementById('content').innerHTML=x.ctx.MatosAvatar.pickerHtml();
  x.ctx.MatosAvatar.mountPicker();
  const picker=doc.getElementById('matosAvatarEmojis');
  const chosen=picker.querySelector('[data-avatar-emoji="🥷"]');
  await picker.onclick({target:chosen});
  expect(x.post).toHaveBeenCalledOnce();
  expect(x.post.mock.calls[0][0]).toBe('/rest/v1/rpc/definir_meu_avatar');
  const body=JSON.parse(x.post.mock.calls[0][1].body);
  expect(body).toEqual({p_tipo:'emoji',p_emoji:'🥷',p_path:null});
  expect(x.ctx.currentProfile.avatar_emoji).toBe('🥷');
  expect(doc.querySelector('.appbar .user .av').textContent).toBe('🥷');
  expect(chosen.getAttribute('aria-pressed')).toBe('true');
  expect(doc.getElementById('matosAvatarStatus').textContent).toContain('atualizado');
  expect(x.fetcher).not.toHaveBeenCalled();
 });
 it('pode voltar à inicial e recusa emojis não pertencentes à galeria',async()=>{
  const x=mount(),doc=x.dom.window.document;
  x.ctx.currentProfile.avatar_tipo='emoji';x.ctx.currentProfile.avatar_emoji='🦁';
  doc.getElementById('content').innerHTML=x.ctx.MatosAvatar.pickerHtml();
  x.ctx.MatosAvatar.mountPicker();
  expect(x.ctx.MatosAvatar.validEmoji('😎')).toBe(true);
  expect(x.ctx.MatosAvatar.validEmoji('<script>')).toBe(false);
  expect(x.ctx.MatosAvatar.headerHtml({avatar_tipo:'emoji',avatar_emoji:'<script>'},'J')).toBe('J');
  await doc.getElementById('matosAvatarReset').onclick();
  expect(x.post).toHaveBeenCalledOnce();
  expect(JSON.parse(x.post.mock.calls[0][1].body).p_tipo).toBe('inicial');
  expect(doc.querySelector('.appbar .user .av').textContent).toBe('J');
 });
 it('rejeita imagem inadequada antes de enviar arquivos',()=>{
  const x=mount(),doc=x.dom.window.document;
  doc.getElementById('content').innerHTML=x.ctx.MatosAvatar.pickerHtml();
  x.ctx.MatosAvatar.mountPicker();
  const input=doc.getElementById('matosAvatarFile');
  Object.defineProperty(input,'files',{configurable:true,value:[{type:'application/pdf',size:125,name:'senha.pdf'}]});
  input.onchange();
  expect(doc.getElementById('matosAvatarStatus').textContent).toContain('JPG, PNG ou WEBP');
  expect(x.post).not.toHaveBeenCalled();
  expect(x.fetcher).not.toHaveBeenCalled();
 });
 it('otimiza uma foto, envia somente ao bucket privado e atualiza o perfil',async()=>{
  const x=mount(),doc=x.dom.window.document;
  doc.getElementById('content').innerHTML=x.ctx.MatosAvatar.pickerHtml();
  x.ctx.MatosAvatar.mountPicker();
  class FakeImage{
   naturalWidth=1400;naturalHeight=900;
   set src(_url){this.onload()}
  }
  x.ctx.Image=FakeImage;
  x.dom.window.HTMLCanvasElement.prototype.getContext=()=>({
   fillRect:vi.fn(),drawImage:vi.fn(),set fillStyle(_color){}
  });
  x.dom.window.HTMLCanvasElement.prototype.toBlob=(cb)=>cb(new Blob(['photo'],{type:'image/jpeg'}));
  const input=doc.getElementById('matosAvatarFile');
  Object.defineProperty(input,'files',{configurable:true,value:[{type:'image/png',size:400000,name:'selfie.png'}]});
  input.onchange();
  expect(doc.getElementById('matosAvatarSavePhoto').disabled).toBe(false);
  await doc.getElementById('matosAvatarSavePhoto').onclick();
  const upload=x.fetcher.mock.calls.find(([,opts])=>opts.method==='POST');
  expect(upload).toBeTruthy();
  expect(upload[0]).toContain('/storage/v1/object/avatares-admin/'+uid+'/');
  expect(upload[1].headers.Authorization).toBe('Bearer jwt-exemplo');
  expect(upload[1].headers['Content-Type']).toBe('image/jpeg');
  expect(upload[1].headers['x-upsert']).toBe('false');
  expect(x.post).toHaveBeenCalledOnce();
  const body=JSON.parse(x.post.mock.calls[0][1].body);
  expect(body.p_tipo).toBe('foto');
  expect(body.p_path).toMatch(new RegExp('^'+uid+'/[0-9a-f-]{36}\\.jpg$'));
  expect(x.ctx.currentProfile.avatar_path).toBe(body.p_path);
 });
 it('protege fotos com permissões RLS e restringe alteração ao próprio administrador',()=>{
  expect(migration).toContain("VALUES ('avatares-admin','avatares-admin',false,2097152");
  expect(migration).toContain("public.is_admin()");
  expect(migration).toContain("storage.foldername(name)");
  expect(migration).toContain("owner_id=v_id::text");
  expect(migration).toContain("SECURITY DEFINER");
  expect(migration).toContain("p_tipo='emoji'");
  expect(migration).toContain("role INTO v_role");
  expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.definir_meu_avatar(text,text,text) TO authenticated");
  expect(migration).not.toContain('service_role');
  expect(shell).toContain('window.MatosAvatar.headerHtml(currentProfile,initial)');
  expect(shell).toContain('window.MatosAvatar.clearCache()');
 });
 it('permanece funcional no celular e com preferência por menos animações',()=>{
  expect(css).toContain('.matos-avatar-emoji-grid');
  expect(css).toContain('@media(max-width:570px)');
  expect(css).toContain('@media(prefers-reduced-motion:reduce)');
  expect(index).toContain('/avatar-admin.js?v=1');
  expect(index).toContain('/avatar-admin.css?v=1');
  expect(index).toContain('/meu-perfil.js?v=2');
  expect(index).toContain('/app1.js?v=20261113-5');
 });
});
