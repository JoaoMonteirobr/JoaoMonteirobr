(function(){
'use strict';
var adminMain=['Dashboard','Pagamentos','IPTU','Chamados','Relatórios','Configurações'];
var ownerMain=['Dashboard','Pagamentos','IPTU','Chamados','Relatórios'];
var tenantMain=['Dashboard','Pagamentos','IPTU','Chamados'];
adminMenus=adminMain; ownerMenus=ownerMain; tenantMenus=tenantMain;
tables.Pagamentos='cobrancas'; tables.Chamados='manutencoes';
function isoMonth(d){return (d||new Date().toISOString()).slice(0,7)}
function monthStart(k){return k+'-01'}
function monthEnd(k){var p=k.split('-');return new Date(Number(p[0]),Number(p[1]),0).toISOString().slice(0,10)}
function activeInMonth(c,k){var a=monthStart(k),b=monthEnd(k);return c.status!=='encerrado'&&(!c.data_inicio||c.data_inicio<=b)&&(!c.data_fim||c.data_fim>=a)}
function dueDate(c,k){var day=Math.max(1,Math.min(28,Number(c.dia_vencimento||10)));return k+'-'+String(day).padStart(2,'0')}
function paymentFor(contractId,k,charges){return (charges||[]).find(function(x){return x.contrato_id===contractId&&String(x.competencia||x.vencimento||'').slice(0,7)===k})||null}
function expected(c){return Number(c.aluguel_atual||0)}
function buildLedger(contracts,charges,ims,inqs,k){
 return contracts.filter(function(c){return activeInMonth(c,k)}).map(function(c){
  var pay=paymentFor(c.id,k,charges),im=ims.find(function(x){return x.id===c.imovel_id}),inq=inqs.find(function(x){return x.id===c.inquilino_id}),prev=expected(c),paid=Number(pay&&pay.valor_pago||0);
  return {contract:c,charge:pay,property:im,tenant:inq,expected:prev,paid:paid,pending:Math.max(0,prev-paid),status:paid>=prev&&prev>0?'pago':'pendente',due:pay&&pay.vencimento||dueDate(c,k)}
 })
}
function monthPicker(id,k){return '<input id="'+id+'" class="inp month-input" type="month" value="'+esc(k)+'">'}
function summaryCards(rows){
 var prev=rows.reduce(function(s,r){return s+r.expected},0),paid=rows.reduce(function(s,r){return s+r.paid},0),pend=rows.reduce(function(s,r){return s+r.pending},0),ok=rows.filter(function(r){return r.status==='pago'}).length;
 return '<div class="simple-cards"><div class="simple-card"><span>Previsto</span><b>'+money(prev)+'</b><small>'+rows.length+' locações ativas</small></div><div class="simple-card positive"><span>Recebido</span><b>'+money(paid)+'</b><small>'+ok+' pagamentos informados</small></div><div class="simple-card danger"><span>Pendente</span><b>'+money(pend)+'</b><small>'+(rows.length-ok)+' aguardando pagamento</small></div><div class="simple-card"><span>Regularidade</span><b>'+(rows.length?Math.round(ok/rows.length*100):0)+'%</b><small>da competência selecionada</small></div></div>'
}
async function ledgerData(k){await Promise.all(['contratos','cobrancas','imoveis','inquilinos'].map(dbGet));return buildLedger(cache.contratos||[],cache.cobrancas||[],cache.imoveis||[],cache.inquilinos||[],k)}
function paymentRows(rows,actions){
 return rows.map(function(r){return '<tr><td><b>'+esc(r.tenant&&r.tenant.nome||'—')+'</b></td><td>'+esc(r.property&&r.property.nome||'—')+'</td><td>'+dateBR(r.due)+'</td><td>'+money(r.expected)+'</td><td>'+money(r.paid)+'</td><td>'+st(r.status)+'</td>'+(actions?'<td><button class="row-primary" data-pay="'+r.contract.id+'">'+(r.status==='pago'?'Editar':'Informar pagamento')+'</button></td>':'')+'</tr>'}).join('')
}
async function paymentsPage(){
 var k=window._simpleMonth||isoMonth(),rows=await ledgerData(k);window._simpleMonth=k;
 E('content').innerHTML='<div class="simple-toolbar"><div><h2>Pagamentos</h2><p>Informe somente o que foi recebido. O restante é considerado pendente automaticamente.</p></div>'+monthPicker('paymentMonth',k)+'</div>'+summaryCards(rows)+'<div class="panel simple-panel"><div class="panel-title"><h3>Aluguéis da competência</h3><span class="muted">'+rows.length+' contratos</span></div><div class="tablewrap"><table class="table"><thead><tr><th>Inquilino</th><th>Imóvel</th><th>Vencimento</th><th>Previsto</th><th>Recebido</th><th>Situação</th>'+(currentRole==='admin'?'<th>Ação</th>':'')+'</tr></thead><tbody>'+(paymentRows(rows,currentRole==='admin')||'<tr><td colspan="7" class="empty">Nenhum contrato ativo nesta competência.</td></tr>')+'</tbody></table></div></div>';
 E('paymentMonth').onchange=function(){window._simpleMonth=this.value;paymentsPage()};
 Array.prototype.forEach.call(document.querySelectorAll('[data-pay]'),function(b){b.onclick=function(){var r=rows.find(function(x){return x.contract.id===b.dataset.pay});openPayment(r,k)}})
}
function openPayment(r,k){
 if(currentRole!=='admin')return;
 var old=r.charge||{},today=new Date().toISOString().slice(0,10);
 document.body.insertAdjacentHTML('beforeend','<div class="modalbg" id="modal"><div class="modal simple-modal"><div class="modalhead"><div><h2>Informar pagamento</h2><small>'+esc(r.tenant&&r.tenant.nome||'')+' · '+esc(r.property&&r.property.nome||'')+'</small></div><button id="closemodal" class="close">×</button></div><div class="modalbody"><div id="formmsg"></div><div class="payment-highlight"><span>Valor previsto</span><b>'+money(r.expected)+'</b></div><div class="formgrid"><div class="field"><span class="lbl">Valor recebido *</span><input id="pay_value" class="inp" type="number" step="0.01" value="'+esc(old.valor_pago!=null?old.valor_pago:r.expected)+'"></div><div class="field"><span class="lbl">Data do pagamento *</span><input id="pay_date" class="inp" type="date" value="'+esc(old.data_pagamento||today)+'"></div><div class="field"><span class="lbl">Forma de pagamento</span><select id="pay_method" class="inp"><option>PIX</option><option>Transferência</option><option>Dinheiro</option><option>Boleto</option><option>Outro</option></select></div><div class="field full"><span class="lbl">Observação</span><textarea id="pay_note" class="inp">'+esc(old.observacoes||'')+'</textarea></div></div></div><div class="modalfoot"><button id="cancelmodal" class="btn secondary">Cancelar</button><button id="savepay" class="btn primary">Confirmar pagamento</button></div></div></div>');
 E('closemodal').onclick=E('cancelmodal').onclick=function(){E('modal').remove()};
 E('savepay').onclick=async function(){var v=Number(E('pay_value').value||0),msg=E('formmsg');if(v<=0){msg.innerHTML='<div class="notice err">Informe um valor recebido válido.</div>';return}var obj={contrato_id:r.contract.id,competencia:k+'-01',vencimento:r.due,aluguel:r.expected,outros_encargos:Number(old.outros_encargos||0),valor_pago:v,data_pagamento:E('pay_date').value,status:v>=r.expected?'pago':'pendente',observacoes:E('pay_note').value||null};msg.innerHTML='<div class="notice">Salvando pagamento...</div>';try{if(old.id)await dbUpdate('cobrancas',old.id,obj);else await dbInsert('cobrancas',obj);cache.cobrancas=null;E('modal').remove();paymentsPage()}catch(e){msg.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}}
}
async function simpleDash(){
 var k=window._simpleMonth||isoMonth(),rows=await ledgerData(k),maint=await dbGet('manutencoes'),open=(maint||[]).filter(function(x){return ['concluido','cancelado'].indexOf(x.status)<0}).length;window._simpleMonth=k;
 E('content').innerHTML='<div class="simple-toolbar"><div><h2>Visão geral</h2><p>Acompanhe recebimentos, pendências e operação em um único lugar.</p></div>'+monthPicker('dashMonth',k)+'</div>'+summaryCards(rows)+'<div class="simple-grid"><div class="panel simple-panel"><div class="panel-title"><h3>Pendências que precisam de atenção</h3><button class="linkmini" onclick="goQuick(\'Pagamentos\')">Ver pagamentos →</button></div><div class="tablewrap"><table class="table"><thead><tr><th>Inquilino</th><th>Imóvel</th><th>Vencimento</th><th>Pendente</th></tr></thead><tbody>'+rows.filter(function(r){return r.status==='pendente'}).slice(0,8).map(function(r){return '<tr><td>'+esc(r.tenant&&r.tenant.nome||'—')+'</td><td>'+esc(r.property&&r.property.nome||'—')+'</td><td>'+dateBR(r.due)+'</td><td><b>'+money(r.pending)+'</b></td></tr>'}).join('')+'</tbody></table></div></div><div class="panel simple-panel action-panel"><h3>Operação</h3><button onclick="goQuick(\'Pagamentos\')"><b>Informar pagamento</b><span>Registrar recebimento de aluguel</span></button><button onclick="goQuick(\'IPTU\')"><b>IPTU</b><span>Valores e referências anuais</span></button><button onclick="goQuick(\'Chamados\')"><b>Chamados <em>'+open+'</em></b><span>Acompanhar solicitações dos inquilinos</span></button><button onclick="goQuick(\'Relatórios\')"><b>Relatório mensal</b><span>Pagos e pendentes para cobrança</span></button></div></div>';
 E('dashMonth').onchange=function(){window._simpleMonth=this.value;simpleDash()}
}
async function callsPage(){
 var rows=await dbGet('manutencoes');if(!cache.imoveis)await dbGet('imoveis');if(!cache.inquilinos)await dbGet('inquilinos');
 var body=rows.map(function(r){var im=(cache.imoveis||[]).find(function(x){return x.id===r.imovel_id}),ten=(cache.inquilinos||[]).find(function(x){return x.id===r.inquilino_id});return '<tr><td>'+dateBR(r.data_abertura)+'</td><td>'+esc(ten&&ten.nome||'—')+'</td><td>'+esc(im&&im.nome||'—')+'</td><td>'+esc(r.categoria||'—')+'</td><td>'+esc(r.descricao||'—')+'</td><td>'+st(r.status||'aberto')+'</td>'+(currentRole==='admin'?'<td><button class="row-primary" data-call="'+r.id+'">Abrir</button></td>':'')+'</tr>'}).join('');
 E('content').innerHTML='<div class="simple-toolbar"><div><h2>Chamados</h2><p>Solicitações dos inquilinos e acompanhamento da solução.</p></div>'+(currentRole==='inquilino'?'<button id="newcall" class="btn primary">+ Novo chamado</button>':'')+'</div><div class="panel simple-panel"><div class="tablewrap"><table class="table"><thead><tr><th>Abertura</th><th>Inquilino</th><th>Imóvel</th><th>Categoria</th><th>Descrição</th><th>Situação</th>'+(currentRole==='admin'?'<th>Ação</th>':'')+'</tr></thead><tbody>'+(body||'<tr><td colspan="7" class="empty">Nenhum chamado registrado.</td></tr>')+'</tbody></table></div></div>';
 if(E('newcall'))E('newcall').onclick=function(){openForm('Manutenção',null)};
 Array.prototype.forEach.call(document.querySelectorAll('[data-call]'),function(b){b.onclick=function(){var r=rows.find(function(x){return x.id===b.dataset.call});openForm('Manutenção',r)}})
}
async function simpleReports(){
 var k=window._simpleReportMonth||isoMonth(),rows=await ledgerData(k);window._simpleReportMonth=k;var paid=rows.filter(function(r){return r.status==='pago'}),pending=rows.filter(function(r){return r.status==='pendente'});
 function sec(title,list,kind){return '<div class="panel simple-panel report-section"><div class="panel-title"><h3>'+title+'</h3><span class="badge '+(kind==='ok'?'green':'red')+'">'+list.length+'</span></div><div class="tablewrap"><table class="table"><thead><tr><th>Inquilino</th><th>Imóvel</th><th>Vencimento</th><th>Previsto</th><th>Recebido</th><th>Situação</th></tr></thead><tbody>'+(paymentRows(list,false)||'<tr><td colspan="6" class="empty">Nenhum registro.</td></tr>')+'</tbody></table></div></div>'}
 E('content').innerHTML='<div id="printArea"><div class="simple-toolbar"><div><h2>Relatório mensal</h2><p>Relação objetiva para conferência e cobrança.</p></div><div class="report-actions">'+monthPicker('simpleReportMonth',k)+'<button id="simplePrint" class="btn secondary">Imprimir / PDF</button></div></div>'+summaryCards(rows)+sec('Pagos',paid,'ok')+sec('Pendentes',pending,'bad')+'</div>';
 E('simpleReportMonth').onchange=function(){window._simpleReportMonth=this.value;simpleReports()};E('simplePrint').onclick=function(){window.print()}
}
async function settingsHub(){
 E('content').innerHTML='<div class="simple-toolbar"><div><h2>Configurações e cadastros</h2><p>Dados estruturais ficam aqui e não ocupam o menu do dia a dia.</p></div></div><div class="settings-grid">'+[['Imóveis','Endereços, valores-base e situação'],['Inquilinos','Dados e contatos dos locatários'],['Contratos','Vínculos, valores e vencimentos'],['Proprietários','Cadastros dos proprietários'],['Acessos','Usuários e permissões']].map(function(x){return '<button class="settings-card" data-config="'+x[0]+'"><b>'+x[0]+'</b><span>'+x[1]+'</span><i>→</i></button>'}).join('')+'</div><div id="settingsDetail"></div>';
 Array.prototype.forEach.call(document.querySelectorAll('[data-config]'),function(b){b.onclick=async function(){page=b.dataset.config;await modulePage();var html=E('content').innerHTML;page='Configurações';E('settingsDetail').innerHTML='<div class="settings-detail"><button id="backSettings" class="linkmini">← Voltar aos cadastros</button>'+html+'</div>';E('backSettings').onclick=settingsHub}})
}
var originalLoad=window.load||load;
load=async function(){
 var C=E('content');if(!C)return;
 try{
  if(page==='Dashboard')return simpleDash();
  if(page==='Pagamentos')return paymentsPage();
  if(page==='Chamados')return callsPage();
  if(page==='Relatórios')return simpleReports();
  if(page==='Configurações'&&currentRole==='admin')return settingsHub();
  return originalLoad.apply(this,arguments)
 }catch(e){C.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}
};window.load=load;
var oldIcon=window.navIcon||navIcon;navIcon=function(x){var m={'Dashboard':'⌂','Pagamentos':'$','IPTU':'⌑','Chamados':'◇','Relatórios':'▥','Configurações':'⚙'};return m[x]||oldIcon(x)};window.navIcon=navIcon;
})();
