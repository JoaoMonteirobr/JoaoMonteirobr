/* Avatar do administrador: foto privada ou personagem em emoji.
   O administrador escolhe o próprio avatar; as demais contas não podem editar. */
(function (root) {
 'use strict';
 var CHOICES=[
  ['😎','Estiloso'],['🤓','Intelectual'],['🤠','Cowboy'],['🥳','Animado'],
  ['😺','Gatinho'],['🐼','Panda'],['🦁','Leão'],['🐯','Tigre'],
  ['🦊','Raposa'],['🐻','Urso'],['🐸','Sapinho'],['🐵','Macaquinho'],
  ['🦄','Unicórnio'],['🐉','Dragão'],['👽','Alien'],['🤖','Robô'],
  ['👻','Fantasminha'],['🎃','Abóbora'],['🧙','Mago'],['🧑‍🚀','Astronauta'],
  ['🦸','Super-herói'],['🥷','Ninja'],['👑','Realeza'],['🦖','Dinossauro']
 ];
 var allowed=CHOICES.map(function(a){return a[0]});
 var imageCache={path:null,url:null,promise:null};
 var previewUrl=null;

 function ownAvatar(){
  return currentRole==='admin'&&session&&session.user&&currentProfile;
 }
 function validEmoji(value){return allowed.indexOf(value)>=0}
 function clearImageCache(){
  if(imageCache.url){URL.revokeObjectURL(imageCache.url)}
  imageCache={path:null,url:null,promise:null}
 }
 function applyHeader(){
  var el=document.querySelector('.appbar .user .av');
  if(!el||!session||!session.user)return;
  var name=currentProfile&&currentProfile.nome||session.user.email||'M';
  el.innerHTML=headerHtml(currentProfile,String(name).charAt(0).toUpperCase())
 }
 function headerHtml(profile,initial){
  if(!ownAvatar()||!profile)return esc(initial||'M');
  if(profile.avatar_tipo==='emoji'&&validEmoji(profile.avatar_emoji)){
   return '<span class="matos-avatar-emoji" aria-label="Personagem escolhido">'+esc(profile.avatar_emoji)+'</span>'
  }
  if(profile.avatar_tipo==='foto'&&profile.avatar_path){
   var path=profile.avatar_path;
   if(imageCache.path===path&&imageCache.url){
    return '<img class="matos-avatar-photo" src="'+esc(imageCache.url)+'" alt="Foto do administrador">'
   }
   ensurePhoto(path).catch(function(){});
  }
  return esc(initial||'M')
 }
 function ensurePhoto(path){
  var uid=session&&session.user&&session.user.id||'';
  if(!uid||currentRole!=='admin'||!path.startsWith(uid+'/'))return Promise.resolve(null);
  if(imageCache.path===path&&imageCache.url)return Promise.resolve(imageCache.url);
  if(imageCache.path===path&&imageCache.promise)return imageCache.promise;
  clearImageCache();
  var myPromise=(async function(){
   var res=await fetch(SUPA_URL+'/storage/v1/object/authenticated/avatares-admin/'+
     path.split('/').map(encodeURIComponent).join('/'),{
       headers:{apikey:KEY,Authorization:'Bearer '+session.access_token}
     });
   if(!res.ok)throw new Error('Não foi possível carregar a foto de perfil.');
   var file=await res.blob();
   if(file.type&&!['image/jpeg','image/png','image/webp'].includes(file.type))
    throw new Error('Formato de avatar inesperado.');
   if(file.size>2097152)throw new Error('Foto acima do tamanho permitido.');
   var url=URL.createObjectURL(file);
   if(!session||!session.user||session.user.id!==uid||!currentProfile||
      currentProfile.avatar_path!==path||currentProfile.avatar_tipo!=='foto'){
    URL.revokeObjectURL(url);return null
   }
   imageCache={path:path,url:url,promise:null};
   var pic=document.getElementById('matosAvatarPreview');
   if(pic)pic.innerHTML='<img class="matos-avatar-preview-photo" src="'+esc(url)+'" alt="Sua foto de perfil">';
   var header=document.querySelector('.appbar .user .av');
   if(header)header.innerHTML='<img class="matos-avatar-photo" src="'+esc(url)+'" alt="Foto do administrador">';
   return url
  })().catch(function(err){imageCache={path:null,url:null,promise:null};throw err});
  imageCache.path=path;imageCache.promise=myPromise;return myPromise
 }
 function photoMarkup(){
  var profile=currentProfile||{};
  if(profile.avatar_tipo==='emoji'&&validEmoji(profile.avatar_emoji))
   return '<span class="matos-avatar-preview-emoji">'+esc(profile.avatar_emoji)+'</span>';
  if(profile.avatar_tipo==='foto'&&profile.avatar_path){
   if(imageCache.path===profile.avatar_path&&imageCache.url)
    return '<img class="matos-avatar-preview-photo" src="'+esc(imageCache.url)+'" alt="Sua foto de perfil">';
   ensurePhoto(profile.avatar_path).catch(function(){});
   return '<span class="matos-avatar-preview-initial">'+esc((profile.nome||'M').charAt(0).toUpperCase())+'</span>'
  }
  return '<span class="matos-avatar-preview-initial">'+esc((profile.nome||'M').charAt(0).toUpperCase())+'</span>'
 }
 function pickerHtml(){
  if(currentRole!=='admin')return '';
  return '<section class="panel matos-avatar-panel" aria-labelledby="matosAvatarHeading">'
    +'<div class="matos-avatar-heading"><div><h3 id="matosAvatarHeading">Sua foto ou personagem</h3>'
    +'<p>Escolha uma foto ou um emoji divertido para aparecer no seu perfil e no topo do Matos.</p></div>'
    +'<span class="matos-avatar-custom-badge">Personalize seu perfil</span></div>'
    +'<div class="matos-avatar-preview-row"><div id="matosAvatarPreview" class="matos-avatar-preview" aria-live="polite">'+photoMarkup()+'</div>'
    +'<div class="matos-avatar-prompt"><b>Este avatar é só seu!</b><span>Experimente um personagem e mude quando quiser.</span>'
    +'<div class="matos-avatar-upload-actions"><label class="btn secondary matos-avatar-select-file" for="matosAvatarFile">Escolher foto</label>'
    +'<input id="matosAvatarFile" class="matos-avatar-file" type="file" accept="image/jpeg,image/png,image/webp">'
    +'<button id="matosAvatarSavePhoto" class="btn primary" type="button" disabled>Salvar foto</button>'
    +'<button id="matosAvatarReset" class="matos-avatar-clear" type="button">Usar minha inicial</button></div>'
    +'<small>JPG, PNG ou WEBP • a foto será otimizada e guardada em área privada.</small></div></div>'
    +'<div class="matos-avatar-gallery-header"><h4>Qual personagem combina com você?</h4>'
    +'<p>Toque em um emoji para usar como seu avatar.</p></div>'
    +'<div id="matosAvatarEmojis" class="matos-avatar-emoji-grid" role="group" aria-label="Escolher personagem">'
    +CHOICES.map(function(p){
      var selected=currentProfile&&currentProfile.avatar_tipo==='emoji'&&currentProfile.avatar_emoji===p[0];
      return '<button class="matos-avatar-choice'+(selected?' is-selected':'')+'" type="button"'
        +' data-avatar-emoji="'+esc(p[0])+'" title="'+esc(p[1])+'" aria-label="'+esc(p[1])+'" aria-pressed="'+(selected?'true':'false')+'">'
        +'<span aria-hidden="true">'+esc(p[0])+'</span><small>'+esc(p[1])+'</small></button>'
    }).join('')+'</div>'
    +'<div id="matosAvatarStatus" class="matos-avatar-status" role="status" aria-live="polite"></div>'
    +'</section>'
 }
 function setStatus(text,isError){
  var el=document.getElementById('matosAvatarStatus');
  if(el){el.textContent=text||'';el.className='matos-avatar-status'+(isError?' is-error':'')}
 }
 function busy(active){
  Array.prototype.forEach.call(document.querySelectorAll('.matos-avatar-choice, #matosAvatarReset'),function(btn){btn.disabled=active});
  var upload=document.getElementById('matosAvatarSavePhoto');
  if(upload)upload.disabled=active||!(document.getElementById('matosAvatarFile')||{}).files?.length;
  var file=document.getElementById('matosAvatarFile');if(file)file.disabled=active
 }
 async function saveChoice(type,emoji,path){
  var response=await request('/rest/v1/rpc/definir_meu_avatar',{
   method:'POST',headers:authHeaders(session.access_token),
   body:JSON.stringify({p_tipo:type,p_emoji:emoji||null,p_path:path||null})
  });
  if(!response||response.ok!==true)throw new Error('O sistema não confirmou a troca de avatar.');
  if(type!=='foto')clearImageCache();
  currentProfile.avatar_tipo=response.avatar_tipo;
  currentProfile.avatar_emoji=response.avatar_emoji;
  currentProfile.avatar_path=response.avatar_path;
  applyHeader();
  var box=document.getElementById('matosAvatarPreview');
  if(box)box.innerHTML=photoMarkup();
  Array.prototype.forEach.call(document.querySelectorAll('.matos-avatar-choice'),function(el){
    var selected=type==='emoji'&&el.getAttribute('data-avatar-emoji')===emoji;
    el.classList.toggle('is-selected',selected);
    el.setAttribute('aria-pressed',selected?'true':'false')
  });
 }
 async function deleteOld(path){
  if(!path||!session||!session.user||!path.startsWith(session.user.id+'/'))return;
  try{
   await fetch(SUPA_URL+'/storage/v1/object/avatares-admin/'+path.split('/').map(encodeURIComponent).join('/'),{
    method:'DELETE',headers:{apikey:KEY,Authorization:'Bearer '+session.access_token}
   })
  }catch(_){}
 }
 async function convertPhoto(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))
   throw new Error('Escolha uma foto JPG, PNG ou WEBP.');
  if(file.size>12*1024*1024)throw new Error('A foto original deve ter até 12 MB.');
  var temp=URL.createObjectURL(file);
  try{
   var im=await new Promise(function(resolve,reject){
    var img=new Image();img.onload=function(){resolve(img)};img.onerror=function(){reject(new Error('Não foi possível abrir a imagem.'))};
    img.src=temp
   });
   var longer=Math.max(im.naturalWidth,im.naturalHeight);
   if(!longer||longer>15000)throw new Error('Dimensões da imagem não permitidas.');
   var ratio=Math.min(1,960/longer),canvas=document.createElement('canvas');
   canvas.width=Math.round(im.naturalWidth*ratio);canvas.height=Math.round(im.naturalHeight*ratio);
   var ctx=canvas.getContext('2d');
   if(!ctx)throw new Error('Não foi possível processar sua foto.');
   ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(im,0,0,canvas.width,canvas.height);
   var blob=await new Promise(function(resolve){canvas.toBlob(resolve,'image/jpeg',0.82)});
   if(!blob||blob.size>2097152)throw new Error('Foto muito grande após a otimização.');
   return blob
  }finally{URL.revokeObjectURL(temp)}
 }
 async function uploadPhoto(file){
  var uid=session&&session.user&&session.user.id;
  if(!uid||currentRole!=='admin')throw new Error('Somente o administrador pode alterar a foto.');
  var blob=await convertPhoto(file);
  var path=uid+'/'+crypto.randomUUID()+'.jpg';
  var url=SUPA_URL+'/storage/v1/object/avatares-admin/'+path.split('/').map(encodeURIComponent).join('/');
  var res=await fetch(url,{method:'POST',headers:{
   apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'image/jpeg','x-upsert':'false'
  },body:blob});
  if(!res.ok){
   var msg=await res.text();throw new Error('Envio da foto recusado. '+(res.status===413?'Reduza o tamanho da imagem.':'Tente novamente.'))
  }
  return path
 }
 function previewSelectedFile(file){
  if(previewUrl)URL.revokeObjectURL(previewUrl);
  previewUrl=null;
  if(!file)return;
  previewUrl=URL.createObjectURL(file);
  var pic=document.getElementById('matosAvatarPreview');
  if(pic)pic.innerHTML='<img class="matos-avatar-preview-photo" src="'+esc(previewUrl)+'" alt="Prévia da foto selecionada">'
 }
 function mountPicker(){
  if(!ownAvatar())return;
  var picker=document.getElementById('matosAvatarEmojis'),file=document.getElementById('matosAvatarFile'),
   save=document.getElementById('matosAvatarSavePhoto'),reset=document.getElementById('matosAvatarReset');
  if(!picker||!file||!save||!reset)return;
  picker.onclick=async function(ev){
   var button=ev.target.closest&&ev.target.closest('[data-avatar-emoji]');
   if(!button||currentRole!=='admin')return;
   var emoji=button.getAttribute('data-avatar-emoji');
   if(!validEmoji(emoji))return;
   busy(true);setStatus('Salvando personagem...');
   var old=currentProfile.avatar_path;
   try{
    await saveChoice('emoji',emoji,null);
    if(old)deleteOld(old);
    if(file.value)file.value='';
    if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null}
    setStatus('Personagem atualizado no seu perfil!')
   }catch(err){setStatus(err.message||'Não foi possível salvar o personagem.',true)}
   finally{busy(false)}
  };
  reset.onclick=async function(){
   busy(true);setStatus('Restaurando inicial...');
   var old=currentProfile.avatar_path;
   try{
    await saveChoice('inicial',null,null);
    if(old)deleteOld(old);
    file.value='';
    if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null}
    setStatus('Agora sua inicial aparece no topo.')
   }catch(err){setStatus(err.message||'Não foi possível restaurar a inicial.',true)}
   finally{busy(false)}
  };
  file.onchange=function(){
   var selected=file.files&&file.files[0];
   if(!selected){save.disabled=true;return}
   if(!['image/jpeg','image/png','image/webp'].includes(selected.type)||selected.size>12*1024*1024){
    setStatus('Escolha JPG, PNG ou WEBP de até 12 MB.',true);file.value='';save.disabled=true;return
   }
   previewSelectedFile(selected);save.disabled=false;
   setStatus('Foto selecionada. Clique em Salvar foto para confirmar.')
  };
  save.onclick=async function(){
   var selected=file.files&&file.files[0];
   if(!selected||!ownAvatar())return;
   busy(true);setStatus('Otimizando e enviando sua foto...');
   var path=null,old=currentProfile.avatar_path;
   try{
    path=await uploadPhoto(selected);
    await saveChoice('foto',null,path);
    if(old&&old!==path)deleteOld(old);
    file.value='';
    if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null}
    setStatus('Foto salva! Ela já aparece no topo do Matos.')
   }catch(err){
    if(path)deleteOld(path);
    setStatus(err.message||'Não foi possível salvar a foto.',true)
   }finally{busy(false)}
  }
 }
 root.MatosAvatar={
  choices:CHOICES,validEmoji:validEmoji,
  headerHtml:headerHtml,applyHeader:applyHeader,
  pickerHtml:pickerHtml,mountPicker:mountPicker,
  convertPhoto:convertPhoto,clearCache:clearImageCache
 };
})(window);
