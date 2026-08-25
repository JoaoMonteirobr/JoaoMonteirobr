(function(){
'use strict';

['Documentos','Vistorias'].forEach(function(x){if(adminMenus.indexOf(x)<0)adminMenus.push(x);if(ownerMenus.indexOf(x)<0)ownerMenus.push(x);if(tenantMenus.indexOf(x)<0)tenantMenus.push(x)});

var docCats=['Contrato','Vistoria','IPTU','Comprovante','Documento do imóvel','Seguro','Laudo','Foto','Outro'];
var vistTipos={entrada:'Entrada',saida:'Saída',periodica:'Periódica',manutencao:'Manutenção'};
var estados={novo:'Novo',bom:'Bom',regular:'Regular',ruim:'Ruim',danificado:'Danificado'};
function opt(arr,val){return arr.map(function(x){return '<option value="'+esc(x)+'" '+(x===val?'selected':'')+'>'+esc(x)+'</option>'}).join('')}
function imovelNome(id){var x=(cache.imoveis||[]).find(function(i){return i.id===id});return x?x.nome:'—'}
function contratoNome(id){var c=(cache.contratos||[]).find(function(x){return x.id===id});if(!c)return '—';return imovelNome(c.imovel_id)+' • '+dateBR(c.data_inicio)+' a '+dateBR(c.data_fim)}
async function ensureDocsLookups(){await Promise.all(['imoveis','contratos','proprietarios','inquilinos'].map(function(t){return cache[t]?Promise.resolve(cache[t]):dbGet(t)}))}

async function uploadPrivate(file,prefix){
 var allowed=['image/jpeg','image/png','image/webp','application/pdf'];
 if(allowed.indexOf(file.type)<0)throw new Error('Formato não permitido. Use JPG, PNG, WEBP ou PDF.');
 if(file.size>15*1024*1024)throw new Error('O arquivo deve ter no máximo 15 MB.');
 var safe=(file.name||'arquivo').replace(/[^a-zA-Z0-9._-]/g,'_');
 var path=(prefix||'documentos')+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,10)+'-'+safe;
 var url=SUPA_URL+'/storage/v1/object/documentos-imoveis/'+path.split('/').map(encodeURIComponent).join('/');
 var res=await fetch(url,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':file.type,'x-upsert':'false'},body:file});
 if(!res.ok)throw new Error((await res.text())||'Falha ao enviar arquivo.');
 return {path:path,nome:file.name,tipo:file.type};
}
window.openDocumentoPrivado=async function(path){
 if(!path)return;var w=window.open('','_blank');
 try{var enc=path.split('/').map(encodeURIComponent).join('/'),d=await request('/storage/v1/object/sign/documentos-imoveis/'+enc,{method:'POST',headers:authHeaders(session.access_token),body:JSON.stringify({expiresIn:300})}),u=d&&d.signedURL;if(!u)throw new Error('Não foi possível abrir o arquivo.');if(w)w.location=(u.indexOf('http')===0?u:SUPA_URL+u)}catch(e){if(w)w.close();alert(e.message)}
};

async function documentosPage(){
 await ensureDocsLookups();var C=E('content');C.innerHTML='<div class="panel">Carregando documentos...</div>';
 try{
  var docs=await request('/rest/v1/documentos?select=*&order=created_at.desc',{headers:authHeaders(session.access_token)});
  var form='';
  if(currentRole==='admin'){
   form='<div class="panel" style="margin-bottom:14px"><div class="panel-title"><h3>Novo documento</h3></div><div class="formgrid"><div class="field"><span class="lbl">Título *</span><input id="doc_titulo" class="inp"></div><div class="field"><span class="lbl">Categoria *</span><select id="doc_categoria" class="inp">'+opt(docCats,'Contrato')+'</select></div><div class="field"><span class="lbl">Imóvel</span><select id="doc_imovel" class="inp"><option value="">Selecione</option>'+cache.imoveis.map(function(x){return '<option value="'+x.id+'">'+esc(x.nome)+'</option>'}).join('')+'</select></div><div class="field"><span class="lbl">Contrato</span><select id="doc_contrato" class="inp"><option value="">Selecione</option>'+cache.contratos.map(function(x){return '<option value="'+x.id+'">'+esc(contratoNome(x.id))+'</option>'}).join('')+'</select></div><div class="field"><span class="lbl">Data do documento</span><input id="doc_data" type="date" class="inp"></div><div class="field"><span class="lbl">Validade</span><input id="doc_validade" type="date" class="inp"></div><div class="field full"><span class="lbl">Arquivo *</span><input id="doc_arquivo" type="file" class="inp" accept="image/jpeg,image/png,image/webp,application/pdf"><small>PDF, JPG, PNG ou WEBP. Máximo de 15 MB.</small></div><div class="field full"><span class="lbl">Observações</span><textarea id="doc_obs" class="inp"></textarea></div></div><button id="doc_salvar" class="btn primary">Salvar documento</button><div id="doc_msg"></div></div>';
  }
  var rows=(docs||[]).map(function(d){var val=d.validade?dateBR(d.validade):'—',vence=d.validade&&new Date(d.validade+'T23:59:59')<new Date();return '<tr><td><b>'+esc(d.titulo)+'</b><br><small class="muted">'+esc(d.arquivo_nome)+'</small></td><td>'+esc(d.categoria)+'</td><td>'+esc(imovelNome(d.imovel_id))+'</td><td>'+dateBR(d.data_documento)+'</td><td>'+(vence?'<span class="badge red">Vencido '+val+'</span>':val)+'</td><td><button class="linkmini" onclick="openDocumentoPrivado(decodeURIComponent(\''+encodeURIComponent(d.arquivo_path)+'\'))">Abrir</button>'+(currentRole==='admin'?' <button class="linkmini" onclick="excluirDocumento(\''+d.id+'\',decodeURIComponent(\''+encodeURIComponent(d.arquivo_path)+'\'))">Excluir</button>':'')+'</td></tr>'}).join('');
  C.innerHTML=form+'<div class="panel"><div class="panel-title"><h3>Central de documentos</h3></div><p class="muted">Arquivos privados vinculados aos imóveis e contratos. Proprietários e inquilinos visualizam somente o que estiver relacionado aos seus próprios registros.</p><div class="tablewrap"><table class="table"><thead><tr><th>Documento</th><th>Categoria</th><th>Imóvel</th><th>Data</th><th>Validade</th><th>Arquivo</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" class="empty">Nenhum documento cadastrado.</td></tr>')+'</tbody></table></div></div>';
  if(E('doc_salvar'))E('doc_salvar').onclick=salvarDocumento;
 }catch(e){C.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}
}
async function salvarDocumento(){
 var msg=E('doc_msg'),titulo=E('doc_titulo').value.trim(),file=E('doc_arquivo').files[0];if(!titulo||!file){msg.innerHTML='<div class="notice err">Informe o título e selecione o arquivo.</div>';return}
 msg.innerHTML='<div class="notice">Enviando documento...</div>';
 try{var up=await uploadPrivate(file,'documentos');var contrato=E('doc_contrato').value||null,ct=contrato?(cache.contratos||[]).find(function(x){return x.id===contrato}):null,imovel=E('doc_imovel').value||(ct&&ct.imovel_id)||null,inq=ct&&ct.inquilino_id||null,imo=(cache.imoveis||[]).find(function(x){return x.id===imovel}),obj={titulo:titulo,categoria:E('doc_categoria').value,imovel_id:imovel,contrato_id:contrato,proprietario_id:imo&&imo.proprietario_id||null,inquilino_id:inq,data_documento:E('doc_data').value||null,validade:E('doc_validade').value||null,arquivo_path:up.path,arquivo_nome:up.nome,arquivo_tipo:up.tipo,observacoes:E('doc_obs').value||null};await dbInsert('documentos',obj);documentosPage()}catch(e){msg.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}
}
window.excluirDocumento=async function(id,path){if(currentRole!=='admin'||!confirm('Excluir este documento?'))return;try{await dbDelete('documentos',id);var enc=path.split('/').map(encodeURIComponent).join('/');await fetch(SUPA_URL+'/storage/v1/object/documentos-imoveis/'+enc,{method:'DELETE',headers:{apikey:KEY,Authorization:'Bearer '+session.access_token}});documentosPage()}catch(e){alert(e.message)}};

async function vistoriasPage(){
 await ensureDocsLookups();var C=E('content');C.innerHTML='<div class="panel">Carregando vistorias...</div>';
 try{var vs=await request('/rest/v1/vistorias?select=*&order=data_vistoria.desc',{headers:authHeaders(session.access_token)}),form='';
 if(currentRole==='admin')form='<div class="panel" style="margin-bottom:14px"><div class="panel-title"><h3>Nova vistoria</h3></div><div class="formgrid"><div class="field"><span class="lbl">Imóvel *</span><select id="vis_imovel" class="inp"><option value="">Selecione</option>'+cache.imoveis.map(function(x){return '<option value="'+x.id+'">'+esc(x.nome)+'</option>'}).join('')+'</select></div><div class="field"><span class="lbl">Contrato</span><select id="vis_contrato" class="inp"><option value="">Opcional</option>'+cache.contratos.map(function(x){return '<option value="'+x.id+'">'+esc(contratoNome(x.id))+'</option>'}).join('')+'</select></div><div class="field"><span class="lbl">Tipo *</span><select id="vis_tipo" class="inp"><option value="entrada">Entrada</option><option value="saida">Saída</option><option value="periodica">Periódica</option><option value="manutencao">Manutenção</option></select></div><div class="field"><span class="lbl">Data *</span><input id="vis_data" type="date" class="inp" value="'+new Date().toISOString().slice(0,10)+'"></div><div class="field"><span class="lbl">Responsável</span><input id="vis_resp" class="inp"></div><div class="field full"><span class="lbl">Observações gerais</span><textarea id="vis_obs" class="inp"></textarea></div></div><button id="vis_salvar" class="btn primary">Criar vistoria</button><div id="vis_msg"></div></div>';
 var rows=(vs||[]).map(function(v){return '<tr><td>'+dateBR(v.data_vistoria)+'</td><td><b>'+esc(imovelNome(v.imovel_id))+'</b></td><td>'+esc(vistTipos[v.tipo]||v.tipo)+'</td><td>'+esc(v.responsavel||'—')+'</td><td>'+st(v.status==='concluida'?'concluido':'pendente')+'</td><td><button class="linkmini" onclick="abrirVistoria(\''+v.id+'\')">Ver itens</button></td></tr>'}).join('');
 C.innerHTML=form+'<div class="panel"><div class="panel-title"><h3>Vistorias</h3></div><p class="muted">Registre o estado do imóvel por cômodo, com observações e fotos.</p><div class="tablewrap"><table class="table"><thead><tr><th>Data</th><th>Imóvel</th><th>Tipo</th><th>Responsável</th><th>Situação</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" class="empty">Nenhuma vistoria cadastrada.</td></tr>')+'</tbody></table></div></div>';
 if(E('vis_salvar'))E('vis_salvar').onclick=salvarVistoria;
 }catch(e){C.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}
}
async function salvarVistoria(){var msg=E('vis_msg'),im=E('vis_imovel').value;if(!im){msg.innerHTML='<div class="notice err">Selecione o imóvel.</div>';return}try{await dbInsert('vistorias',{imovel_id:im,contrato_id:E('vis_contrato').value||null,tipo:E('vis_tipo').value,data_vistoria:E('vis_data').value,responsavel:E('vis_resp').value||null,status:'rascunho',observacoes:E('vis_obs').value||null});vistoriasPage()}catch(e){msg.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}}

