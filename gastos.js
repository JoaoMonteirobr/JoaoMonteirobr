// =====================================================
// ABA GASTOS (somente administrador)
// =====================================================
// Despesas por prédio inteiro ou por unidade, com tipos cadastráveis e
// várias notas fiscais/fotos por gasto (bucket privado gastos-notas).
// Tabelas: gasto_tipos, gastos, gasto_anexos (migration 20261102120000_gastos.sql).
(function(root){
'use strict';
var BUCKET='gastos-notas',MAX_FILE=10*1024*1024;
var FILE_TYPES=['application/pdf','image/jpeg','image/png','image/webp','image/heic'];
var METHODS={pix:'PIX',dinheiro:'Dinheiro',cartao_credito:'Cartão de crédito',cartao_debito:'Cartão de débito',transferencia:'Transferência',boleto:'Boleto',outro:'Outro'};
var MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ---------- Regras puras (cobertas por tests/unit/gastos.test.js) ----------

// Compara nomes sem diferenciar maiúsculas, acentos e espaços extras.
function norm(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim().toLowerCase()}

function unitName(im){return im&&(im.nome||im.complemento)||'Imóvel'}

// Endereço (prédio) de um gasto: o texto gravado no escopo prédio, ou o endereço da unidade.
function buildingOf(g,imById,label){if(g.escopo==='predio')return g.predio||'Endereço não informado';var im=imById[g.imovel_id];return im?label(im):'Imóvel removido'}

// Prédios a partir dos imóveis cadastrados, cada um com suas unidades.
function buildingsFrom(ims,label){
 var byLabel={},list=[];
 (ims||[]).forEach(function(im){var l=label(im),b=byLabel[l];if(!b){b={label:l,units:[]};byLabel[l]=b;list.push(b)}b.units.push({id:im.id,name:unitName(im)})});
 list.sort(function(a,b){return a.label.localeCompare(b.label,'pt-BR',{numeric:true})});
 list.forEach(function(b){b.units.sort(function(x,y){return x.name.localeCompare(y.name,'pt-BR',{numeric:true})})});
 return list;
}

// Períodos para o filtro: mês atual, meses com gastos, anos e "todo o período".
function periodOptions(gastos,today){
 var months={},years={},cur=String(today).slice(0,7);months[cur]=1;years[cur.slice(0,4)]=1;
 (gastos||[]).forEach(function(g){var d=String(g.data||'');if(d.length>=7){months[d.slice(0,7)]=1;years[d.slice(0,4)]=1}});
 var opts=[];
 Object.keys(years).sort().reverse().forEach(function(y){
  opts.push({v:y,t:'Ano de '+y});
  Object.keys(months).filter(function(m){return m.slice(0,4)===y}).sort().reverse().forEach(function(m){opts.push({v:m,t:MONTHS[Number(m.slice(5,7))-1]+' de '+y})});
 });
 opts.push({v:'all',t:'Todo o período'});
 return opts;
}
function inPeriod(date,p){return p==='all'||String(date||'').indexOf(p)===0}

// Filtros: período, lugar ('all', 'b:<prédio>' ou 'u:<imovel_id>') e tipo ('all' ou id).
function filterGastos(gastos,f,imById,label){
 return (gastos||[]).filter(function(g){
  if(!inPeriod(g.data,f.period))return false;
  if(f.tipo!=='all'&&g.tipo_id!==f.tipo)return false;
  if(f.place==='all')return true;
  if(f.place.indexOf('u:')===0)return g.imovel_id===f.place.slice(2);
  return buildingOf(g,imById,label)===f.place.slice(2);
 });
}

// Agrupa por prédio (ordem alfabética) e ordena cada grupo do mais recente ao mais antigo.
function groupByBuilding(items,imById,label){
 var map={},groups=[];
 items.forEach(function(g){var l=buildingOf(g,imById,label),grp=map[l];if(!grp){grp={label:l,total:0,items:[]};map[l]=grp;groups.push(grp)}grp.items.push(g);grp.total+=Number(g.valor||0)});
 groups.sort(function(a,b){return a.label.localeCompare(b.label,'pt-BR',{numeric:true})});
 groups.forEach(function(grp){grp.items.sort(function(a,b){return String(b.data).localeCompare(String(a.data))||String(b.created_at||'').localeCompare(String(a.created_at||''))})});
 return groups;
}

// Total, quantidade e os 3 tipos com maior gasto.
function summarize(items,tiposById){
 var by={},total=0;
 items.forEach(function(g){var v=Number(g.valor||0);total+=v;var n=tiposById[g.tipo_id]&&tiposById[g.tipo_id].nome||'Sem tipo';by[n]=(by[n]||0)+v});
 var byType=Object.keys(by).map(function(n){return {nome:n,total:by[n]}}).sort(function(a,b){return b.total-a.total}).slice(0,3);
 return {total:Math.round(total*100)/100,count:items.length,byType:byType};
}

// Validação do formulário; devolve a mensagem de erro ou ''.
function validateGasto(f){
 if(f.escopo==='predio'&&!String(f.predio||'').trim())return 'Escolha o prédio.';
 if(f.escopo==='unidade'&&!f.imovel_id)return 'Escolha a unidade.';
 if(!f.tipo_id)return 'Escolha o tipo do gasto.';
 if(!(Number(f.valor)>0))return 'Informe um valor maior que zero.';
 if(!f.data)return 'Informe a data.';
 if(!String(f.descricao||'').trim())return 'Descreva o que foi feito.';
 return '';
}

// Nome de tipo: obrigatório, até 60 caracteres e sem repetir (exceto o próprio, ao renomear).
function typeNameError(name,tipos,exceptId){
 var n=String(name||'').replace(/\s+/g,' ').trim();
 if(!n)return 'Digite o nome do tipo.';
 if(n.length>60)return 'Use no máximo 60 caracteres.';
 var dup=(tipos||[]).find(function(t){return t.id!==exceptId&&norm(t.nome)===norm(n)});
 return dup?'Já existe um tipo chamado “'+dup.nome+'”'+(dup.ativo===false?' (desativado; reative-o na lista).':'.'):'';
}
function cleanTypeName(name){var n=String(name||'').replace(/\s+/g,' ').trim();return n.charAt(0).toUpperCase()+n.slice(1)}

function fileProblem(file){
 if(FILE_TYPES.indexOf(file.type)<0)return '“'+file.name+'”: use PDF ou foto (JPG, PNG, WEBP, HEIC).';
 if(file.size>MAX_FILE)return '“'+file.name+'” passa de 10 MB.';
 return '';
}
function safeFileName(name){return String(name||'arquivo').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-80)}

// Converte "1.234,56" ou "1234.56" em número.
function parseMoney(v){var s=String(v||'').trim().replace(/\s|R\$/g,'');if(s.indexOf(',')>=0)s=s.replace(/\./g,'').replace(',','.');var n=Number(s);return Number.isFinite(n)?Math.round(n*100)/100:NaN}

var pure={norm:norm,unitName:unitName,buildingOf:buildingOf,buildingsFrom:buildingsFrom,periodOptions:periodOptions,inPeriod:inPeriod,filterGastos:filterGastos,groupByBuilding:groupByBuilding,summarize:summarize,validateGasto:validateGasto,typeNameError:typeNameError,cleanTypeName:cleanTypeName,fileProblem:fileProblem,safeFileName:safeFileName,parseMoney:parseMoney};
root.MatosGastos=pure;

// ---------- Tela (depende do núcleo do app) ----------
if(typeof root.adminMenus==='undefined'||typeof root.load!=='function')return;

var S={period:null,place:'all',tipo:'all',sel:null};

function L(){return root.MatosLocation&&root.MatosLocation.label||function(im){return [im.endereco,im.numero].filter(Boolean).join(', ')||'Endereço não informado'}}
function localToday(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function index(list){var m={};(list||[]).forEach(function(x){m[x.id]=x});return m}

async function loadData(){
 await Promise.all(['gasto_tipos','gastos','gasto_anexos','imoveis'].map(function(t){return cache[t]?Promise.resolve(cache[t]):dbGet(t)}));
 var tipos=(cache.gasto_tipos||[]).slice().sort(function(a,b){return a.nome.localeCompare(b.nome,'pt-BR')});
 return {tipos:tipos,tiposById:index(tipos),gastos:cache.gastos||[],anexos:cache.gasto_anexos||[],ims:cache.imoveis||[],imById:index(cache.imoveis)};
}
function invalidate(){cache.gastos=null;cache.gasto_tipos=null;cache.gasto_anexos=null}

// Arquivos no Storage (mesmo padrão de payment-docs.js).
function objectUrl(path){return SUPA_URL+'/storage/v1/object/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/')}
async function uploadFile(gastoId,file){
 var path=gastoId+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'-'+safeFileName(file.name);
 var res=await fetch(objectUrl(path),{method:'POST',headers:{'apikey':KEY,'Authorization':'Bearer '+session.access_token,'Content-Type':file.type,'x-upsert':'false'},body:file});
 if(!res.ok)throw new Error('Não foi possível enviar “'+file.name+'”.');
 await dbInsert('gasto_anexos',{gasto_id:gastoId,arquivo_path:path,arquivo_nome:file.name,arquivo_tipo:file.type});
}
async function removeFile(path){await fetch(objectUrl(path),{method:'DELETE',headers:{'apikey':KEY,'Authorization':'Bearer '+session.access_token}})}
async function openFile(path){
 var w=window.open('','_blank');
 try{
  var d=await request('/storage/v1/object/sign/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:authHeaders(session.access_token),body:JSON.stringify({expiresIn:300})});
  var u=d&&(d.signedURL||d.signedUrl);if(!u)throw new Error('Não foi possível abrir o arquivo.');
  u=u.indexOf('http')===0?u:SUPA_URL+'/storage/v1'+u;
  if(w)w.location=u;else window.location=u;
 }catch(e){if(w)w.close();alert(e.message)}
}

// ---------- Página ----------
async function gastosPage(){
 var C=E('content');C.innerHTML='<div class="panel">Carregando gastos...</div>';
 var D=await loadData(),label=L(),today=localToday();
 var periods=periodOptions(D.gastos,today);
 if(!S.period||!periods.some(function(p){return p.v===S.period}))S.period=today.slice(0,4);
 if(S.tipo!=='all'&&!D.tiposById[S.tipo])S.tipo='all';
 var buildings=buildingsFrom(D.ims,label);
 var items=filterGastos(D.gastos,S,D.imById,label),sum=summarize(items,D.tiposById),groups=groupByBuilding(items,D.imById,label);
 var anexosBy={};D.anexos.forEach(function(a){(anexosBy[a.gasto_id]=anexosBy[a.gasto_id]||[]).push(a)});
 var periodLabel=(periods.find(function(p){return p.v===S.period})||{}).t||'';
 var activeTypes=D.tipos.filter(function(t){return t.ativo!==false});
 var chips=[{id:'all',nome:'Todos'}].concat(activeTypes).map(function(t){return '<button type="button" class="gx-chip'+(S.tipo===t.id?' on':'')+'" data-tipo="'+esc(t.id)+'">'+esc(t.nome)+'</button>'}).join('');
 var placeOpts='<option value="all">Todos os imóveis</option>'+buildings.map(function(b){return '<option value="b:'+esc(b.label)+'"'+(S.place==='b:'+b.label?' selected':'')+'>'+esc(b.label)+' (prédio todo)</option>'+b.units.map(function(u){return '<option value="u:'+esc(u.id)+'"'+(S.place==='u:'+u.id?' selected':'')+'>&nbsp;&nbsp;— '+esc(u.name)+'</option>'}).join('')}).join('');
 var max=sum.byType.length?sum.byType[0].total:0;
 var byType=sum.byType.map(function(t){return '<div><span>'+esc(t.nome)+'</span><i><u style="width:'+(max?Math.round(t.total/max*100):0)+'%"></u></i><b>'+money(t.total)+'</b></div>'}).join('')||'<small class="gx-muted">Sem gastos no período.</small>';
 var list=groups.map(function(grp){
  return '<section class="gx-group"><h3>'+esc(grp.label)+' <small>'+grp.items.length+' · '+money(grp.total)+'</small></h3>'+grp.items.map(function(g){
   var t=D.tiposById[g.tipo_id],n=(anexosBy[g.id]||[]).length,where=g.escopo==='predio'?'Prédio inteiro':unitName(D.imById[g.imovel_id]);
   return '<button type="button" class="gx-row'+(S.sel===g.id?' sel':'')+'" data-gasto="'+esc(g.id)+'"><span class="gx-date">'+esc(dateBR(g.data).slice(0,5))+'</span><span class="gx-what"><b>'+esc(g.descricao)+'</b><small>'+esc(where)+'</small></span><span class="gx-tagcol"><span class="gx-tag">'+esc(t&&t.nome||'—')+'</span></span><span class="gx-val">'+money(g.valor)+'</span><span class="gx-clip">'+(n?'📎'+n:'')+'</span></button>';
  }).join('')+'</section>';
 }).join('')||'<div class="gx-empty">Nenhum gasto encontrado com esses filtros.<br><button type="button" class="btn primary" id="gxEmptyNew">+ Lançar gasto</button></div>';

 C.innerHTML='<div class="gx">'
  +'<div class="gx-head"><div><h2>Gastos</h2><p>Despesas com os imóveis, reparos e notas fiscais.</p></div><div class="gx-actions"><button type="button" class="btn secondary" id="gxTypes">🏷️ Tipos</button><button type="button" class="btn primary" id="gxNew">+ Novo gasto</button></div></div>'
  +'<div class="gx-filters"><select id="gxPeriod" class="inp" aria-label="Período">'+periods.map(function(p){return '<option value="'+esc(p.v)+'"'+(p.v===S.period?' selected':'')+'>'+esc(p.t)+'</option>'}).join('')+'</select><select id="gxPlace" class="inp" aria-label="Imóvel">'+placeOpts+'</select><div class="gx-chips">'+chips+'</div></div>'
  +'<div class="gx-summary"><div class="gx-card gx-total"><span>Total gasto · '+esc(periodLabel)+'</span><b>'+money(sum.total)+'</b></div><div class="gx-card"><span>Lançamentos</span><b>'+sum.count+(sum.count===1?' gasto':' gastos')+'</b></div><div class="gx-card"><span>Por tipo</span><div class="gx-bytype">'+byType+'</div></div></div>'
  +'<div class="gx-layout"><div>'+list+'</div><aside class="gx-detail" id="gxDetail"><div class="gx-empty-det">Escolha um gasto na lista para ver os detalhes e as notas fiscais.</div></aside></div>'
  +'</div>';

 E('gxPeriod').onchange=function(){S.period=this.value;S.sel=null;gastosPage()};
 E('gxPlace').onchange=function(){S.place=this.value;S.sel=null;gastosPage()};
 Array.prototype.forEach.call(C.querySelectorAll('[data-tipo]'),function(b){b.onclick=function(){S.tipo=b.dataset.tipo;S.sel=null;gastosPage()}});
 Array.prototype.forEach.call(C.querySelectorAll('[data-gasto]'),function(b){b.onclick=function(){S.sel=b.dataset.gasto;Array.prototype.forEach.call(C.querySelectorAll('.gx-row'),function(r){r.classList.toggle('sel',r===b)});showDetail(D,anexosBy,true)}});
 E('gxNew').onclick=function(){openGastoForm(D,null)};
 if(E('gxEmptyNew'))E('gxEmptyNew').onclick=function(){openGastoForm(D,null)};
 E('gxTypes').onclick=function(){openTypes(D)};
 if(S.sel&&items.some(function(g){return g.id===S.sel}))showDetail(D,anexosBy,false);
 else if(items.length&&window.innerWidth>760){S.sel=groups[0].items[0].id;C.querySelector('.gx-row').classList.add('sel');showDetail(D,anexosBy,false)}
}

function showDetail(D,anexosBy,userAction){
 var g=D.gastos.find(function(x){return x.id===S.sel}),box=E('gxDetail');if(!g||!box)return;
 var t=D.tiposById[g.tipo_id],label=L(),files=anexosBy[g.id]||[];
 var where=g.escopo==='predio'?'Prédio inteiro':unitName(D.imById[g.imovel_id]);
 var row=function(k,v){return v?'<dt>'+k+'</dt><dd>'+esc(v)+'</dd>':''};
 box.innerHTML='<button type="button" class="gx-back" id="gxBack">← Voltar</button><span class="gx-tag">'+esc(t&&t.nome||'—')+'</span><h3>'+esc(g.descricao)+'</h3><p class="gx-where">'+esc(buildingOf(g,D.imById,label))+' · '+esc(where)+'</p><div class="gx-amount">'+money(g.valor)+'</div>'
  +'<dl>'+row('Data',dateBR(g.data))+row('Quem fez',g.fornecedor)+row('Pagamento',METHODS[g.forma_pagamento])+'</dl>'
  +(g.observacoes?'<div class="gx-note">'+esc(g.observacoes)+'</div>':'')
  +'<h4>Notas fiscais e fotos ('+files.length+')</h4>'
  +(files.length?'<div class="gx-files">'+files.map(function(a){var pdf=String(a.arquivo_tipo||'').indexOf('pdf')>=0;return '<div class="gx-file"><button type="button" class="gx-open" data-open="'+esc(a.arquivo_path)+'"><i class="'+(pdf?'pdf':'img')+'">'+(pdf?'PDF':'IMG')+'</i><span>'+esc(a.arquivo_nome)+'</span></button><button type="button" class="gx-x" title="Remover arquivo" data-rm="'+esc(a.id)+'">×</button></div>'}).join('')+'</div>':'<p class="gx-muted">Nenhum arquivo anexado.</p>')
  +'<div class="gx-foot"><button type="button" class="btn secondary" id="gxEdit">✏️ Editar / anexar</button><button type="button" class="btn secondary gx-danger" id="gxDel">Excluir</button></div>';
 if(userAction)box.classList.add('open');
 E('gxBack').onclick=function(){box.classList.remove('open')};
 E('gxEdit').onclick=function(){openGastoForm(D,g)};
 E('gxDel').onclick=function(){deleteGasto(g,files)};
 Array.prototype.forEach.call(box.querySelectorAll('[data-open]'),function(b){b.onclick=function(){openFile(b.dataset.open)}});
 Array.prototype.forEach.call(box.querySelectorAll('[data-rm]'),function(b){b.onclick=async function(){
  var a=files.find(function(x){return x.id===b.dataset.rm});if(!a||!confirm('Remover o arquivo “'+a.arquivo_nome+'”?'))return;
  try{await removeFile(a.arquivo_path);await dbDelete('gasto_anexos',a.id);invalidate();gastosPage()}catch(e){alert(e.message)}
 }});
}

async function deleteGasto(g,files){
 if(!confirm('Excluir este gasto'+(files.length?' e seus '+files.length+' arquivo(s)':'')+'? Isso não pode ser desfeito.'))return;
 try{
  for(var i=0;i<files.length;i++){try{await removeFile(files[i].arquivo_path)}catch(e){/* arquivo órfão não impede excluir o gasto */}}
  await dbDelete('gastos',g.id);S.sel=null;invalidate();gastosPage();
 }catch(e){alert(e.message)}
}

// ---------- Formulário: novo gasto / editar ----------
function openGastoForm(D,g){
 if(E('modal'))E('modal').remove();
 var label=L(),buildings=buildingsFrom(D.ims,label),editing=!!g,pending=[];
 var curBuilding=g?buildingOf(g,D.imById,label):(buildings[0]&&buildings[0].label||'');
 var active=D.tipos.filter(function(t){return t.ativo!==false||(g&&t.id===g.tipo_id)});
 var methodOpts='<option value="">—</option>'+Object.keys(METHODS).map(function(k){return '<option value="'+k+'"'+(g&&g.forma_pagamento===k?' selected':'')+'>'+METHODS[k]+'</option>'}).join('');
 var buildingOpts=buildings.map(function(b){return '<option'+(b.label===curBuilding?' selected':'')+'>'+esc(b.label)+'</option>'}).join('');
 if(g&&g.escopo==='predio'&&!buildings.some(function(b){return b.label===curBuilding}))buildingOpts='<option selected>'+esc(curBuilding)+'</option>'+buildingOpts;
 document.body.insertAdjacentHTML('beforeend','<div class="modalbg gx-modal" id="modal"><div class="modal simple-modal"><div class="modalhead"><div><h2>'+(editing?'Editar gasto':'Novo gasto')+'</h2><small>Campos com * são obrigatórios.</small></div><button id="closemodal" class="close" type="button">×</button></div><div class="modalbody"><div id="formmsg"></div><div class="formgrid">'
  +'<div class="field full"><span class="lbl">Onde foi o gasto? *</span><div class="gx-seg"><button type="button" data-scope="predio">Prédio inteiro</button><button type="button" data-scope="unidade">Uma unidade</button></div></div>'
  +'<div class="field"><span class="lbl">Prédio / endereço *</span><select id="gx_building" class="inp">'+buildingOpts+'</select></div>'
  +'<div class="field"><span class="lbl">Unidade</span><select id="gx_unit" class="inp"></select></div>'
  +'<div class="field"><span class="lbl">Tipo *</span><select id="gx_tipo" class="inp"></select><div id="gxNewTypeBox" class="gx-newtype" hidden><input id="gx_newtype" class="inp" placeholder="Nome do novo tipo" maxlength="60"><button type="button" class="btn primary" id="gxCreateType">Criar</button><button type="button" class="btn secondary" id="gxCancelType">×</button></div><small id="gxTypeMsg" class="gx-typemsg"></small></div>'
  +'<div class="field"><span class="lbl">Valor (R$) *</span><input id="gx_valor" class="inp" inputmode="decimal" placeholder="0,00" value="'+(g?esc(Number(g.valor).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})):'')+'"></div>'
  +'<div class="field"><span class="lbl">Data *</span><input id="gx_data" class="inp" type="date" value="'+esc(g?g.data:localToday())+'"></div>'
  +'<div class="field"><span class="lbl">Forma de pagamento</span><select id="gx_forma" class="inp">'+methodOpts+'</select></div>'
  +'<div class="field full"><span class="lbl">Descrição *</span><textarea id="gx_desc" class="inp" rows="2" placeholder="Ex.: troca de 12 telhas quebradas e vedação da calha">'+esc(g&&g.descricao||'')+'</textarea></div>'
  +'<div class="field full"><span class="lbl">Quem fez / fornecedor</span><input id="gx_forn" class="inp" placeholder="Ex.: Zé Telhados – (00) 90000-0000" value="'+esc(g&&g.fornecedor||'')+'"></div>'
  +'<div class="field full"><span class="lbl">Observações</span><textarea id="gx_obs" class="inp" rows="2">'+esc(g&&g.observacoes||'')+'</textarea></div>'
  +'<div class="field full"><span class="lbl">Notas fiscais e fotos</span><div class="gx-drop">Anexe quantos arquivos precisar (PDF ou foto, até 10 MB cada).<div class="gx-dropbtns"><label class="btn secondary">📷 Tirar foto<input id="gx_cam" type="file" accept="image/*" capture="environment" hidden></label><label class="btn secondary">📎 Escolher arquivos<input id="gx_files" type="file" multiple accept="'+FILE_TYPES.join(',')+'" hidden></label></div><ul id="gx_pending" class="gx-pending"></ul></div></div>'
  +'</div></div><div class="modalfoot"><button id="cancelmodal" class="btn secondary" type="button">Cancelar</button><button id="gxSave" class="btn primary" type="button">'+(editing?'Salvar alterações':'Salvar gasto')+'</button></div></div></div>');

 var scope=g?g.escopo:'predio';
 function fillUnits(){var b=buildings.find(function(x){return x.label===E('gx_building').value}),sel=E('gx_unit');
  if(scope==='predio'){sel.innerHTML='<option value="">— (prédio inteiro)</option>';sel.disabled=true;return}
  sel.disabled=false;sel.innerHTML=(b?b.units:[]).map(function(u){return '<option value="'+esc(u.id)+'"'+(g&&g.imovel_id===u.id?' selected':'')+'>'+esc(u.name)+'</option>'}).join('')||'<option value="">Nenhuma unidade neste endereço</option>'}
 function setScope(s){scope=s;Array.prototype.forEach.call(document.querySelectorAll('.gx-seg button'),function(b){b.classList.toggle('on',b.dataset.scope===s)});fillUnits()}
 function fillTypes(selectId){E('gx_tipo').innerHTML=active.map(function(t){return '<option value="'+esc(t.id)+'">'+esc(t.nome)+(t.ativo===false?' (desativado)':'')+'</option>'}).join('')+'<option value="__new">+ Cadastrar novo tipo…</option>';if(selectId)E('gx_tipo').value=selectId}
 function drawPending(){E('gx_pending').innerHTML=pending.map(function(f,i){return '<li><span>'+esc(f.name)+'</span><button type="button" data-drop="'+i+'" title="Tirar da lista">×</button></li>'}).join('');Array.prototype.forEach.call(document.querySelectorAll('[data-drop]'),function(b){b.onclick=function(){pending.splice(Number(b.dataset.drop),1);drawPending()}})}
 function addFiles(list){var msg=E('formmsg'),errs=[];Array.prototype.forEach.call(list||[],function(f){var p=fileProblem(f);if(p)errs.push(p);else pending.push(f)});msg.innerHTML=errs.length?'<div class="notice err">'+errs.map(esc).join('<br>')+'</div>':'';drawPending()}

 fillTypes(g?g.tipo_id:(active[0]&&active[0].id));
 if(g&&g.escopo==='unidade'){var im=D.imById[g.imovel_id];if(im)E('gx_building').value=label(im)}
 setScope(scope);
 Array.prototype.forEach.call(document.querySelectorAll('.gx-seg button'),function(b){b.onclick=function(){setScope(b.dataset.scope)}});
 E('gx_building').onchange=fillUnits;
 E('gx_tipo').onchange=function(){E('gxNewTypeBox').hidden=this.value!=='__new';if(this.value==='__new')E('gx_newtype').focus()};
 E('gxCancelType').onclick=function(){E('gxNewTypeBox').hidden=true;E('gx_tipo').selectedIndex=0;E('gxTypeMsg').textContent=''};
 var createType=async function(){var name=E('gx_newtype').value,err=typeNameError(name,D.tipos),m=E('gxTypeMsg');m.className='gx-typemsg'+(err?' err':'');if(err){m.textContent=err;return}
  try{var r=await dbInsert('gasto_tipos',{nome:cleanTypeName(name)}),t=r&&r[0];if(!t)throw new Error('Não foi possível criar o tipo.');D.tipos.push(t);D.tiposById[t.id]=t;active.push(t);cache.gasto_tipos=null;fillTypes(t.id);E('gxNewTypeBox').hidden=true;E('gx_newtype').value='';m.textContent='Tipo “'+t.nome+'” criado e selecionado.'}catch(e){m.className='gx-typemsg err';m.textContent=e.message}};
 E('gxCreateType').onclick=createType;
 E('gx_newtype').onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();createType()}};
 E('gx_cam').onchange=function(){addFiles(this.files);this.value=''};
 E('gx_files').onchange=function(){addFiles(this.files);this.value=''};
 E('closemodal').onclick=E('cancelmodal').onclick=function(){E('modal').remove()};

 E('gxSave').onclick=async function(){
  var msg=E('formmsg'),btn=this;
  var f={escopo:scope,predio:scope==='predio'?E('gx_building').value:null,imovel_id:scope==='unidade'?E('gx_unit').value||null:null,tipo_id:E('gx_tipo').value==='__new'?'':E('gx_tipo').value,valor:parseMoney(E('gx_valor').value),data:E('gx_data').value,descricao:E('gx_desc').value.trim(),fornecedor:E('gx_forn').value.trim()||null,forma_pagamento:E('gx_forma').value||null,observacoes:E('gx_obs').value.trim()||null};
  var err=validateGasto(f);if(err){msg.innerHTML='<div class="notice err">'+esc(err)+'</div>';return}
  btn.disabled=true;msg.innerHTML='<div class="notice">Salvando...</div>';
  try{
   var saved=editing?await dbUpdate('gastos',g.id,f):await dbInsert('gastos',f),id=editing?g.id:(saved&&saved[0]&&saved[0].id);
   if(!id)throw new Error('Não foi possível salvar o gasto.');
   var failed=[];
   for(var i=0;i<pending.length;i++){msg.innerHTML='<div class="notice">Enviando arquivo '+(i+1)+' de '+pending.length+'...</div>';try{await uploadFile(id,pending[i])}catch(e){failed.push(pending[i].name)}}
   invalidate();S.sel=id;
   if(failed.length){btn.disabled=false;pending=pending.filter(function(p){return failed.indexOf(p.name)>=0});drawPending();msg.innerHTML='<div class="notice err">O gasto foi salvo, mas estes arquivos não foram enviados: '+failed.map(esc).join(', ')+'. Tente salvar de novo.</div>';editing=true;g=Object.assign({},f,{id:id});return}
   E('modal').remove();gastosPage();
  }catch(e){btn.disabled=false;msg.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}
 };
}

