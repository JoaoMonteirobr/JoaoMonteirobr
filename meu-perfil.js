/* Aba "Meu perfil": qualquer usuário troca o próprio nome (função atualizar_meu_nome no banco)
   e a própria senha (Supabase Auth). Disponível para todos os perfis. */
(function(){
'use strict';
var root=window,PAGE='Meu perfil';
if(typeof adminMenus==='undefined'||typeof root.load!=='function')return;

// Regras puras (testadas em tests/unit/meu-perfil.test.js).
function cleanName(v){return String(v||'').trim().replace(/\s+/g,' ')}
function nameError(v){
 var n=cleanName(v);
 if(n.length<2||n.length>80)return 'O nome deve ter entre 2 e 80 letras.';
 if(n.indexOf('@')>=0)return 'Digite seu nome, não o e-mail.';
 return '';
}
function passwordError(a,b){
 if(String(a||'').length<8)return 'A senha nova deve ter pelo menos 8 caracteres.';
 if(a!==b)return 'As duas senhas não são iguais.';
 return '';
}
root.MatosPerfil={cleanName:cleanName,nameError:nameError,passwordError:passwordError};

function roleLabel(){return currentRole==='admin'?'Administrador':currentRole==='proprietario_consulta'?'Proprietário · consulta geral':currentRole==='proprietario'?'Proprietário':currentRole==='inquilino'?'Inquilino':'Usuário'}
function loginLabel(){var p=currentProfile||{};return p.telefone_login||session&&session.user&&session.user.email||'—'}
function currentName(){var n=cleanName(currentProfile&&currentProfile.nome);return n.indexOf('@')>=0?'':n}

function profilePage(){
 E('content').innerHTML='<div class="simple-toolbar"><div><h2>Meu perfil</h2><p>Seu nome aparece na saudação e no topo do sistema.</p></div></div>'
 +'<div class="perfil-grid">'
 +'<div class="panel simple-panel"><div class="panel-title"><h3>Dados</h3></div>'
 +'<div id="pf_msg"></div>'
 +'<label class="lbl" for="pf_nome">Nome</label><input id="pf_nome" class="inp" maxlength="80" autocomplete="name" placeholder="Ex.: Maria da Silva" value="'+esc(currentName())+'">'
 +'<div class="perfil-info"><div><span>Login</span><b>'+esc(loginLabel())+'</b></div><div><span>Tipo de acesso</span><b>'+esc(roleLabel())+'</b></div></div>'
 +'<button id="pf_save" class="btn primary" type="button">Salvar nome</button></div>'
 +'<div class="panel simple-panel"><div class="panel-title"><h3>Trocar senha</h3></div>'
 +'<div id="pw_msg"></div>'
 +'<label class="lbl" for="pw_new">Senha nova</label><input id="pw_new" class="inp" type="password" autocomplete="new-password" placeholder="Pelo menos 8 caracteres">'
 +'<label class="lbl" for="pw_again">Repita a senha nova</label><input id="pw_again" class="inp" type="password" autocomplete="new-password">'
 +'<button id="pw_save" class="btn secondary" type="button">Trocar senha</button></div>'
 +'</div>';
 E('pf_save').onclick=saveName;
 E('pw_save').onclick=savePassword;
 E('pf_nome').onkeydown=function(e){if(e.key==='Enter')saveName()};
}
async function saveName(){
 var msg=E('pf_msg'),btn=E('pf_save'),n=cleanName(E('pf_nome').value),err=nameError(n);
 if(err){msg.innerHTML='<div class="notice err">'+esc(err)+'</div>';return}
 btn.disabled=true;msg.innerHTML='<div class="notice">Salvando...</div>';
 try{
  var saved=await request('/rest/v1/rpc/atualizar_meu_nome',{method:'POST',headers:authHeaders(session.access_token),body:JSON.stringify({p_nome:n})});
  if(currentProfile)currentProfile.nome=typeof saved==='string'?saved:n;
  shell();
  var m=E('pf_msg');if(m)m.innerHTML='<div class="notice success">Nome salvo.</div>';
 }catch(e){msg.innerHTML='<div class="notice err">'+esc(e.message)+'</div>';btn.disabled=false}
}
async function savePassword(){
 var msg=E('pw_msg'),btn=E('pw_save'),a=E('pw_new').value,b=E('pw_again').value,err=passwordError(a,b);
 if(err){msg.innerHTML='<div class="notice err">'+esc(err)+'</div>';return}
 btn.disabled=true;msg.innerHTML='<div class="notice">Trocando a senha...</div>';
 try{
  await request('/auth/v1/user',{method:'PUT',headers:authHeaders(session.access_token),body:JSON.stringify({password:a})});
  E('pw_new').value=E('pw_again').value='';
  msg.innerHTML='<div class="notice success">Senha trocada. Use a senha nova no próximo acesso.</div>';
 }catch(e){msg.innerHTML='<div class="notice err">Não foi possível trocar a senha: '+esc(e.message)+'</div>'}
 btn.disabled=false;
}

// ---------- Menu e roteamento ----------
[adminMenus,ownerMenus,tenantMenus,root.consultaMenus].forEach(function(list){if(list&&list.indexOf(PAGE)<0)list.push(PAGE)});
var prevIcon=root.navIcon;navIcon=function(x){return x===PAGE?'☺':prevIcon(x)};root.navIcon=navIcon;
var prevLoad=root.load;
load=async function(){if(page===PAGE)return profilePage();return prevLoad.apply(this,arguments)};
root.load=load;
// Clicar no nome/avatar do topo abre o perfil.
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('.appbar .user, .appbar .userinfo, .appbar .av');if(t&&session&&session.access_token){page=PAGE;shell()}});
})();
