(function(){
'use strict';

var paymentLabels={pix:'PIX',dinheiro:'Dinheiro',cartao_credito:'Cartão de crédito',cartao_debito:'Cartão de débito',transferencia:'Transferência',boleto:'Boleto',outro:'Outro'};

function hideHiddenFields(){['comprovante_path','comprovante_nome','comprovante_tipo'].forEach(function(k){var el=E('f_'+k);if(el&&el.closest('.field'))el.closest('.field').style.display='none'})}
function attachFileField(row){
 var modal=document.querySelector('#modal .formgrid');if(!modal)return;
 var current=row&&row.comprovante_nome?'<div class="notice success" style="margin-top:8px">Comprovante atual: <b>'+esc(row.comprovante_nome)+'</b></div>':'';
 modal.insertAdjacentHTML('beforeend','<div class="field full"><span class="lbl">Comprovante (opcional)</span><input id="f_comprovante_arquivo" class="inp" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"><small>Formatos aceitos: JPG, PNG, WEBP e PDF. Tamanho máximo: 10 MB.</small>'+current+'</div>');
}

var oldOpen=window.openForm;
window.openForm=async function(p,row){
 await oldOpen(p,row);
 if((p==='Cobranças'||p==='Financeiro')&&E('modal')){hideHiddenFields();attachFileField(row)}
};

async function uploadComprovante(){
 var input=E('f_comprovante_arquivo');if(!input||!input.files||!input.files[0])return null;
 var file=input.files[0],allowed=['image/jpeg','image/png','image/webp','application/pdf'];
 if(allowed.indexOf(file.type)<0)throw new Error('Formato de comprovante não permitido. Use JPG, PNG, WEBP ou PDF.');
 if(file.size>10*1024*1024)throw new Error('O comprovante deve ter no máximo 10 MB.');
 var safe=(file.name||'comprovante').replace(/[^a-zA-Z0-9._-]/g,'_'),path='pagamentos/'+Date.now()+'-'+Math.random().toString(36).slice(2,10)+'-'+safe;
 var res=await fetch(SUPA_URL+'/storage/v1/object/comprovantes/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:{'apikey':KEY,'Authorization':'Bearer '+session.access_token,'Content-Type':file.type,'x-upsert':'false'},body:file});
 if(!res.ok){var t=await res.text();throw new Error(t||'Não foi possível enviar o comprovante.');}
 return {path:path,nome:file.name,tipo:file.type};
}

var oldSave=window.saveForm;
window.saveForm=async function(p,id){
 if(p!=='Cobranças'&&p!=='Financeiro')return oldSave(p,id);
 var msg=E('formmsg');
 try{
   var up=await uploadComprovante();
   if(up){E('f_comprovante_path').value=up.path;E('f_comprovante_nome').value=up.nome;E('f_comprovante_tipo').value=up.tipo}
   return await oldSave(p,id);
 }catch(e){if(msg)msg.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}
};

window.openComprovante=async function(path){
 if(!path)return;
 var w=window.open('','_blank');
 try{
   var enc=path.split('/').map(encodeURIComponent).join('/');
   var d=await request('/storage/v1/object/sign/comprovantes/'+enc,{method:'POST',headers:authHeaders(session.access_token),body:JSON.stringify({expiresIn:300})});
   var u=d&&d.signedURL;if(!u)throw new Error('Não foi possível gerar o acesso ao comprovante.');
   if(w)w.location=(u.indexOf('http')===0?u:SUPA_URL+u);else window.location=(u.indexOf('http')===0?u:SUPA_URL+u);
 }catch(e){if(w)w.close();alert(e.message)}
};

var oldFormat=window.formatCell;
window.formatCell=function(k,v){
 if(k==='forma_pagamento')return esc(paymentLabels[v]||'—');
 if(k==='comprovante_path')return v?'<button class="linkmini" type="button" onclick="openComprovante(decodeURIComponent(\''+encodeURIComponent(v)+'\'))">Abrir comprovante</button>':'—';
 return oldFormat(k,v);
};

})();
