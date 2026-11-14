(function () {
'use strict';

// Cadastro e manutenção de acessos: toda escrita passa por Edge Function autenticada.
var accessState={accounts:[],owners:[],tenants:[],query:'',feedback:''};
var ROLES={
  proprietario_consulta:'Proprietário · consulta geral',
  proprietario:'Proprietário · somente seus imóveis',
  inquilino:'Inquilino',
  admin:'Administrador'
};
function roleOptions(selected){
  return ['proprietario_consulta','proprietario','inquilino'].map(function(role){
    return '<option value="'+role+'"'+(selected===role?' selected':'')+'>'+esc(ROLES[role])+'</option>'
  }).join('')
}
function accessRpc(body){
  return request('/functions/v1/admin-create-user',{
    method:'POST',headers:authHeaders(session.access_token),body:JSON.stringify(body)
  })
}
function linkedPeople(role){return role==='inquilino'?accessState.tenants:accessState.owners}
function ownerLinked(role){return role==='proprietario'||role==='proprietario_consulta'}
function onlyDigits(v){var d=String(v||'').replace(/\D/g,'');return d.length===13&&d.slice(0,2)==='55'?d.slice(2):d}
function formattedPhone(v){
  var d=onlyDigits(v);return d.length===11?'('+d.slice(0,2)+') '+d.slice(2,7)+'-'+d.slice(7):'—'
}
function validPhone(v){return /^[1-9][0-9]9[0-9]{8}$/.test(onlyDigits(v))}
function rolePermission(role){
  if(role==='proprietario_consulta')return 'Consulta todos os imóveis e relatórios, sem alterar dados.';
  if(role==='proprietario')return 'Consulta apenas imóveis vinculados ao proprietário.';
  if(role==='inquilino')return 'Consulta as informações vinculadas ao inquilino.';
  return 'Gerencia todas as áreas do sistema.'
}
function dateAccess(v){
  if(!v)return 'Nunca acessou';
  var time=new Date(v);
  return Number.isFinite(time.getTime())?time.toLocaleString('pt-BR',{timeZone:'America/Rio_Branco'}):'Não informado'
}
function linkedName(a){
  var list=linkedPeople(a.role),id=a.role==='inquilino'?a.inquilino_id:a.proprietario_id;
  var p=list.find(function(item){return item.id===id});return p&&p.nome||'Vínculo não encontrado'
}
function passwordStrong(){
  var chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#_-';
  var bytes=new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes,function(b){return chars[b%chars.length]}).join('')
}
function ownerLinkOptions(role,value){
  return '<option value="">Selecione a pessoa vinculada</option>'+linkedPeople(role).map(function(p){
    return '<option value="'+esc(p.id)+'"'+(p.id===value?' selected':'')+'>'+esc(p.nome||'Sem nome')+'</option>'
  }).join('')
}
function message(el,text,type){
  if(!el)return;
  el.textContent=text||'';
  el.className='access-message'+(text?' is-'+(type||'info'):'');
}
function manageButton(action,label,uid){
  return '<button type="button" class="access-action access-action-'+action+'" data-access-'+action+'="'+esc(uid)+'">'+label+'</button>'
}
function accessCard(a){
  var protectedAdmin=a.role==='admin'||a.gerenciavel===false,contact=a.role==='proprietario_consulta'?formattedPhone(a.telefone_login):a.email||'E-mail não informado';
  return '<article class="access-user-card" data-access-record="'+esc(a.user_id)+'">'
    +'<div class="access-user-main"><div class="access-avatar">'+esc((a.nome||'U').slice(0,1).toUpperCase())+'</div>'
    +'<div class="access-user-identity"><h4>'+esc(a.nome||'Sem nome')+'</h4><p>'+esc(contact)+'</p></div>'
    +'<span class="access-role-tag'+(a.role==='admin'?' is-admin':'')+'">'+esc(ROLES[a.role]||a.role)+'</span></div>'
    +'<div class="access-user-meta"><span><b>Vínculo:</b> '+esc(a.role==='admin'?'Conta administrativa':linkedName(a))+'</span>'
    +'<span><b>Último acesso:</b> '+esc(dateAccess(a.ultimo_login))+'</span></div>'
    +(protectedAdmin?'<div class="access-protected"><span aria-hidden="true">◈</span> Conta administrativa protegida contra alteração e exclusão nesta tela</div>'
    :'<div class="access-user-actions">'
      +manageButton('edit','Editar',a.user_id)
      +manageButton('password','Alterar senha',a.user_id)
      +manageButton('delete','Excluir',a.user_id)
    +'</div>')+'</article>'
}
async function listAccounts(){
  // Sempre busca vínculos novamente para mostrar proprietários recém-cadastrados.
  var data=await Promise.all([dbGet('proprietarios'),dbGet('inquilinos'),accessRpc({action:'list_access'})]);
  accessState.owners=data[0]||[];
  accessState.tenants=data[1]||[];
  if(!data[2]||!data[2].ok||!Array.isArray(data[2].items))throw new Error('O servidor não retornou a lista de acessos.');
  accessState.accounts=data[2].items;
}
function renderAccessList(){
  var term=accessState.query.toLocaleLowerCase('pt-BR'),list=accessState.accounts.filter(function(a){
    var search=[a.nome||'',ROLES[a.role]||'',linkedName(a),a.email||'',a.telefone_login||''].join(' ').toLocaleLowerCase('pt-BR');
    return search.includes(term)
  });
  var results=E('accessList');
  if(results)results.innerHTML=list.length?list.map(accessCard).join('')
    :'<p class="access-empty">Nenhum acesso encontrado para esta pesquisa.</p>';
  bindAccountActions();
}
function bindAccountActions(){
  ['edit','password','delete'].forEach(function(action){
    Array.prototype.forEach.call(document.querySelectorAll('[data-access-'+action+']'),function(el){
      el.onclick=function(){
        if(currentRole!=='admin')return;
        var id=el.getAttribute('data-access-'+action);
        var account=accessState.accounts.find(function(a){return a.user_id===id});
        if(!account||account.role==='admin'||!account.gerenciavel)return;
        if(action==='edit')showEdit(account);
        if(action==='password')showPassword(account);
        if(action==='delete')showDelete(account);
      }
    })
  })
}
function setRoleFields(prefix,preserve){
  var role=E(prefix+'Role').value,sel=E(prefix+'Link'),phone=E(prefix+'PhoneWrap'),email=E(prefix+'EmailWrap');
  if(!role||!sel)return;
  var previous=preserve?sel.value:'';
  sel.innerHTML=ownerLinkOptions(role,previous);
  phone.hidden=role!=='proprietario_consulta';
  email.hidden=role==='proprietario_consulta';
  var note=E(prefix+'Note');
  if(note)note.textContent=rolePermission(role);
}
function setPersonFields(prefix,force){
  var role=E(prefix+'Role').value,link=E(prefix+'Link').value;
  var person=linkedPeople(role).find(function(p){return p.id===link});
  if(!person)return;
  if(force||!E(prefix+'Name').value.trim())E(prefix+'Name').value=person.nome||'';
  if(role==='proprietario_consulta'&&(force||!E(prefix+'Phone').value.trim())){
    E(prefix+'Phone').value=formattedPhone(person.telefone)==='—'?'':formattedPhone(person.telefone)
  }
}
function accessForm(){
  return '<section class="panel access-create-panel"><div class="access-panel-head"><h3>Cadastrar novo acesso</h3><span class="access-header-caption">Somente administrador</span></div>'
   +'<p class="access-panel-hint">Cada proprietário ou inquilino terá sua própria conta e senha. Selecione a pessoa vinculada e o tipo de permissão.</p>'
   +'<div class="field"><label class="lbl" for="newAccessRole">Tipo de acesso *</label><select id="newAccessRole" class="inp">'+roleOptions('proprietario_consulta')+'</select></div>'
   +'<div class="access-permission-note" id="newAccessNote"></div>'
   +'<div class="field"><label class="lbl" for="newAccessLink">Pessoa vinculada *</label><select id="newAccessLink" class="inp"></select>'
   +'<button type="button" id="newOwnerLink" class="access-owner-link">+ Cadastrar novo proprietário</button></div>'
   +'<div class="field"><label class="lbl" for="newAccessName">Nome para exibição *</label><input id="newAccessName" class="inp" maxlength="160" autocomplete="off"></div>'
   +'<div id="newAccessPhoneWrap" class="field"><label class="lbl" for="newAccessPhone">Celular para login com DDD *</label><input id="newAccessPhone" class="inp" type="tel" autocomplete="off" placeholder="(68) 99999-9999"><small>Igual ao telefone cadastrado para o proprietário.</small></div>'
   +'<div id="newAccessEmailWrap" class="field" hidden><label class="lbl" for="newAccessEmail">E-mail para login *</label><input id="newAccessEmail" class="inp" type="email" autocomplete="off" placeholder="nome@exemplo.com"></div>'
   +'<div class="field"><label class="lbl" for="newAccessPassword">Senha inicial *</label><div class="access-password-input"><input id="newAccessPassword" class="inp" type="password" autocomplete="new-password" minlength="12" maxlength="128"><button type="button" id="newAccessReveal" class="access-inline-button" aria-label="Mostrar senha">Mostrar</button></div>'
   +'<button id="newAccessGenerate" class="access-owner-link" type="button">Gerar senha forte</button><small>Mínimo 12 caracteres. Envie a senha por um canal seguro.</small></div>'
   +'<div id="newAccessMessage" role="status" aria-live="polite" class="access-message"></div>'
   +'<button id="newAccessSave" type="button" class="btn primary access-create-submit">Criar acesso</button></section>'
}
function accessOverview(){
  var total=accessState.accounts.length,owner=accessState.accounts.filter(function(a){return ownerLinked(a.role)}).length;
  var tenants=accessState.accounts.filter(function(a){return a.role==='inquilino'}).length;
  var admins=accessState.accounts.filter(function(a){return a.role==='admin'}).length;
  return '<div class="access-stats"><div><small>Acessos cadastrados</small><strong>'+total+'</strong></div>'
    +'<div><small>Proprietários</small><strong>'+owner+'</strong></div>'
    +'<div><small>Inquilinos</small><strong>'+tenants+'</strong></div>'
    +'<div><small>Administradores</small><strong>'+admins+'</strong></div></div>'
}
async function accessPage(){
  var C=E('content');
  if(currentRole!=='admin'){
    C.innerHTML='<div class="notice err">Gerenciamento de acessos exclusivo para administradores.</div>';
    return
  }
  C.innerHTML='<div class="panel">Carregando usuários e permissões...</div>';
  try{await listAccounts()}catch(err){
    C.innerHTML='<div class="panel"><h3>Acessos indisponíveis</h3><div class="notice err">'+esc(err.message||'Erro ao consultar usuários.')+'</div><button type="button" class="btn secondary" id="accessRetry">Tentar novamente</button></div>';
    E('accessRetry').onclick=function(){accessPage()};return
  }
  C.innerHTML='<div class="access-management">'
   +'<div class="access-title"><div><h2>Gerenciamento de acessos</h2><p>Cadastre proprietários e inquilinos, ajuste permissões, altere senhas e exclua contas.</p></div><span class="access-admin-only">Área restrita ao administrador</span></div>'
   +accessOverview()
   +'<div class="access-columns">'+accessForm()
   +'<section class="panel access-list-panel"><div class="access-panel-head"><div><h3>Contas cadastradas</h3><p>Gerencie uma conta sem alterar os dados dos imóveis ou dos contratos.</p></div><span class="access-count">'+accessState.accounts.length+'</span></div>'
   +'<label class="access-search-label" for="accessSearch">Pesquisar acesso</label>'
   +'<input id="accessSearch" class="inp access-search" type="search" autocomplete="off" placeholder="Nome, perfil, vínculo, telefone ou e-mail" value="'+esc(accessState.query)+'">'
   +'<div id="accessList" class="access-account-list"></div></section></div>'
   +'<p class="access-footnote">A exclusão remove a conta de login, não o cadastro do proprietário ou do inquilino. As contas administrativas são protegidas nesta seção.</p></div>';
  setRoleFields('newAccess',false);
  E('newAccessRole').onchange=function(){setRoleFields('newAccess',false);E('newAccessName').value='';E('newAccessPhone').value=''};
  E('newAccessLink').onchange=function(){setPersonFields('newAccess',true)};
  E('accessSearch').oninput=function(){accessState.query=this.value;renderAccessList()};
  E('newOwnerLink').onclick=function(){
    if(window.MatosSettings&&typeof window.MatosSettings.open==='function')window.MatosSettings.open('Proprietários')
  };
  E('newAccessReveal').onclick=function(){
    var p=E('newAccessPassword');p.type=p.type==='password'?'text':'password';
    this.textContent=p.type==='password'?'Mostrar':'Ocultar'
  };
  E('newAccessGenerate').onclick=function(){E('newAccessPassword').value=passwordStrong()};
  E('newAccessSave').onclick=async function(){
    if(currentRole!=='admin')return;
    var role=E('newAccessRole').value,linked=E('newAccessLink').value,nome=E('newAccessName').value.trim();
    var phone=E('newAccessPhone').value,email=E('newAccessEmail').value.trim(),pw=E('newAccessPassword').value;
    var btn=this,msg=E('newAccessMessage');
    if(!linked||!nome||pw.length<12||(role==='proprietario_consulta'?!validPhone(phone):!/^\S+@\S+\.\S+$/.test(email))){
      message(msg,'Informe pessoa, nome, '+(role==='proprietario_consulta'?'celular válido':'e-mail válido')+' e senha com pelo menos 12 caracteres.','error');return
    }
    var payload={action:'create',role:role,nome:nome,password:pw};
    if(ownerLinked(role))payload.proprietario_id=linked;else payload.inquilino_id=linked;
    if(role==='proprietario_consulta')payload.telefone=onlyDigits(phone);else payload.email=email;
    btn.disabled=true;message(msg,'Criando acesso seguro...','info');
    try{
      var result=await accessRpc(payload);
      if(!result||!result.ok)throw new Error('A criação não foi confirmada pelo servidor.');
      E('newAccessPassword').value='';
      accessState.feedback='Acesso de '+nome+' criado com sucesso.';
      await load()
    }catch(error){message(msg,error.message||'Falha ao criar o acesso.','error')}
    finally{btn.disabled=false}
  };
  renderAccessList();
  if(accessState.feedback){
    var notice=document.createElement('div');
    notice.className='notice success access-flash';
    notice.setAttribute('role','status');
    notice.textContent=accessState.feedback;
    accessState.feedback='';
    C.insertBefore(notice,C.firstChild)
  }
}
function openDialog(content){
  var existing=E('matosAccessDialog');if(existing)existing.remove();
  var root=document.createElement('div');root.id='matosAccessDialog';root.className='modalbg access-modal-overlay';
  root.innerHTML=content;document.body.appendChild(root);
  function close(){document.removeEventListener('keydown',escKey);root.remove()}
  function escKey(e){if(e.key==='Escape')close()}
  document.addEventListener('keydown',escKey);
  root.addEventListener('click',function(e){if(e.target===root)close()});
  Array.prototype.forEach.call(root.querySelectorAll('[data-access-close]'),function(b){b.onclick=close});
  return {root:root,close:close}
}
function editRoleFields(a){
  var role=E('editAccessRole').value,phone=E('editAccessPhoneWrap'),email=E('editAccessEmailWrap');
  E('editAccessLink').innerHTML=ownerLinkOptions(role,role===a.role?(role==='inquilino'?a.inquilino_id:a.proprietario_id):'');
  phone.hidden=role!=='proprietario_consulta';
  email.hidden=role==='proprietario_consulta';
  E('editAccessNote').textContent=rolePermission(role);
  if(role==='proprietario_consulta'&&!E('editAccessPhone').value.trim()){
    var person=linkedPeople(role).find(function(p){return p.id===E('editAccessLink').value});
    E('editAccessPhone').value=person&&person.telefone?formattedPhone(person.telefone):''
  }
}
function showEdit(a){
  var modal=openDialog('<section class="modal access-dialog" role="dialog" aria-modal="true" aria-labelledby="editAccessTitle">'
    +'<div class="modalhead"><div><h2 id="editAccessTitle">Editar acesso</h2><small>'+esc(a.nome||'Conta')+'</small></div><button class="close" type="button" data-access-close aria-label="Fechar">×</button></div>'
    +'<div class="modalbody"><div id="editAccessMessage" role="status" aria-live="polite"></div>'
    +'<div class="field"><label class="lbl" for="editAccessRole">Perfil de acesso *</label><select id="editAccessRole" class="inp">'+roleOptions(a.role)+'</select></div>'
    +'<div id="editAccessNote" class="access-permission-note"></div>'
    +'<div class="field"><label class="lbl" for="editAccessLink">Pessoa vinculada *</label><select id="editAccessLink" class="inp"></select></div>'
    +'<div class="field"><label class="lbl" for="editAccessName">Nome exibido *</label><input id="editAccessName" class="inp" autocomplete="off" maxlength="160" value="'+esc(a.nome||'')+'"></div>'
    +'<div class="field" id="editAccessPhoneWrap"><label class="lbl" for="editAccessPhone">Celular de login com DDD *</label><input id="editAccessPhone" class="inp" type="tel" autocomplete="off" value="'+esc(formattedPhone(a.telefone_login)==='—'?'':formattedPhone(a.telefone_login))+'"><small>Se alterar o celular, atualize primeiro o telefone no cadastro do proprietário.</small></div>'
    +'<div class="field" id="editAccessEmailWrap" hidden><label class="lbl" for="editAccessEmail">E-mail de login *</label><input id="editAccessEmail" class="inp" type="email" autocomplete="off" value="'+esc(a.email||'')+'"></div>'
    +'</div><div class="modalfoot"><button type="button" class="btn secondary" data-access-close>Cancelar</button><button type="button" class="btn primary" id="editAccessSave">Salvar alterações</button></div></section>');
  editRoleFields(a);
  E('editAccessRole').onchange=function(){editRoleFields(a)};
  E('editAccessLink').onchange=function(){
    var person=linkedPeople(E('editAccessRole').value).find(function(p){return p.id===E('editAccessLink').value});
    if(person){E('editAccessName').value=person.nome||'';if(E('editAccessRole').value==='proprietario_consulta')E('editAccessPhone').value=formattedPhone(person.telefone)}
  };
  E('editAccessSave').onclick=async function(){
    if(currentRole!=='admin')return;
    var role=E('editAccessRole').value,linked=E('editAccessLink').value;
    var name=E('editAccessName').value.trim(),phone=E('editAccessPhone').value,email=E('editAccessEmail').value.trim();
    var msg=E('editAccessMessage'),btn=this;
    if(!name||!linked||(role==='proprietario_consulta'?!validPhone(phone):!/^\S+@\S+\.\S+$/.test(email))){
      message(msg,'Informe nome, pessoa vinculada e telefone ou e-mail válido.','error');return
    }
    if(role!==a.role&&!window.confirm('Alterar o perfil modifica imediatamente as permissões desta conta. Confirmar?'))return;
    var data={action:'update_access',user_id:a.user_id,role:role,nome:name};
    if(ownerLinked(role))data.proprietario_id=linked;else data.inquilino_id=linked;
    if(role==='proprietario_consulta')data.telefone=onlyDigits(phone);else data.email=email;
    btn.disabled=true;message(msg,'Salvando dados do acesso...','info');
    try{
      var result=await accessRpc(data);
      if(!result||!result.ok)throw new Error('Alteração não confirmada pelo servidor.');
      accessState.feedback='Acesso de '+name+' atualizado.';
      modal.close();await load()
    }catch(error){message(msg,error.message||'Falha ao editar acesso.','error')}
    finally{if(modal.root.isConnected)btn.disabled=false}
  };
  E('editAccessName').focus()
}
function passwordFields(prefix){
  return '<div class="field"><label class="lbl" for="'+prefix+'Input">Nova senha *</label>'
    +'<div class="access-password-input"><input id="'+prefix+'Input" class="inp" type="password" minlength="12" maxlength="128" autocomplete="new-password">'
    +'<button id="'+prefix+'Toggle" type="button" class="access-inline-button">Mostrar</button></div>'
    +'<button id="'+prefix+'Generate" type="button" class="access-owner-link">Gerar senha forte</button>'
    +'<small>A nova senha deve ter pelo menos 12 caracteres. A senha anterior não pode ser consultada.</small></div>'
}
function showPassword(a){
  var modal=openDialog('<section class="modal access-dialog" role="dialog" aria-modal="true" aria-labelledby="passAccessTitle">'
    +'<div class="modalhead"><div><h2 id="passAccessTitle">Alterar senha</h2><small>'+esc(a.nome||'Conta')+'</small></div><button type="button" class="close" data-access-close>×</button></div>'
    +'<div class="modalbody"><p class="access-panel-hint">A senha antiga será substituída. A pessoa deverá usar a nova senha no próximo login.</p>'
    +passwordFields('accessReset')+'<div id="accessResetMessage" role="status" aria-live="polite"></div></div>'
    +'<div class="modalfoot"><button type="button" class="btn secondary" data-access-close>Cancelar</button><button type="button" class="btn primary" id="accessResetSave">Salvar nova senha</button></div></section>');
  E('accessResetGenerate').onclick=function(){E('accessResetInput').value=passwordStrong()};
  E('accessResetToggle').onclick=function(){var input=E('accessResetInput');input.type=input.type==='password'?'text':'password';this.textContent=input.type==='password'?'Mostrar':'Ocultar'};
  E('accessResetSave').onclick=async function(){
    var password=E('accessResetInput').value,msg=E('accessResetMessage'),btn=this;
    if(password.length<12||password.length>128){message(msg,'A senha precisa ter entre 12 e 128 caracteres.','error');return}
    btn.disabled=true;message(msg,'Atualizando senha...','info');
    try{
      var result=await accessRpc({action:'reset_password',user_id:a.user_id,password:password});
      if(!result||!result.ok)throw new Error('O servidor não confirmou a alteração da senha.');
      E('accessResetInput').value='';
      accessState.feedback='Senha de '+(a.nome||'conta')+' alterada. Entregue a senha por um canal seguro.';
      modal.close();await load()
    }catch(error){message(msg,error.message||'Não foi possível alterar a senha.','error')}
    finally{if(modal.root.isConnected)btn.disabled=false}
  };
  E('accessResetInput').focus()
}
function showDelete(a){
  var modal=openDialog('<section class="modal access-dialog" role="dialog" aria-modal="true" aria-labelledby="removeAccessTitle">'
    +'<div class="modalhead"><div><h2 id="removeAccessTitle">Excluir acesso</h2><small>'+esc(a.nome||'Conta')+'</small></div><button type="button" class="close" data-access-close>×</button></div>'
    +'<div class="modalbody"><div class="access-delete-warning"><b>Esta exclusão remove a conta de login.</b><p>A pessoa não poderá mais entrar. O cadastro do proprietário ou inquilino, os contratos, cobranças e comprovantes do sistema não serão apagados.</p></div>'
    +'<div class="field"><label class="lbl" for="removeAccessReason">Motivo da exclusão *</label><textarea id="removeAccessReason" class="inp" maxlength="240" rows="3" placeholder="Ex.: usuário cadastrado incorretamente"></textarea><small>De 8 a 240 caracteres para o histórico administrativo.</small></div>'
    +'<div class="field"><label class="lbl" for="removeAccessConfirm">Digite EXCLUIR para confirmar *</label><input id="removeAccessConfirm" class="inp" autocomplete="off" placeholder="EXCLUIR"></div>'
    +'<div id="removeAccessMessage" role="status" aria-live="polite"></div></div>'
    +'<div class="modalfoot"><button type="button" class="btn secondary" data-access-close>Cancelar</button><button type="button" class="btn access-danger-button" id="removeAccessSave">Excluir definitivamente</button></div></section>');
  E('removeAccessSave').onclick=async function(){
    if(currentRole!=='admin')return;
    var why=E('removeAccessReason').value.trim(),typed=E('removeAccessConfirm').value.trim();
    var msg=E('removeAccessMessage'),btn=this;
    if(why.length<8||why.length>240||typed!=='EXCLUIR'){
      message(msg,'Informe o motivo e digite EXCLUIR exatamente como indicado.','error');return
    }
    btn.disabled=true;message(msg,'Excluindo conta de autenticação e preservando dados da carteira...','info');
    try{
      var result=await accessRpc({action:'delete_access',user_id:a.user_id,reason:why});
      if(!result||!result.ok)throw new Error('O servidor não confirmou a exclusão.');
      accessState.feedback='Acesso de '+(a.nome||'usuário')+' excluído. Os imóveis e pagamentos foram preservados.';
      modal.close();await load()
    }catch(error){message(msg,error.message||'Não foi possível excluir a conta.','error')}
    finally{if(modal.root.isConnected)btn.disabled=false}
  };
  E('removeAccessReason').focus()
}
window.accesses=accessPage;
window.MatosAccessManagement={roleLabels:ROLES,formatPhone:formattedPhone};
})();