// ---------- Tipos ----------
function openTypes(D){
 if(E('modal'))E('modal').remove();
 var count={};D.gastos.forEach(function(g){count[g.tipo_id]=(count[g.tipo_id]||0)+1});
 var rows=D.tipos.map(function(t){var c=count[t.id]||0;return '<div class="gx-type'+(t.ativo===false?' off':'')+'"><span class="gx-tag">'+esc(t.nome)+'</span><small>'+(t.ativo===false?'desativado · ':'')+c+(c===1?' gasto':' gastos')+'</small><button type="button" class="btn secondary" data-ren="'+esc(t.id)+'">Renomear</button><button type="button" class="btn secondary" data-tog="'+esc(t.id)+'">'+(t.ativo===false?'Reativar':'Desativar')+'</button></div>'}).join('');
 document.body.insertAdjacentHTML('beforeend','<div class="modalbg gx-modal" id="modal"><div class="modal simple-modal"><div class="modalhead"><div><h2>Tipos de gasto</h2><small>Tipos desativados somem da lista de escolha, mas os gastos antigos continuam com o nome deles.</small></div><button id="closemodal" class="close" type="button">×</button></div><div class="modalbody"><div id="formmsg"></div>'+rows+'<div class="gx-addtype"><input id="gx_typename" class="inp" placeholder="Nome do novo tipo" maxlength="60"><button type="button" class="btn primary" id="gxAddType">Adicionar</button></div></div></div></div>');
 var msg=E('formmsg'),done=async function(){E('modal').remove();invalidate();await gastosPage();openTypes(await loadData())};
 var fail=function(e){msg.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'};
 E('closemodal').onclick=function(){E('modal').remove();invalidate();gastosPage()};
 var add=async function(){var name=E('gx_typename').value,err=typeNameError(name,D.tipos);if(err){msg.innerHTML='<div class="notice err">'+esc(err)+'</div>';return}try{await dbInsert('gasto_tipos',{nome:cleanTypeName(name)});await done()}catch(e){fail(e)}};
 E('gxAddType').onclick=add;E('gx_typename').onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();add()}};
 Array.prototype.forEach.call(document.querySelectorAll('[data-ren]'),function(b){b.onclick=async function(){var t=D.tiposById[b.dataset.ren],n=prompt('Novo nome para “'+t.nome+'”:',t.nome);if(n==null)return;var err=typeNameError(n,D.tipos,t.id);if(err){msg.innerHTML='<div class="notice err">'+esc(err)+'</div>';return}try{await dbUpdate('gasto_tipos',t.id,{nome:cleanTypeName(n)});await done()}catch(e){fail(e)}}});
 Array.prototype.forEach.call(document.querySelectorAll('[data-tog]'),function(b){b.onclick=async function(){var t=D.tiposById[b.dataset.tog];try{await dbUpdate('gasto_tipos',t.id,{ativo:t.ativo===false});await done()}catch(e){fail(e)}}});
}

// ---------- Menu e roteamento ----------
if(adminMenus.indexOf('Gastos')<0){var at=adminMenus.indexOf('Configurações');adminMenus.splice(at>=0?at:adminMenus.length,0,'Gastos')}
var prevIcon=root.navIcon;navIcon=function(x){return x==='Gastos'?'▦':prevIcon(x)};root.navIcon=navIcon;
var prevLoad=root.load;
load=async function(){
 if(page==='Gastos'){
  if(currentRole!=='admin'){page='Dashboard';return prevLoad.apply(this,arguments)}
  try{return await gastosPage()}catch(e){E('content').innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}
  return;
 }
 return prevLoad.apply(this,arguments);
};root.load=load;
})(typeof window!=='undefined'?window:globalThis);