window.abrirVistoria=async function(id){
 var C=E('content');C.innerHTML='<div class="panel">Carregando vistoria...</div>';
 try{var vr=await request('/rest/v1/vistorias?id=eq.'+encodeURIComponent(id)+'&select=*',{headers:authHeaders(session.access_token)}),v=vr&&vr[0];if(!v)throw new Error('Vistoria não encontrada.');var itens=await request('/rest/v1/vistoria_itens?vistoria_id=eq.'+encodeURIComponent(id)+'&select=*&order=created_at.asc',{headers:authHeaders(session.access_token)}),form='';
 if(currentRole==='admin'&&v.status!=='concluida')form='<div class="panel"><div class="panel-title"><h3>Adicionar item</h3></div><div class="formgrid"><div class="field"><span class="lbl">Cômodo *</span><input id="vi_comodo" class="inp" placeholder="Ex.: Sala"></div><div class="field"><span class="lbl">Item *</span><input id="vi_item" class="inp" placeholder="Ex.: Piso"></div><div class="field"><span class="lbl">Estado</span><select id="vi_estado" class="inp"><option value="novo">Novo</option><option value="bom" selected>Bom</option><option value="regular">Regular</option><option value="ruim">Ruim</option><option value="danificado">Danificado</option></select></div><div class="field"><span class="lbl">Foto opcional</span><input id="vi_foto" type="file" class="inp" accept="image/jpeg,image/png,image/webp"></div><div class="field full"><span class="lbl">Observações</span><textarea id="vi_obs" class="inp"></textarea></div></div><button id="vi_add" class="btn primary">Adicionar item</button> <button id="vi_finish" class="btn secondary">Concluir vistoria</button><div id="vi_msg"></div></div>';
 var rows=(itens||[]).map(function(i){return '<tr><td>'+esc(i.comodo)+'</td><td>'+esc(i.item)+'</td><td>'+esc(estados[i.estado]||i.estado)+'</td><td>'+esc(i.observacoes||'—')+'</td><td>'+(i.foto_path?'<button class="linkmini" onclick="openDocumentoPrivado(decodeURIComponent(\''+encodeURIComponent(i.foto_path)+'\'))">Abrir foto</button>':'—')+'</td></tr>'}).join('');
 C.innerHTML='<div class="panel"><div class="toolbar"><button class="btn secondary" onclick="goQuick(\'Vistorias\')">← Voltar</button><div><b>'+esc(imovelNome(v.imovel_id))+'</b><div class="muted">Vistoria de '+esc(vistTipos[v.tipo]||v.tipo)+' • '+dateBR(v.data_vistoria)+'</div></div></div></div>'+form+'<div class="panel"><div class="tablewrap"><table class="table"><thead><tr><th>Cômodo</th><th>Item</th><th>Estado</th><th>Observações</th><th>Foto</th></tr></thead><tbody>'+(rows||'<tr><td colspan="5" class="empty">Nenhum item registrado.</td></tr>')+'</tbody></table></div></div>';
 if(E('vi_add'))E('vi_add').onclick=function(){adicionarItemVistoria(id)};if(E('vi_finish'))E('vi_finish').onclick=function(){concluirVistoria(id)};
 }catch(e){C.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}
};
async function adicionarItemVistoria(id){var msg=E('vi_msg'),com=E('vi_comodo').value.trim(),item=E('vi_item').value.trim();if(!com||!item){msg.innerHTML='<div class="notice err">Informe cômodo e item.</div>';return}try{var foto=null,f=E('vi_foto').files[0];if(f)foto=await uploadPrivate(f,'vistorias/'+id);await dbInsert('vistoria_itens',{vistoria_id:id,comodo:com,item:item,estado:E('vi_estado').value,observacoes:E('vi_obs').value||null,foto_path:foto&&foto.path||null,foto_nome:foto&&foto.nome||null});abrirVistoria(id)}catch(e){msg.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}}
async function concluirVistoria(id){if(!confirm('Concluir esta vistoria? Depois disso ela ficará somente para consulta.'))return;try{await dbUpdate('vistorias',id,{status:'concluida'});abrirVistoria(id)}catch(e){alert(e.message)}}

var oldLoad=window.load;
window.load=async function(){if(page==='Documentos')return documentosPage();if(page==='Vistorias')return vistoriasPage();return oldLoad()};
})();
