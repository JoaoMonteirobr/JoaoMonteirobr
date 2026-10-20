// =====================================================
// RELATÓRIO MENSAL DE ALUGUÉIS
// =====================================================
// Organiza as linhas do ledger mensal (buildLedger) numa leitura simples:
// resumo → falta receber (por vencimento) → recebidos. Também gera o layout
// de impressão/PDF. Os dados não são alterados aqui, só apresentados.
(function(root){
'use strict';
var MONTHS=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

// "2026-10" → "outubro de 2026".
function monthLabel(k){var p=String(k||'').split('-'),m=Number(p[1]);return MONTHS[m-1]?MONTHS[m-1]+' de '+p[0]:String(k||'')}

// Diferença em dias entre duas datas ISO (AAAA-MM-DD), sem depender do fuso.
function daysBetween(from,to){var a=Date.parse(String(from).slice(0,10)+'T00:00:00Z'),b=Date.parse(String(to).slice(0,10)+'T00:00:00Z');return Number.isNaN(a)||Number.isNaN(b)?null:Math.round((b-a)/86400000)}

// Texto curto da situação do vencimento de um aluguel em aberto.
function dueLabel(daysLate){
 if(daysLate==null)return {text:'Sem vencimento',tone:'muted'};
 if(daysLate>0)return {text:'Atrasado há '+daysLate+(daysLate===1?' dia':' dias'),tone:'late'};
 if(daysLate===0)return {text:'Vence hoje',tone:'soon'};
 return {text:'Vence em '+(-daysLate)+(daysLate===-1?' dia':' dias'),tone:'ok'};
}

// Data de hoje no fuso do aparelho (toISOString usaria UTC e viraria o dia às 21h no Brasil).
function localToday(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}

function num(v){var n=Number(v);return Number.isFinite(n)?n:0}
function sum(list,key){return list.reduce(function(s,r){return s+num(r[key])},0)}

// Converte as linhas do ledger no modelo do relatório.
function summarize(rows,month,today){
 rows=rows||[];today=String(today||localToday()).slice(0,10);
 var pending=[],paid=[];
 rows.forEach(function(r){
  var item={
   tenant:r.tenant&&r.tenant.nome||'Sem inquilino',
   property:r.property&&(r.property.nome||r.property.endereco)||'—',
   due:r.due||null,
   expected:num(r.expected),
   paid:num(r.paid),
   missing:num(r.pending),
   paidAt:r.charge&&r.charge.data_pagamento||null
  };
  if(r.status==='pago')paid.push(item);
  else{item.partial=item.paid>0;item.daysLate=item.due?daysBetween(item.due,today):null;pending.push(item)}
 });
 pending.sort(function(a,b){return String(a.due||'9999').localeCompare(String(b.due||'9999'))||a.tenant.localeCompare(b.tenant,'pt-BR')});
 paid.sort(function(a,b){return String(a.paidAt||a.due||'').localeCompare(String(b.paidAt||b.due||''))||a.tenant.localeCompare(b.tenant,'pt-BR')});
 return {
  month:month,monthLabel:monthLabel(month),today:today,
  total:rows.length,paidCount:paid.length,pendingCount:pending.length,
  lateCount:pending.filter(function(p){return p.daysLate>0}).length,
  partialCount:pending.filter(function(p){return p.partial}).length,
  expected:sum(rows,'expected'),received:sum(rows,'paid'),missing:sum(rows,'pending'),
  pending:pending,paid:paid
 };
}

// Monta o HTML. `h` recebe os utilitários do app: esc, money e dateBR.
function render(m,h){
 var esc=h.esc,money=h.money,dateBR=h.dateBR,title=m.monthLabel.charAt(0).toUpperCase()+m.monthLabel.slice(1);
 var pct=m.expected>0?Math.min(100,Math.round(m.received/m.expected*100)):0;
 var who=function(r){return '<td data-label="Inquilino"><b>'+esc(r.tenant)+'</b><span class="mr-sub">'+esc(r.property)+'</span></td>'};
 var lead=m.total?'<b>'+m.paidCount+' de '+m.total+'</b> aluguéis pagos'+(m.lateCount?' · <b class="mr-late-text">'+m.lateCount+' em atraso</b>':'')+(m.partialCount?' · '+m.partialCount+' com pagamento parcial':''):'Nenhum aluguel previsto para este mês.';
 var pendingRows=m.pending.map(function(r){var d=dueLabel(r.daysLate);return '<tr>'+who(r)+'<td data-label="Vencimento">'+dateBR(r.due)+'<span class="mr-due mr-due-'+d.tone+'">'+d.text+'</span></td><td data-label="Aluguel" class="mr-num">'+money(r.expected)+'</td><td data-label="Já pago" class="mr-num">'+(r.paid?money(r.paid):'—')+'</td><td data-label="Falta" class="mr-num mr-strong">'+money(r.missing)+'</td></tr>'}).join('');
 var paidRows=m.paid.map(function(r){return '<tr>'+who(r)+'<td data-label="Pago em">'+(r.paidAt?dateBR(r.paidAt):'—')+'</td><td data-label="Valor recebido" class="mr-num mr-strong">'+money(r.paid)+'</td></tr>'}).join('');
 return '<div id="printArea" class="monthly-report">'
  +'<header class="mr-print-head"><div><b>Matos</b> · Gestão de Aluguéis</div><div>Emitido em '+dateBR(m.today)+'</div></header>'
  +'<div class="simple-toolbar mr-toolbar"><div><h2>Aluguéis de '+esc(m.monthLabel)+'</h2><p>Quem já pagou e quanto falta receber no mês.</p></div><div class="report-actions">'+h.picker+'<button id="simplePrint" class="btn secondary">Imprimir / PDF</button></div></div>'
  +'<h1 class="mr-print-title">Relatório de aluguéis — '+esc(title)+'</h1>'
  +'<section class="mr-summary"><div class="mr-stat"><span>Esperado no mês</span><b>'+money(m.expected)+'</b></div><div class="mr-stat mr-ok"><span>Recebido</span><b>'+money(m.received)+'</b></div><div class="mr-stat mr-bad"><span>Falta receber</span><b>'+money(m.missing)+'</b></div>'
  +'<div class="mr-progress"><div class="mr-bar" role="img" aria-label="'+pct+'% do valor esperado recebido"><i style="width:'+pct+'%"></i></div><p>'+lead+'</p></div></section>'
  +'<section class="panel simple-panel mr-section"><div class="panel-title"><h3>Falta receber</h3><span class="badge '+(m.pendingCount?'red':'green')+'">'+m.pendingCount+'</span></div>'
  +(m.pendingCount?'<table class="table mr-table"><thead><tr><th>Inquilino / imóvel</th><th>Vencimento</th><th class="mr-num">Aluguel</th><th class="mr-num">Já pago</th><th class="mr-num">Falta</th></tr></thead><tbody>'+pendingRows+'</tbody><tfoot><tr><td colspan="4">Total a receber</td><td class="mr-num" data-label="Total a receber">'+money(m.missing)+'</td></tr></tfoot></table>':'<p class="mr-empty">'+(m.total?'Todos os aluguéis do mês foram pagos.':'Nenhum aluguel previsto para este mês.')+'</p>')
  +'</section>'
  +'<section class="panel simple-panel mr-section"><div class="panel-title"><h3>Recebidos</h3><span class="badge green">'+m.paidCount+'</span></div>'
  +(m.paidCount?'<table class="table mr-table"><thead><tr><th>Inquilino / imóvel</th><th>Pago em</th><th class="mr-num">Valor recebido</th></tr></thead><tbody>'+paidRows+'</tbody><tfoot>'+(m.partialCount?'<tr class="mr-sub-total"><td colspan="2">Pagamentos completos</td><td class="mr-num" data-label="Pagamentos completos">'+money(sum(m.paid,'paid'))+'</td></tr><tr class="mr-sub-total"><td colspan="2">Pagamentos parciais (listados em “Falta receber”)</td><td class="mr-num" data-label="Pagamentos parciais">'+money(sum(m.pending,'paid'))+'</td></tr>':'')+'<tr><td colspan="2">Total recebido no mês</td><td class="mr-num" data-label="Total recebido no mês">'+money(m.received)+'</td></tr></tfoot></table>':'<p class="mr-empty">Nenhum pagamento registrado neste mês.</p>')
  +'</section></div>';
}

root.MatosMonthlyReport={monthLabel:monthLabel,daysBetween:daysBetween,dueLabel:dueLabel,summarize:summarize,render:render};
})(typeof window!=='undefined'?window:globalThis);
