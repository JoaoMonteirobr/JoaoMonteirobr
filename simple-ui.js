(function(){
'use strict';

// Define os menus visíveis para cada perfil de usuário.
// Mesma navegação operacional para administrador e proprietário de consulta geral.
// A diferença é a permissão: somente o administrador recebe ações de escrita.
var consultaMenus=['Dashboard','Cadastros','Inquilinos','Contratos','Pagamentos','IPTU','Chamados','Financeiro','Repasses','Gastos','Documentos','Vistorias','Relatórios'];
var adminMain=consultaMenus.concat(['Acessos','Configurações']);
var ownerMain=['Dashboard','Pagamentos','IPTU','Chamados','Relatórios'];
var tenantMain=['Dashboard','Pagamentos','IPTU','Chamados'];
adminMenus=adminMain; ownerMenus=ownerMain; tenantMenus=tenantMain;
// Liga cada tela simplificada à tabela correspondente no banco.
tables.Pagamentos='cobrancas'; tables.Chamados='manutencoes'; tables.Cadastros='imoveis';
// Funções auxiliares para competência mensal, vencimentos e contratos ativos.
function isoMonth(d){return (d||new Date().toISOString()).slice(0,7)}
function monthStart(k){return k+'-01'}
function monthEnd(k){var p=k.split('-');return new Date(Number(p[0]),Number(p[1]),0).toISOString().slice(0,10)}
function activeInMonth(c,k){var a=monthStart(k),b=monthEnd(k),ini=String(c.data_inicio||'').slice(0,10),fim=String(c.data_fim||'').slice(0,10),status=String(c.status||'').toLowerCase();/* As datas do contrato são a fonte principal para a competência. Um status encerrado não deve apagar meses em que o contrato esteve vigente. */if(ini&&ini>b)return false;if(fim&&fim<a)return false;if(!ini&&!fim&&status==='encerrado')return false;return true}
function dueDate(c,k){var day=Math.max(1,Math.min(28,Number(c.dia_vencimento||10)));return k+'-'+String(day).padStart(2,'0')}
function paymentFor(contractId,k,charges,propertyId){return (charges||[]).find(function(x){var sameMonth=String(x.competencia||x.vencimento||'').slice(0,7)===k;return sameMonth&&((contractId&&x.contrato_id===contractId)||(propertyId&&x.imovel_id===propertyId))})||null}
function expected(c,im){return Number(c&&c.aluguel_atual||im&&im.aluguel_base||0)}
// Monta o resumo mensal: contrato + imóvel + inquilino + pagamento.
function buildLedger(contracts,charges,ims,inqs,k){
 var used={};
 var rows=contracts.filter(function(c){return activeInMonth(c,k)}).map(function(c){
  var im=ims.find(function(x){return x.id===c.imovel_id}),inq=inqs.find(function(x){return x.id===c.inquilino_id}),pay=paymentFor(c.id,k,charges,c.imovel_id),prev=expected(c,im),paid=Number(pay&&pay.valor_pago||0);if(c.imovel_id)used[c.imovel_id]=true;
  return {contract:c,charge:pay,property:im,tenant:inq,expected:prev,paid:paid,pending:Math.max(0,prev-paid),status:paid>=prev&&prev>0?'pago':'pendente',due:pay&&pay.vencimento||dueDate(c,k)}
 });
 ims.filter(function(im){return !used[im.id]&&Number(im.aluguel_base||0)>0}).forEach(function(im){var pay=paymentFor(null,k,charges,im.id),inq=inqs.find(function(x){return x.id===im.inquilino_id}),prev=Number(im.aluguel_base||0),paid=Number(pay&&pay.valor_pago||0),virtual={id:'property:'+im.id,imovel_id:im.id,inquilino_id:im.inquilino_id||null,aluguel_atual:prev,dia_vencimento:5};rows.push({contract:virtual,charge:pay,property:im,tenant:inq,expected:prev,paid:paid,pending:Math.max(0,prev-paid),status:paid>=prev&&prev>0?'pago':'pendente',due:pay&&pay.vencimento||dueDate(virtual,k)})});
 return rows
}
function monthPicker(id,k){return '<input id="'+id+'" class="inp month-input" type="month" value="'+esc(k)+'">'}
function summaryCards(rows){
 var prev=rows.reduce(function(s,r){return s+r.expected},0),paid=rows.reduce(function(s,r){return s+r.paid},0),pend=rows.reduce(function(s,r){return s+r.pending},0),ok=rows.filter(function(r){return r.status==='pago'}).length;
 return '<div class="simple-cards"><div class="simple-card"><span>Previsto</span><b>'+money(prev)+'</b><small>'+rows.length+' locações ativas</small></div><div class="simple-card positive"><span>Recebido</span><b>'+money(paid)+'</b><small>'+ok+' pagamentos informados</small></div><div class="simple-card danger"><span>Pendente</span><b>'+money(pend)+'</b><small>'+(rows.length-ok)+' aguardando pagamento</small></div><div class="simple-card"><span>Regularidade</span><b>'+(rows.length?Math.round(ok/rows.length*100):0)+'%</b><small>da competência selecionada</small></div></div>'
}
// O histórico é registrado explicitamente na base, sem criar quitações ao abrir o painel.
// Nenhuma cobrança deve ser automaticamente marcada como paga pela navegação.
async function ledgerData(k){
 await Promise.all(['contratos','cobrancas','imoveis','inquilinos'].map(dbGet));
 return buildLedger(cache.contratos||[],cache.cobrancas||[],cache.imoveis||[],cache.inquilinos||[],k)
}
function overview2026(){
 var charges=cache.cobrancas||[],contracts=cache.contratos||[],ims=cache.imoveis||[],inqs=cache.inquilinos||[];
 var previous=charges.filter(function(c){var month=String(c.competencia||'').slice(0,7);return month>='2026-01'&&month<='2026-10'&&c.status==='pago'});
 var received=previous.reduce(function(sum,c){return sum+Number(c.valor_pago||0)},0);
 var november=buildLedger(contracts,charges,ims,inqs,'2026-11');
 var missing=november.filter(function(r){return r.status==='pendente'}),pending=missing.reduce(function(sum,r){return sum+r.pending},0);
 return '<section class="simple-year-overview" aria-label="Histórico financeiro de 2026"><div><span>Janeiro a outubro de 2026</span><b>'+money(received)+'</b><small>'+previous.length+' aluguéis quitados</small></div><div><span>Novembro de 2026</span><b>'+money(pending)+'</b><small>'+missing.length+' aluguéis pendentes</small></div></section>'
}
function groupedPaymentRows(rows,actions){
 var colSpan=actions?7:6;
 return groupedByLocation(rows,function(r){return r.property}).map(function(group){
  var header='<tr class="payment-address-heading"><td colspan="'+colSpan+'">'+esc(group.label)+' <span>('+groupCount(group)+' unidades)</span></td></tr>';
  return header+['apartamentos','comerciais','outros'].map(function(cat){
   if(!group[cat].length)return '';
   return '<tr class="payment-category-heading"><td colspan="'+colSpan+'">'+categoryTitle(cat)+'</td></tr>'+paymentRows(group[cat],actions)
  }).join('')
 }).join('')
}
function paymentRows(rows,actions){
 return rows.map(function(r){return '<tr><td><b>'+esc(r.tenant&&r.tenant.nome||'—')+'</b></td><td>'+esc(r.property&&r.property.nome||'—')+'</td><td>'+dateBR(r.due)+'</td><td>'+money(r.expected)+'</td><td>'+money(r.paid)+(r.charge&&r.charge.comprovante_path?' <button type="button" class="pay-clip" data-proof-id="'+esc(r.charge.id)+'" title="Visualizar comprovante" aria-label="Visualizar comprovante de '+esc(r.tenant&&r.tenant.nome||'pagamento')+'">Ver comprovante</button>':'')+'</td><td>'+st(r.status)+'</td>'+(actions?'<td><button class="row-primary" data-pay="'+r.contract.id+'">'+(r.status==='pago'?'Editar':'Informar pagamento')+'</button></td>':'')+'</tr>'}).join('')
}
// Exibe os aluguéis previstos, pagos e pendentes do mês selecionado.
async function paymentsPage(){
 var k=window._simpleMonth||isoMonth(),rows=await ledgerData(k);window._simpleMonth=k;
 var manual=currentRole==='admin'?'<button id="quickPayment" class="btn primary">⚡ Pagamento rápido</button><button id="manualPayment" class="btn secondary">+ Adicionar pagamento</button>':'';
 E('content').innerHTML='<div class="simple-toolbar"><div><h2>Pagamentos</h2><p>Consulte recebimentos e comprovantes por competência. Apenas o administrador pode registrar pagamentos.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap">'+monthPicker('paymentMonth',k)+manual+'</div></div>'+summaryCards(rows)+'<div class="panel simple-panel"><div class="panel-title"><h3>Aluguéis da competência</h3><span class="muted">'+rows.length+' imóveis</span></div><div class="tablewrap"><table class="table"><thead><tr><th>Inquilino</th><th>Imóvel</th><th>Vencimento</th><th>Previsto</th><th>Recebido</th><th>Situação</th>'+(currentRole==='admin'?'<th>Ação</th>':'')+'</tr></thead><tbody>'+(groupedPaymentRows(rows,currentRole==='admin')||'<tr><td colspan="7" class="empty">Nenhum contrato vinculado a esta competência. Use <b>Adicionar pagamento</b> para registrar manualmente.</td></tr>')+'</tbody></table></div></div>';
 E('paymentMonth').onchange=function(){window._simpleMonth=this.value;paymentsPage()};
 if(E('quickPayment'))E('quickPayment').onclick=function(){openQuickPayment(k)};
 if(E('manualPayment'))E('manualPayment').onclick=function(){openManualPayment(k)};
 Array.prototype.forEach.call(document.querySelectorAll('[data-pay]'),function(b){b.onclick=function(){var r=rows.find(function(x){return x.contract.id===b.dataset.pay});openPayment(r,k)}})
 Array.prototype.forEach.call(document.querySelectorAll('[data-proof-id]'),function(b){b.onclick=function(){var r=rows.find(function(x){return x.charge&&x.charge.id===b.dataset.proofId});if(r)openProof(r)}})
}
async function openQuickPayment(k){
 if(currentRole!=='admin')return;
 await Promise.all([dbGet('inquilinos'),dbGet('imoveis'),dbGet('contratos'),dbGet('cobrancas')]);
 var inqs=cache.inquilinos||[],ims=cache.imoveis||[],cts=cache.contratos||[],charges=cache.cobrancas||[],today=new Date().toISOString().slice(0,10);
 var options=ims.map(function(im){var ct=cts.find(function(c){return c.imovel_id===im.id&&activeInMonth(c,k)})||cts.find(function(c){return c.imovel_id===im.id}),tid=ct&&ct.inquilino_id||im.inquilino_id,t=inqs.find(function(x){return x.id===tid}),rent=Number(ct&&ct.aluguel_atual||im.aluguel_base||0);return '<option value="'+im.id+'" data-tenant="'+esc(tid||'')+'" data-rent="'+rent+'">'+esc(im.nome||im.endereco||'Imóvel')+(t?' — '+esc(t.nome):'')+'</option>'}).join('');
 document.body.insertAdjacentHTML('beforeend','<div class="modalbg" id="modal"><div class="modal simple-modal"><div class="modalhead"><div><h2>Pagamento rápido</h2><small>Escolha o imóvel/inquilino, informe data e valor. O restante é automático.</small></div><button id="closemodal" class="close">×</button></div><div class="modalbody"><div id="formmsg"></div><div class="formgrid"><div class="field full"><span class="lbl">Imóvel / inquilino *</span><select id="qp_property" class="inp"><option value="">Selecione</option>'+options+'</select></div><div class="field"><span class="lbl">Data do pagamento *</span><input id="qp_date" class="inp" type="date" value="'+today+'"></div><div class="field"><span class="lbl">Valor pago *</span><input id="qp_value" class="inp" type="number" min="0.01" step="0.01"></div><div class="field full"><span class="lbl">Comprovante (opcional)</span><input id="qp_proof" class="inp pay-proof-select" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"><small>Foto ou PDF, até 10 MB. Caso não tenha comprovante, deixe vazio.</small></div></div><div class="notice" style="margin-top:12px">Competência: <b>'+esc(k)+'</b>. O valor do aluguel será preenchido automaticamente.</div></div><div class="modalfoot"><button id="cancelmodal" class="btn secondary">Cancelar</button><button id="saveQuickPayment" class="btn primary">Registrar pagamento</button></div></div></div>');
 function close(){E('modal').remove()}E('closemodal').onclick=E('cancelmodal').onclick=close;
 E('qp_property').onchange=function(){var o=this.options[this.selectedIndex];E('qp_value').value=o&&o.dataset.rent||''};
 E('saveQuickPayment').onclick=async function(){var msg=E('formmsg'),property=E('qp_property').value,date=E('qp_date').value,value=Number(E('qp_value').value||0);if(!property||!date||value<=0){msg.innerHTML='<div class="notice err">Selecione o imóvel/inquilino e informe data e valor.</div>';return}var im=ims.find(function(x){return x.id===property}),ct=cts.find(function(c){return c.imovel_id===property&&activeInMonth(c,k)})||cts.find(function(c){return c.imovel_id===property}),tenant=ct&&ct.inquilino_id||im&&im.inquilino_id||null,rent=Number(ct&&ct.aluguel_atual||im&&im.aluguel_base||value),old=paymentFor(ct&&ct.id,k,charges,property);if(old&&!confirm('Já existe um pagamento lançado para este imóvel nesta competência. Deseja atualizar o lançamento existente?'))return;var obj={inquilino_id:tenant,imovel_id:property,contrato_id:ct?ct.id:null,competencia:k+'-01',vencimento:ct?dueDate(ct,k):k+'-05',aluguel:rent,outros_encargos:Number(old&&old.outros_encargos||0),valor_pago:value,data_pagamento:date,forma_pagamento:'pix',status:value>=rent?'pago':'pendente',observacoes:old&&old.observacoes||'Pagamento registrado pelo lançamento rápido.'};try{msg.innerHTML='<div class="notice">Registrando...</div>';await savePaymentWithProof(obj,old,E('qp_proof').files&&E('qp_proof').files[0]);cache.cobrancas=null;close();paymentsPage()}catch(e){msg.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}}
}
async function openManualPayment(k){
 if(currentRole!=='admin')return;
 await Promise.all([dbGet('inquilinos'),dbGet('imoveis'),dbGet('contratos'),dbGet('cobrancas')]);
 var inqs=cache.inquilinos||[],ims=cache.imoveis||[],cts=cache.contratos||[],charges=cache.cobrancas||[],today=new Date().toISOString().slice(0,10);
 document.body.insertAdjacentHTML('beforeend','<div class="modalbg" id="modal"><div class="modal simple-modal"><div class="modalhead"><div><h2>Adicionar pagamento</h2><small>Registre o recebimento mesmo sem contrato listado na competência</small></div><button id="closemodal" class="close">×</button></div><div class="modalbody"><div id="formmsg"></div><div class="formgrid"><div class="field full"><span class="lbl">Inquilino *</span><select id="mp_tenant" class="inp"><option value="">Selecione</option>'+inqs.map(function(x){return '<option value="'+x.id+'">'+esc(x.nome)+'</option>'}).join('')+'</select></div><div class="field full"><span class="lbl">Imóvel *</span><select id="mp_property" class="inp"><option value="">Selecione</option>'+ims.map(function(x){return '<option value="'+x.id+'">'+esc(x.nome||x.endereco||'Imóvel')+'</option>'}).join('')+'</select></div><div class="field"><span class="lbl">Valor recebido *</span><input id="mp_value" class="inp" type="number" min="0.01" step="0.01"></div><div class="field"><span class="lbl">Data do pagamento *</span><input id="mp_date" class="inp" type="date" value="'+today+'"></div><div class="field"><span class="lbl">Vencimento</span><input id="mp_due" class="inp" type="date" value="'+k+'-10"></div><div class="field"><span class="lbl">Forma de pagamento</span><select id="mp_method" class="inp"><option value="pix">PIX</option><option value="transferencia">Transferência</option><option value="dinheiro">Dinheiro</option><option value="boleto">Boleto</option><option value="outro">Outro</option></select></div><div class="field full"><span class="lbl">Comprovante (opcional)</span><input id="mp_proof" class="inp pay-proof-select" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"><small>Foto ou PDF, até 10 MB. Caso não tenha comprovante, deixe vazio.</small></div><div class="field full"><span class="lbl">Observação</span><textarea id="mp_note" class="inp"></textarea></div></div></div><div class="modalfoot"><button id="cancelmodal" class="btn secondary">Cancelar</button><button id="saveManualPayment" class="btn primary">Salvar pagamento</button></div></div></div>');
 function close(){E('modal').remove()}E('closemodal').onclick=E('cancelmodal').onclick=close;
 E('mp_tenant').onchange=function(){var id=this.value,ct=cts.find(function(c){return c.inquilino_id===id&&activeInMonth(c,k)})||cts.find(function(c){return c.inquilino_id===id});if(ct){E('mp_property').value=ct.imovel_id||'';E('mp_value').value=ct.aluguel_atual||'';E('mp_due').value=dueDate(ct,k)}};
 E('mp_property').onchange=function(){var id=this.value,ct=cts.find(function(c){return c.imovel_id===id&&activeInMonth(c,k)})||cts.find(function(c){return c.imovel_id===id});if(ct){E('mp_tenant').value=ct.inquilino_id||'';E('mp_value').value=ct.aluguel_atual||'';E('mp_due').value=dueDate(ct,k)}else{var im=ims.find(function(x){return x.id===id});if(im&&im.aluguel_base)E('mp_value').value=im.aluguel_base}};
 E('saveManualPayment').onclick=async function(){var msg=E('formmsg'),tenant=E('mp_tenant').value,property=E('mp_property').value,value=Number(E('mp_value').value||0),date=E('mp_date').value,due=E('mp_due').value;if(!tenant||!property||value<=0||!date){msg.innerHTML='<div class="notice err">Selecione inquilino e imóvel e informe valor e data do pagamento.</div>';return}var ct=cts.find(function(c){return c.inquilino_id===tenant&&c.imovel_id===property&&activeInMonth(c,k)})||cts.find(function(c){return c.inquilino_id===tenant&&c.imovel_id===property});var expectedValue=Number(ct&&ct.aluguel_atual||value),obj={inquilino_id:tenant,imovel_id:property,contrato_id:ct?ct.id:null,competencia:k+'-01',vencimento:due||k+'-10',aluguel:expectedValue,outros_encargos:0,valor_pago:value,data_pagamento:date,forma_pagamento:E('mp_method').value,status:value>=expectedValue?'pago':'pendente',observacoes:E('mp_note').value||null};var old=paymentFor(ct&&ct.id,k,charges,property);if(old&&!confirm('Já existe um pagamento para este imóvel nesta competência. Deseja atualizar o existente?'))return;var btn=this;btn.disabled=true;try{msg.innerHTML='<div class="notice">Salvando pagamento e comprovante...</div>';await savePaymentWithProof(obj,old,E('mp_proof').files&&E('mp_proof').files[0]);cache.cobrancas=null;close();paymentsPage()}catch(e){btn.disabled=false;msg.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}}
}
// Abre o formulário usado pelo administrador para registrar um pagamento.
function openPayment(r,k){
 if(currentRole!=='admin')return;
 var old=r.charge||{},today=new Date().toISOString().slice(0,10),virtual=String(r.contract.id||'').indexOf('property:')===0,method=old.forma_pagamento||'pix';
 var methods=PAY_METHODS.map(function(m){return '<option value="'+m[0]+'"'+(m[0]===method?' selected':'')+'>'+m[1]+'</option>'}).join('');
 var current=old.comprovante_path?'<div class="pay-proof-current"><button type="button" id="pay_proof_open" class="btn secondary">📎 Ver comprovante atual</button><small>'+esc(old.comprovante_nome||'')+'</small></div>':'';
 document.body.insertAdjacentHTML('beforeend','<div class="modalbg" id="modal"><div class="modal simple-modal"><div class="modalhead"><div><h2>Informar pagamento</h2><small>'+esc(r.tenant&&r.tenant.nome||'')+' · '+esc(r.property&&r.property.nome||'')+'</small></div><button id="closemodal" class="close">×</button></div><div class="modalbody"><div id="formmsg"></div><div class="payment-highlight"><span>Valor previsto</span><b>'+money(r.expected)+'</b></div><div class="formgrid"><div class="field"><span class="lbl">Valor recebido *</span><input id="pay_value" class="inp" type="number" step="0.01" value="'+esc(old.valor_pago!=null?old.valor_pago:r.expected)+'"></div><div class="field"><span class="lbl">Data do pagamento *</span><input id="pay_date" class="inp" type="date" value="'+esc(old.data_pagamento||today)+'"></div><div class="field"><span class="lbl">Forma de pagamento</span><select id="pay_method" class="inp">'+methods+'</select></div><div class="field full"><span class="lbl">Comprovante (opcional)</span>'+current+'<div class="pay-proof-btns"><label class="btn secondary">📷 Tirar foto<input id="pay_cam" type="file" accept="image/*" capture="environment" hidden></label><label class="btn secondary">📄 Escolher arquivo<input id="pay_file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden></label></div><small id="pay_proof_name" class="pay-proof-name">'+(old.comprovante_path?'Envie outro arquivo só se quiser trocar o atual.':'PDF ou foto, até 10 MB.')+'</small></div><div class="field full"><span class="lbl">Observação</span><textarea id="pay_note" class="inp">'+esc(old.observacoes||'')+'</textarea></div></div></div><div class="modalfoot"><button id="cancelmodal" class="btn secondary">Cancelar</button><button id="savepay" class="btn primary">Confirmar pagamento</button></div></div></div>');
 var proof=null,proofInvalid=false;
 E('closemodal').onclick=E('cancelmodal').onclick=function(){E('modal').remove()};
 if(E('pay_proof_open'))E('pay_proof_open').onclick=function(){openProof(old.comprovante_path)};
 ['pay_cam','pay_file'].forEach(function(id){E(id).onchange=function(){var f=this.files&&this.files[0];if(!f)return;var bad=proofProblem(f);if(bad){proof=null;proofInvalid=true;E('pay_proof_name').innerHTML='<span class="pay-proof-err">'+esc(bad)+'</span>';return}proof=f;proofInvalid=false;E('pay_proof_name').textContent='Selecionado: '+f.name}});
 E('savepay').onclick=async function(){var v=Number(E('pay_value').value||0),msg=E('formmsg'),btn=this;if(v<=0){msg.innerHTML='<div class="notice err">Informe um valor recebido válido.</div>';return}if(proofInvalid){msg.innerHTML='<div class="notice err">Selecione um comprovante válido ou limpe a seleção.</div>';return}var obj={inquilino_id:r.contract.inquilino_id||null,imovel_id:r.contract.imovel_id||null,contrato_id:virtual?null:r.contract.id,competencia:k+'-01',vencimento:r.due,aluguel:r.expected,outros_encargos:Number(old.outros_encargos||0),valor_pago:v,data_pagamento:E('pay_date').value,forma_pagamento:E('pay_method').value,status:v>=r.expected?'pago':'pendente',observacoes:E('pay_note').value||null};btn.disabled=true;try{msg.innerHTML='<div class="notice">Salvando pagamento e comprovante...</div>';await savePaymentWithProof(obj,old,proof);cache.cobrancas=null;E('modal').remove();paymentsPage()}catch(e){btn.disabled=false;msg.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}}
}
// Comprovante de pagamento: um arquivo por cobrança, no bucket privado "comprovantes".
var PAY_METHODS=[['pix','PIX'],['transferencia','Transferência'],['dinheiro','Dinheiro'],['boleto','Boleto'],['cartao_debito','Cartão de débito'],['cartao_credito','Cartão de crédito'],['outro','Outro']];
var PROOF_TYPES=['image/jpeg','image/png','image/webp','application/pdf'];
function proofProblem(f){if(PROOF_TYPES.indexOf(f.type)<0)return 'Use um PDF ou uma foto (JPG, PNG ou WEBP).';if(f.size>10*1024*1024)return 'O arquivo passa de 10 MB.';return ''}
function proofPath(name,now,rand){var ext=String(name||'').split('.').pop().toLowerCase();if(['jpg','jpeg','png','webp','pdf'].indexOf(ext)<0)ext='pdf';return 'pagamentos/'+now+'-'+String(rand||'arquivo').replace(/[^a-zA-Z0-9-]/g,'')+'.'+ext}
function proofUrl(path){return SUPA_URL+'/storage/v1/object/comprovantes/'+path.split('/').map(encodeURIComponent).join('/')}
async function uploadProof(path,file){var res=await fetch(proofUrl(path),{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':file.type,'x-upsert':'false'},body:file});if(!res.ok)throw new Error('Não foi possível enviar o comprovante. Tente de novo.')}
async function deleteUploadedProof(path){
 if(!path)return;
 var res=await fetch(proofUrl(path),{method:'DELETE',headers:{apikey:KEY,Authorization:'Bearer '+session.access_token}});
 if(!res.ok)throw new Error('Não foi possível descartar o arquivo não vinculado.');
}
// Armazena o comprovante em bucket privado e só confirma o recebimento após gravação no banco.
async function savePaymentWithProof(obj,old,file){
 var path=null,previous=old&&old.id?old:null;
 if(file){var invalid=proofProblem(file);if(invalid)throw new Error(invalid)}
 try{
  if(file){
   var seed=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2);
   path=proofPath(file.name,Date.now(),seed);
   await uploadProof(path,file);
   obj.comprovante_path=path;
   obj.comprovante_nome=file.name.slice(0,180);
   obj.comprovante_tipo=file.type;
  }
  var stored=previous?await dbUpdate('cobrancas',previous.id,obj):await dbInsert('cobrancas',obj);
  if(!stored||!stored.length)throw new Error('O banco não confirmou o lançamento. Verifique antes de tentar novamente.');
  return stored[0];
 }catch(error){
  if(path){try{await deleteUploadedProof(path)}catch(_){}}
  throw error
 }
}
// Comprovantes privados: pré-visualização no próprio Matos, aberta pelo lançamento
// selecionado. O arquivo jamais é transformado em URL pública permanente.
async function openProof(row){
 var charge=row&&row.charge, path=charge&&charge.comprovante_path;
 if(!path)return;
 var old=E('matosProofModal');if(old)old.remove();
 var overlay=document.createElement('div');
 overlay.className='modalbg proof-overlay';overlay.id='matosProofModal';
 overlay.innerHTML='<section class="proof-dialog" role="dialog" aria-modal="true" aria-labelledby="proofTitle">'
  +'<div class="proof-dialog-head"><div><span class="proof-eyebrow">Matos · Gestão de Aluguéis</span><h2 id="proofTitle">Comprovante de pagamento</h2></div><button type="button" id="proofClose" class="proof-close" aria-label="Fechar visualização">×</button></div>'
  +'<div class="proof-info"><div><small>INQUILINO</small><strong id="proofTenant"></strong></div><div><small>IMÓVEL</small><strong id="proofProperty"></strong></div><div><small>VALOR RECEBIDO</small><strong id="proofAmount"></strong></div><div><small>DATA DO PAGAMENTO</small><strong id="proofDate"></strong></div></div>'
  +'<div class="proof-file-info"><span class="proof-file-badge" id="proofType">ARQUIVO</span><span id="proofFileName"></span></div>'
  +'<div id="proofViewer" class="proof-viewer"><div class="proof-loading">Carregando comprovante privado...</div></div>'
  +'<div id="proofMessage" class="proof-message" role="status" aria-live="polite"></div>'
  +'<footer class="proof-dialog-actions"><a id="proofOpenTab" class="btn secondary" target="_blank" rel="noopener noreferrer" hidden>Abrir em nova aba</a><button type="button" id="proofDownload" class="btn primary" disabled>Baixar comprovante</button><button type="button" id="proofDone" class="btn secondary">Fechar</button></footer></section>';
 document.body.appendChild(overlay);
 function inside(id){return overlay.querySelector('#'+id)}
 function close(){document.removeEventListener('keydown',handleKey);overlay.remove()}
 function handleKey(e){if(e.key==='Escape')close()}
 document.addEventListener('keydown',handleKey);
 overlay.addEventListener('click',function(e){if(e.target===overlay)close()});
 inside('proofClose').onclick=close;inside('proofDone').onclick=close;
 inside('proofTenant').textContent=row.tenant&&row.tenant.nome||'Não informado';
 inside('proofProperty').textContent=row.property&&row.property.nome||'Não informado';
 inside('proofAmount').textContent=money(row.paid);
 inside('proofDate').textContent=charge.data_pagamento?dateBR(charge.data_pagamento):'Não informada no cadastro';
 var ext=String(charge.comprovante_nome||path).split('.').pop().toLowerCase();
 var mime=String(charge.comprovante_tipo||'').toLowerCase(),isPdf=mime.indexOf('pdf')>=0||ext==='pdf';
 inside('proofType').textContent=isPdf?'PDF':'IMAGEM';
 inside('proofFileName').textContent=charge.comprovante_nome||'Arquivo anexado ao pagamento';
 try{
  var res=await request('/storage/v1/object/sign/comprovantes/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:authHeaders(session.access_token),body:JSON.stringify({expiresIn:300})});
  var raw=res&&(res.signedURL||res.signedUrl);if(!raw)throw new Error('Não foi possível autorizar a visualização do arquivo.');
  var address=new URL(raw,SUPA_URL+'/storage/v1');if(address.origin!==new URL(SUPA_URL).origin)throw new Error('Endereço de comprovante inválido.');
  if(!overlay.isConnected)return;
  var viewer=inside('proofViewer');viewer.replaceChildren();
  var node=document.createElement(isPdf?'iframe':'img');
  node.src=address.href;
  if(isPdf){node.title='Pré-visualização do comprovante em PDF';node.setAttribute('referrerpolicy','no-referrer')}
  else{node.alt='Comprovante de '+(row.tenant&&row.tenant.nome||'pagamento');node.referrerPolicy='no-referrer'}
  viewer.appendChild(node);
  var link=inside('proofOpenTab');link.href=address.href;link.hidden=false;
  inside('proofMessage').textContent='Arquivo privado vinculado a este pagamento. O link de visualização expira em 5 minutos.';
  var down=inside('proofDownload');down.disabled=false;
  down.onclick=async function(){
   down.disabled=true;inside('proofMessage').textContent='Preparando arquivo para download...';
   try{
    var downloadUrl=SUPA_URL+'/storage/v1/object/authenticated/comprovantes/'+path.split('/').map(encodeURIComponent).join('/');
    var response=await fetch(downloadUrl,{headers:{apikey:KEY,Authorization:'Bearer '+session.access_token}});
    if(!response.ok)throw new Error('Não foi possível acessar o arquivo (HTTP '+response.status+').');
    var blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
    var safeName=String(charge.comprovante_nome||('comprovante.'+(isPdf?'pdf':'jpg'))).replace(/[\\/\x00-\x1f]/g,'_').slice(0,160);
    a.href=url;a.download=safeName||'comprovante.pdf';a.hidden=true;document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(url)},60000);
    inside('proofMessage').textContent='Arquivo enviado para download.';
   }catch(err){inside('proofMessage').textContent='Falha no download: '+err.message}
   finally{if(overlay.isConnected)down.disabled=false}
  }
 }catch(err){if(overlay.isConnected){inside('proofViewer').innerHTML='<div class="proof-loading">Não foi possível exibir este comprovante.</div>';inside('proofMessage').textContent=err.message}}
}
window.MatosPayment={methods:PAY_METHODS,proofProblem:proofProblem,proofPath:proofPath};
// Calcula quantos dias faltam até uma data, usado nos avisos de contrato.
function daysUntil(v){if(!v)return 99999;var t=new Date(String(v).slice(0,10)+'T12:00:00'),n=new Date();n.setHours(12,0,0,0);return Math.ceil((t-n)/86400000)}
// =====================================================
// CADASTRO DE IMÓVEIS E INQUILINOS
// =====================================================
// Lista imóveis e mostra o inquilino vinculado quando o imóvel está ocupado.
// Agrupa unidades sem alterar IDs, contratos ou vínculos financeiros.
function unitCategory(im){
 var tipo=String(im&&im.tipo||'').toLowerCase();
 if(tipo.indexOf('apart')!==-1)return 'apartamentos';
 if(/loja|galp|comercial/.test(tipo))return 'comerciais';
 return 'outros'
}
function locationKey(im){
 var street=String(im&&im.endereco||'Endereço não informado').trim().toLowerCase();
 street=street.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/^(rua|r\.|avenida|av\.)\s+/,'').replace(/\s+/g,' ');
 return street+'|'+String(im&&im.numero||'').trim().toLowerCase()
}
function locationLabel(im){
 var street=String(im&&im.endereco||'Endereço não informado').trim();
 if(/^major salinas$/i.test(street))street='Rua Major Salinas';
 return street+(im&&im.numero?', '+im.numero:'')
}
function groupedByLocation(items,getImovel){
 var groups=[],byKey={};
 (items||[]).forEach(function(item){
  var im=getImovel(item)||{},key=locationKey(im),g=byKey[key];
  if(!g){g={key:key,label:locationLabel(im),apartamentos:[],comerciais:[],outros:[]};byKey[key]=g;groups.push(g)}
  g[unitCategory(im)].push(item)
 });
 groups.sort(function(a,b){return a.label.localeCompare(b.label,'pt-BR',{numeric:true})});
 groups.forEach(function(g){
  ['apartamentos','comerciais','outros'].forEach(function(cat){
   g[cat].sort(function(a,b){var x=getImovel(a)||{},y=getImovel(b)||{};return String(x.complemento||x.nome||'').localeCompare(String(y.complemento||y.nome||''),'pt-BR',{numeric:true})})
  })
 });
 return groups
}
function groupCount(group){return group.apartamentos.length+group.comerciais.length+group.outros.length}
function categoryTitle(cat){return {apartamentos:'Apartamentos',comerciais:'Comerciais',outros:'Outros imóveis'}[cat]}
async function cadastrosPage(){
 await Promise.all([dbGet('imoveis'),dbGet('inquilinos')]);
 var ims=cache.imoveis||[],inqs=cache.inquilinos||[],groups=groupedByLocation(ims,function(im){return im});
 var panels=groups.map(function(group){
  var sections=['apartamentos','comerciais','outros'].map(function(cat){
   var items=group[cat];if(!items.length)return '';
   var rows=items.map(function(im){
    var t=inqs.find(function(x){return x.id===im.inquilino_id});
    return '<tr><td><b>'+esc(im.nome||im.complemento||'Imóvel')+'</b>'+(im.complemento?'<div class="muted">'+esc(im.complemento)+'</div>':'')+'</td><td>'+money(im.aluguel_base)+'</td><td>'+st(im.status==='vago'?'desocupado':im.status)+'</td><td>'+esc(t&&t.nome||'—')+'</td></tr>'
   }).join('');
   return '<div class="property-subgroup"><h4>'+categoryTitle(cat)+' <span class="muted">('+items.length+')</span></h4><div class="tablewrap"><table class="table"><thead><tr><th>Unidade / imóvel</th><th>Aluguel</th><th>Situação</th><th>Inquilino</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
  }).join('');
  return '<section class="panel simple-panel property-address-group"><div class="panel-title"><h3>'+esc(group.label)+'</h3><span class="muted">'+groupCount(group)+' unidades</span></div>'+sections+'</section>'
 }).join('');
 E('content').innerHTML='<div class="simple-toolbar"><div><h2>Cadastros</h2><p>Imóveis agrupados por endereço, apartamentos e unidades comerciais.</p></div>'+(currentRole==='admin'?'<button id="newProperty" class="btn primary">+ Cadastrar imóvel</button>':'<span class="notice access-readonly">Somente consulta</span>')+'</div>'+(panels||'<div class="panel simple-panel"><div class="empty">Nenhum imóvel cadastrado.</div></div>');
 if(E('newProperty'))E('newProperty').onclick=function(){openPropertyRegistration(inqs)}
}
// Abre o cadastro integrado: imóvel e, se ocupado, dados obrigatórios do inquilino.
function openPropertyRegistration(existingTenants,presetTenantId){
 existingTenants=existingTenants||cache.inquilinos||[];
 document.body.insertAdjacentHTML('beforeend','<div class="modalbg" id="modal"><div class="modal simple-modal"><div class="modalhead"><div><h2>Novo imóvel</h2><small>Cadastro essencial do imóvel</small></div><button id="closemodal" class="close">×</button></div><div class="modalbody"><div id="formmsg"></div><div class="formgrid"><div class="field"><span class="lbl">Tipo de imóvel *</span><select id="reg_property_type" class="inp"><option value="apartamento">Apartamento</option><option value="casa">Casa</option><option value="loja">Loja</option><option value="galpao">Galpão</option><option value="sala_comercial">Sala comercial</option><option value="outro">Outro</option></select></div><div class="field" id="reg_apartment_wrap"><span class="lbl">Número do apartamento *</span><input id="reg_apartment" class="inp" placeholder="Ex.: 202"></div><div class="field full"><span class="lbl">Endereço *</span><input id="reg_address" class="inp" placeholder="Rua, avenida..."></div><div class="field"><span class="lbl">Número</span><input id="reg_number" class="inp" placeholder="Número do prédio/casa"></div><div class="field"><span class="lbl">Bairro</span><input id="reg_neighborhood" class="inp"></div><div class="field"><span class="lbl">Valor do aluguel *</span><input id="reg_rent" class="inp" type="number" min="0" step="0.01"></div><div class="field"><span class="lbl">Situação *</span><select id="reg_status" class="inp"><option value="vago">Desocupado</option><option value="ocupado">Ocupado</option></select></div></div><div id="tenantBlock" class="tenant-register" style="display:none"><div class="section-label">Dados do inquilino</div><div class="formgrid"><div class="field full"><span class="lbl">Usar cadastro existente?</span><select id="reg_existing_tenant" class="inp"><option value="">Cadastrar novo inquilino</option>'+existingTenants.map(function(t){return '<option value="'+esc(t.id)+'">'+esc(t.nome||'Sem nome')+' — '+esc(t.cpf_cnpj||'sem documento')+'</option>'}).join('')+'</select></div><div id="reg_new_tenant_fields" class="formgrid" style="grid-column:1/-1"><div class="field"><span class="lbl">Tipo de pessoa *</span><select id="reg_person" class="inp"><option value="pf">Pessoa Física</option><option value="pj">Pessoa Jurídica</option></select></div><div class="field"><span class="lbl">Nome / Razão social *</span><input id="reg_tenant_name" class="inp"></div><div class="field"><span id="reg_doc_label" class="lbl">CPF *</span><input id="reg_doc" class="inp" inputmode="numeric"></div><div class="field"><span class="lbl">Telefone para contato *</span><input id="reg_phone" class="inp" type="tel" placeholder="(68) 99999-9999"></div></div></div></div></div><div class="modalfoot"><button id="cancelmodal" class="btn secondary">Cancelar</button><button id="saveProperty" class="btn primary">Salvar cadastro</button></div></div></div>');
 function close(){E('modal').remove()} E('closemodal').onclick=E('cancelmodal').onclick=close;
 function syncPropertyType(){var apt=E('reg_property_type').value==='apartamento';E('reg_apartment_wrap').style.display=apt?'block':'none';E('reg_apartment').required=apt;if(!apt)E('reg_apartment').value=''} E('reg_property_type').onchange=syncPropertyType;syncPropertyType();
 E('reg_status').onchange=function(){E('tenantBlock').style.display=this.value==='ocupado'?'block':'none'};
 E('reg_existing_tenant').onchange=function(){E('reg_new_tenant_fields').style.display=this.value?'none':'grid'};
 if(presetTenantId){E('reg_status').value='ocupado';E('reg_status').disabled=true;E('tenantBlock').style.display='block';E('reg_existing_tenant').value=presetTenantId;E('reg_existing_tenant').disabled=true;E('reg_new_tenant_fields').style.display='none'}
 E('reg_person').onchange=function(){E('reg_doc_label').textContent=this.value==='pj'?'CNPJ *':'CPF *';E('reg_doc').value=''};
 E('reg_phone').oninput=function(){if(window.phoneBR)this.value=phoneBR(this.value)};
 E('reg_doc').oninput=function(){var m=window.MatosTenantIdentity;if(!m)return;this.value=E('reg_person').value==='pj'?m.maskCnpj(this.value):m.maskCpf(this.value)};
 E('saveProperty').onclick=async function(){var msg=E('formmsg'),occupied=E('reg_status').value==='ocupado',address=E('reg_address').value.trim(),rent=Number(E('reg_rent').value||0);if(!address||rent<=0){msg.innerHTML='<div class="notice err">Informe o endereço e um valor de aluguel válido.</div>';return}var tenantId=null;if(occupied){tenantId=E('reg_existing_tenant').value||null;if(!tenantId){var name=E('reg_tenant_name').value.trim(),doc=E('reg_doc').value.trim(),phone=E('reg_phone').value.trim();if(!name||!doc||!phone){msg.innerHTML='<div class="notice err">Para imóvel ocupado, preencha tipo de pessoa, nome, CPF/CNPJ e telefone.</div>';return}var validator=window.MatosTenantIdentity;if(validator){var valid=E('reg_person').value==='pj'?validator.cnpjValid(doc):validator.cpfValid(doc);if(!valid){msg.innerHTML='<div class="notice err">'+(E('reg_person').value==='pj'?'CNPJ':'CPF')+' inválido.</div>';return}}try{msg.innerHTML='<div class="notice">Salvando inquilino e imóvel...</div>';var ti=await dbInsert('inquilinos',{nome:name,cpf_cnpj:doc,telefone:phone,status:'ativo'});tenantId=ti&&ti[0]&&ti[0].id}catch(e){msg.innerHTML='<div class="notice err">'+esc(e.message)+'</div>';return}}}try{var number=E('reg_number').value.trim(),neigh=E('reg_neighborhood').value.trim(),propertyType=E('reg_property_type').value,apartment=E('reg_apartment').value.trim();if(propertyType==='apartamento'&&!apartment){msg.innerHTML='<div class="notice err">Informe o número do apartamento.</div>';return}var typeLabel={apartamento:'Apartamento',casa:'Casa',loja:'Loja',galpao:'Galpão',sala_comercial:'Sala comercial',outro:'Outro'}[propertyType]||'Imóvel';await dbInsert('imoveis',{nome:typeLabel+(propertyType==='apartamento'&&apartment?' '+apartment:'')+' - '+address+(number?' '+number:''),tipo:propertyType,endereco:address,numero:number||null,complemento:propertyType==='apartamento'?'Apartamento '+apartment:null,bairro:neigh||null,cidade:'Rio Branco',aluguel_base:rent,iptu_mensal:0,condominio:0,status:occupied?'ocupado':'vago',inquilino_id:tenantId});cache.imoveis=null;cache.inquilinos=null;close();cadastrosPage()}catch(e){msg.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}}
}
// =====================================================
// CONTRATOS E PRAZOS
// =====================================================
// Lista contratos e destaca os que vencem em até 60 dias.
async function contractsPage(){
 await Promise.all([dbGet('contratos'),dbGet('imoveis'),dbGet('inquilinos')]);var cs=cache.contratos||[],ims=cache.imoveis||[],inqs=cache.inquilinos||[];
 var rows=cs.map(function(c){var im=ims.find(function(x){return x.id===c.imovel_id}),t=inqs.find(function(x){return x.id===c.inquilino_id}),d=daysUntil(c.data_fim),badge=d<0?'<span class="badge red">Vencido</span>':d<=60?'<span class="badge yellow">'+d+' dias</span>':st(c.status);return '<tr><td><b>'+esc(im&&im.nome||'—')+'</b></td><td>'+esc(t&&t.nome||'—')+'</td><td>'+dateBR(c.data_inicio)+'</td><td>'+dateBR(c.data_fim)+'</td><td>'+money(c.aluguel_atual)+'</td><td>'+badge+'</td></tr>'}).join('');
 E('content').innerHTML='<div class="simple-toolbar"><div><h2>Contratos</h2><p>Cadastre e acompanhe os prazos dos contratos vinculados aos imóveis.</p></div>'+(currentRole==='admin'?'<button id="newContract" class="btn primary">+ Novo contrato</button>':'<span class="notice access-readonly">Somente consulta</span>')+'</div><div class="notice contract-notice">O sistema gera aviso automático quando faltarem <b>60 dias</b> para o término de um contrato ativo.</div><div class="panel simple-panel"><div class="tablewrap"><table class="table"><thead><tr><th>Imóvel</th><th>Inquilino</th><th>Início</th><th>Término</th><th>Aluguel</th><th>Situação / prazo</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" class="empty">Nenhum contrato cadastrado.</td></tr>')+'</tbody></table></div></div>';
 if(E('newContract'))E('newContract').onclick=function(){openContractRegistration(ims,inqs)}
}
// Cria um contrato usando o imóvel ocupado e seu inquilino já vinculado.
function openContractRegistration(ims,inqs){
 var occupied=ims.filter(function(x){return x.inquilino_id});
 document.body.insertAdjacentHTML('beforeend','<div class="modalbg" id="modal"><div class="modal simple-modal"><div class="modalhead"><div><h2>Novo contrato</h2><small>Vincule o contrato a um imóvel ocupado</small></div><button id="closemodal" class="close">×</button></div><div class="modalbody"><div id="formmsg"></div><div class="formgrid"><div class="field full"><span class="lbl">Imóvel *</span><select id="ct_property" class="inp"><option value="">Selecione</option>'+occupied.map(function(im){return '<option value="'+im.id+'">'+esc(im.nome||im.endereco)+'</option>'}).join('')+'</select></div><div class="field full"><span class="lbl">Inquilino</span><input id="ct_tenant" class="inp" disabled placeholder="Selecionado pelo imóvel"></div><div class="field"><span class="lbl">Início do contrato *</span><input id="ct_start" class="inp" type="date"></div><div class="field"><span class="lbl">Término do contrato *</span><input id="ct_end" class="inp" type="date"></div><div class="field"><span class="lbl">Dia do vencimento *</span><input id="ct_due" class="inp" type="number" min="1" max="28" value="10"></div><div class="field"><span class="lbl">Valor do aluguel *</span><input id="ct_rent" class="inp" type="number" min="0" step="0.01"></div></div></div><div class="modalfoot"><button id="cancelmodal" class="btn secondary">Cancelar</button><button id="saveContract" class="btn primary">Salvar contrato</button></div></div></div>');
 function close(){E('modal').remove()}E('closemodal').onclick=E('cancelmodal').onclick=close;
 E('ct_property').onchange=function(){var im=ims.find(function(x){return x.id===E('ct_property').value}),t=im&&inqs.find(function(x){return x.id===im.inquilino_id});E('ct_tenant').value=t&&t.nome||'';E('ct_rent').value=im&&im.aluguel_base||''};
 E('saveContract').onclick=async function(){var msg=E('formmsg'),im=ims.find(function(x){return x.id===E('ct_property').value}),start=E('ct_start').value,end=E('ct_end').value,rent=Number(E('ct_rent').value||0),due=Number(E('ct_due').value||0);if(!im||!im.inquilino_id||!start||!end||rent<=0||due<1||due>28){msg.innerHTML='<div class="notice err">Preencha imóvel, datas, vencimento e valor do aluguel.</div>';return}if(end<=start){msg.innerHTML='<div class="notice err">A data de término deve ser posterior à data de início.</div>';return}try{msg.innerHTML='<div class="notice">Salvando contrato...</div>';await dbInsert('contratos',{imovel_id:im.id,inquilino_id:im.inquilino_id,data_inicio:start,data_fim:end,dia_vencimento:due,aluguel_atual:rent,status:start>new Date().toISOString().slice(0,10)?'futuro':'ativo'});cache.contratos=null;close();contractsPage()}catch(e){msg.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}}
}
// =====================================================
// DASHBOARD
// =====================================================
// Resume pagamentos, pendências, chamados e contratos próximos do término.
async function simpleDash(){
 var k=window._simpleMonth||isoMonth(),rows=await ledgerData(k),maint=await dbGet('manutencoes'),open=(maint||[]).filter(function(x){return ['concluido','cancelado'].indexOf(x.status)<0}).length,contracts=cache.contratos||[],ims=cache.imoveis||[],inqs=cache.inquilinos||[],ending=contracts.filter(function(x){var d=daysUntil(x.data_fim);return x.status==='ativo'&&d>=0&&d<=60}).sort(function(a,b){return String(a.data_fim).localeCompare(String(b.data_fim))});window._simpleMonth=k;
 E('content').innerHTML='<div class="simple-toolbar"><div><h2>Visão geral</h2><p>Acompanhe recebimentos, pendências e operação em um único lugar.</p></div>'+monthPicker('dashMonth',k)+'</div>'+summaryCards(rows)+overview2026()+'<div class="simple-grid"><div class="panel simple-panel"><div class="panel-title"><h3>Pendências que precisam de atenção</h3><button class="linkmini" onclick="goQuick(\'Pagamentos\')">Ver pagamentos →</button></div><div class="tablewrap"><table class="table"><thead><tr><th>Inquilino</th><th>Imóvel</th><th>Vencimento</th><th>Pendente</th></tr></thead><tbody>'+rows.filter(function(r){return r.status==='pendente'}).slice(0,8).map(function(r){return '<tr><td>'+esc(r.tenant&&r.tenant.nome||'—')+'</td><td>'+esc(r.property&&r.property.nome||'—')+'</td><td>'+dateBR(r.due)+'</td><td><b>'+money(r.pending)+'</b></td></tr>'}).join('')+'</tbody></table></div></div><div class="panel simple-panel action-panel"><h3>Operação</h3>'+(currentRole==='admin'?'<button onclick="goQuick(\'Pagamentos\')"><b>Informar pagamento</b><span>Registrar recebimento de aluguel</span></button>':'<button onclick="goQuick(\'Pagamentos\')"><b>Consultar pagamentos</b><span>Ver valores e comprovantes</span></button>')+'<button onclick="goQuick(\'IPTU\')"><b>IPTU</b><span>Valores e referências anuais</span></button><button onclick="goQuick(\'Chamados\')"><b>Chamados <em>'+open+'</em></b><span>Acompanhar solicitações dos inquilinos</span></button><button onclick="goQuick(\'Relatórios\')"><b>Relatório mensal</b><span>Pagos e pendentes para cobrança</span></button></div></div>';
 E('content').insertAdjacentHTML('beforeend','<div class="panel simple-panel contract-dashboard"><div class="panel-title"><h3>Contratos próximos do término</h3><button class="linkmini" onclick="goQuick(\'Contratos\')">Ver contratos →</button></div><p class="muted">Avisos exibidos com 60 dias de antecedência.</p><div class="tablewrap"><table class="table"><thead><tr><th>Imóvel</th><th>Inquilino</th><th>Término</th><th>Prazo</th></tr></thead><tbody>'+(ending.map(function(ct){var im=ims.find(function(x){return x.id===ct.imovel_id}),t=inqs.find(function(x){return x.id===ct.inquilino_id}),d=daysUntil(ct.data_fim);return '<tr><td>'+esc(im&&im.nome||'—')+'</td><td>'+esc(t&&t.nome||'—')+'</td><td><b>'+dateBR(ct.data_fim)+'</b></td><td><span class="badge yellow">'+d+' dias</span></td></tr>'}).join('')||'<tr><td colspan="4" class="empty">Nenhum contrato termina nos próximos 60 dias.</td></tr>')+'</tbody></table></div></div>');E('dashMonth').onchange=function(){window._simpleMonth=this.value;simpleDash()}
}
// Exibe os chamados de manutenção e solicitações dos inquilinos.
async function callsPage(){
 var rows=await dbGet('manutencoes');if(!cache.imoveis)await dbGet('imoveis');if(!cache.inquilinos)await dbGet('inquilinos');
 var body=rows.map(function(r){var im=(cache.imoveis||[]).find(function(x){return x.id===r.imovel_id}),ten=(cache.inquilinos||[]).find(function(x){return x.id===r.inquilino_id});return '<tr><td>'+dateBR(r.data_abertura)+'</td><td>'+esc(ten&&ten.nome||'—')+'</td><td>'+esc(im&&im.nome||'—')+'</td><td>'+esc(r.categoria||'—')+'</td><td>'+esc(r.descricao||'—')+'</td><td>'+st(r.status||'aberto')+'</td>'+(currentRole==='admin'?'<td><button class="row-primary" data-call="'+r.id+'">Abrir</button></td>':'')+'</tr>'}).join('');
 E('content').innerHTML='<div class="simple-toolbar"><div><h2>Chamados</h2><p>Solicitações dos inquilinos e acompanhamento da solução.</p></div>'+(currentRole==='inquilino'?'<button id="newcall" class="btn primary">+ Novo chamado</button>':'')+'</div><div class="panel simple-panel"><div class="tablewrap"><table class="table"><thead><tr><th>Abertura</th><th>Inquilino</th><th>Imóvel</th><th>Categoria</th><th>Descrição</th><th>Situação</th>'+(currentRole==='admin'?'<th>Ação</th>':'')+'</tr></thead><tbody>'+(body||'<tr><td colspan="7" class="empty">Nenhum chamado registrado.</td></tr>')+'</tbody></table></div></div>';
 if(E('newcall'))E('newcall').onclick=function(){openForm('Manutenção',null)};
 Array.prototype.forEach.call(document.querySelectorAll('[data-call]'),function(b){b.onclick=function(){var r=rows.find(function(x){return x.id===b.dataset.call});openForm('Manutenção',r)}})
}
// Gera a visão mensal de pagos e pendentes, pronta para impressão/PDF.
function reportPaymentRows(list,proofNumbers){
 return list.map(function(r){
  var charge=r.charge||{},code=charge.id&&proofNumbers[charge.id];
  return '<tr><td><b>'+esc(r.tenant&&r.tenant.nome||'—')+'</b></td><td>'+esc(r.property&&r.property.nome||'—')+'</td><td>'+dateBR(r.due)+'</td><td>'+money(r.expected)+'</td><td>'+money(r.paid)+'</td><td>'+st(r.status)+'</td><td>'+(code?'<button type="button" class="report-proof-open" data-proof="'+esc(charge.comprovante_path)+'" title="Abrir comprovante">Anexo '+esc(code)+'</button>':'<span class="muted">Não anexado</span>')+'</td></tr>'
 }).join('')
}
async function simpleReports(){
 var k=window._simpleReportMonth||isoMonth(),rows=await ledgerData(k);window._simpleReportMonth=k;
 var paid=rows.filter(function(r){return r.status==='pago'}),pending=rows.filter(function(r){return r.status==='pendente'});
 var files=rows.filter(function(r){return r.charge&&r.charge.id&&r.charge.comprovante_path}),numbers={};
 files.forEach(function(r,i){numbers[r.charge.id]=String(i+1).padStart(2,'0')});
 function sec(title,list,kind){
  return '<div class="panel simple-panel report-section"><div class="panel-title"><h3>'+title+'</h3><span class="badge '+(kind==='ok'?'green':'red')+'">'+list.length+'</span></div><div class="tablewrap"><table class="table report-table"><thead><tr><th>Inquilino</th><th>Imóvel</th><th>Vencimento</th><th>Previsto</th><th>Recebido</th><th>Situação</th><th>Comprovante</th></tr></thead><tbody>'+(reportPaymentRows(list,numbers)||'<tr><td colspan="7" class="empty">Nenhum registro.</td></tr>')+'</tbody></table></div></div>'
 }
 E('content').innerHTML='<div id="printArea"><div class="simple-toolbar"><div><h2>Relatório mensal</h2><p>Competência '+esc(k)+' · pagamentos e comprovantes vinculados.</p></div><div class="report-actions"><div class="report-export-controls">'+monthPicker('simpleReportMonth',k)+'<button id="simplePrint" class="btn primary" type="button">Baixar PDF completo com anexos</button><button id="simplePrintTable" class="btn secondary" type="button">Imprimir somente tabela</button></div></div></div>'+summaryCards(rows)+'<div class="report-proof-legend">Comprovantes anexados: <b>'+files.length+'</b>. O PDF completo incorpora fotos e todas as páginas dos comprovantes em PDF, vinculados ao pagamento correspondente.</div><div id="reportExportStatus" class="report-export-status" role="status" aria-live="polite"></div>'+sec('Pagos',paid,'ok')+sec('Pendentes',pending,'bad')+'</div>';
 E('simpleReportMonth').onchange=function(){window._simpleReportMonth=this.value;simpleReports()};
 E('simplePrintTable').onclick=function(){window.print()};
 E('simplePrint').onclick=async function(){
  var btn=this,msg=E('reportExportStatus');btn.disabled=true;
  try{
   if(!window.MatosMonthlyReport||!window.MatosMonthlyReport.export)throw new Error('O módulo de relatório não foi carregado. Atualize a página.');
   msg.textContent='Montando o PDF mensal...';
   await window.MatosMonthlyReport.export(k,rows,function(at,total){msg.textContent='Incorporando comprovante '+at+' de '+total+'...'});
   msg.textContent='PDF completo gerado para download.';
  }catch(e){msg.textContent='Não foi possível gerar o relatório completo: '+e.message}
  finally{btn.disabled=false}
 };
 Array.prototype.forEach.call(document.querySelectorAll('.report-proof-open'),function(b){b.onclick=function(){openProof(b.dataset.proof)}})
}

// Centraliza cadastros técnicos e configurações administrativas.
// Os cartões de Configurações usam o módulo vivo, nunca uma cópia de innerHTML:
// copiar HTML descarta eventos de pesquisa, edição, exclusão e formulários.
var settingsSections=['Imóveis','Inquilinos','Contratos','Proprietários','Acessos'];
var settingsActive=null;
var settingsRenderId=0;
var settingsCards=[
 ['Imóveis','Endereços, valores-base, ocupação e vínculo com proprietários','building-2'],
 ['Inquilinos','Dados dos locatários, contatos e documentos','users'],
 ['Contratos','Prazos, reajustes, garantias e valores','file-text'],
 ['Proprietários','Dados cadastrais, telefone, repasses e contato','user-round'],
 ['Acessos','Login por telefone ou e-mail, permissões e senhas','shield-check']
];
async function settingsHub(){
 if(currentRole!=='admin'){E('content').innerHTML='<div class="notice err">Configurações disponíveis somente para administradores.</div>';return}
 settingsActive=null;page='Configurações';
 E('content').innerHTML='<div class="simple-toolbar"><div><h2>Configurações e cadastros</h2><p>Gerencie os dados estruturais e os acessos do Matos.</p></div></div>'
  +'<div class="settings-grid">'+settingsCards.map(function(item){
   return '<button type="button" class="settings-card" data-config="'+esc(item[0])+'" aria-label="Abrir '+esc(item[0])+'"><b>'+esc(item[0])+'</b><span>'+esc(item[1])+'</span><i aria-hidden="true">→</i></button>'
  }).join('')+'</div><p class="muted settings-hint">Selecione uma área para consultar, cadastrar ou editar. Todas as alterações permanecem protegidas pelo seu acesso de administrador.</p>';
 Array.prototype.forEach.call(E('content').querySelectorAll('[data-config]'),function(button){
  button.onclick=function(){openSettingsSection(button.dataset.config)}
 })
}
async function openSettingsSection(section){
 if(currentRole!=='admin'||settingsSections.indexOf(section)<0)return;
 settingsActive=section;page=section;await load();
}
async function renderSettingsSection(){
 if(currentRole!=='admin'||settingsSections.indexOf(settingsActive)<0)return settingsHub();
 var section=settingsActive,ticket=++settingsRenderId,C=E('content');
 if(!C)return;
 C.innerHTML='<div class="panel">Carregando '+esc(section)+'...</div>';
 try{
  if(section==='Acessos')await accesses();
  else await modulePage();
  if(settingsActive!==section||page!==section||ticket!==settingsRenderId||E('content')!==C)return;
  var toolbar=document.createElement('div');
  toolbar.className='settings-subnav';
  toolbar.innerHTML='<div class="settings-subnav-heading"><button type="button" id="backSettings" class="btn secondary">← Todas as configurações</button><span class="settings-crumb">Configurações <span aria-hidden="true">/</span> <b>'+esc(section)+'</b></span></div>';
  C.insertBefore(toolbar,C.firstChild);
  E('backSettings').onclick=function(){settingsActive=null;page='Configurações';shell()};
 }catch(error){
  if(settingsActive!==section||ticket!==settingsRenderId)return;
  C.innerHTML='<div class="settings-subnav"><button id="backSettings" class="btn secondary" type="button">← Todas as configurações</button></div><div class="notice err">Não foi possível carregar '+esc(section)+': '+esc(error.message)+'</div><button id="retrySettings" class="btn secondary" type="button">Tentar novamente</button>';
  E('backSettings').onclick=function(){settingsActive=null;page='Configurações';shell()};
  E('retrySettings').onclick=function(){load()}
 }
}
window.MatosSettings={
 sections:settingsSections.slice(),
 open:openSettingsSection,
 home:function(){settingsActive=null;page='Configurações';shell()},
 getActive:function(){return settingsActive}
};

// Guarda o carregador original e direciona as novas telas sem apagar funções legadas.
var originalLoad=window.load||load;
load=async function(){
 var C=E('content');if(!C)return;
 try{
  if(settingsActive&&page===settingsActive&&currentRole==='admin')return renderSettingsSection();
  if(page==='Dashboard')return simpleDash();
  if(page==='Cadastros'&&(currentRole==='admin'||currentRole==='proprietario_consulta'))return cadastrosPage();
  if(page==='Contratos'&&(currentRole==='admin'||currentRole==='proprietario_consulta'))return contractsPage();
  if(page==='Pagamentos')return paymentsPage();
  if(page==='Chamados')return callsPage();
  if(page==='Relatórios')return simpleReports();
  if(page==='Configurações'&&currentRole==='admin')return settingsHub();
  return originalLoad.apply(this,arguments)
 }catch(e){C.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}
};window.load=load;
// Ao sair desta área pelo menu lateral ou por um atalho, descarte o contexto.
// Dentro da área, o carregador acima mantém o formulário vivo ao salvar ou excluir.
var settingsPreviousShell=window.shell||shell;
shell=function(){settingsActive=null;settingsRenderId++;return settingsPreviousShell.apply(this,arguments)};
window.shell=shell;
// Define os ícones usados no menu lateral simplificado.
// Expõe o agrupamento por endereço para outras telas (ex.: Gastos) usarem o mesmo critério.
window.MatosLocation={key:locationKey,label:locationLabel,category:unitCategory};
var oldIcon=window.navIcon||navIcon;navIcon=function(x){var m={'Dashboard':'⌂','Cadastros':'＋','Contratos':'▤','Pagamentos':'$','IPTU':'⌑','Chamados':'◇','Relatórios':'▥','Acessos':'♙','Configurações':'⚙'};return m[x]||oldIcon(x)};window.navIcon=navIcon;
})();
