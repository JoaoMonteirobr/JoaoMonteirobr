(function(){
'use strict';
var currentYear=new Date().getFullYear();
function yearOptions(){var a=[];for(var y=currentYear+2;y>=currentYear-10;y--)a.push(String(y));return a.join('|')}
function isPending(v){return v==='em_aberto'||v==='pendente'}
function iptuStatus(v){return v==='pago'?'<span class="badge green">Pago</span>':'<span class="badge yellow">Pendente</span>'}

/* Uma única fonte de verdade: os lançamentos anuais ficam na tabela IPTU. */
if(forms&&forms['Imóveis'])forms['Imóveis']=forms['Imóveis'].filter(function(f){return f[0]!=='iptu_mensal'});
if(forms)forms.IPTU=[
 ['imovel_id','Imóvel','lookup:imoveis',1],
 ['ano','Ano de referência','select:'+yearOptions(),1],
 ['valor_total','Valor anual do IPTU','number',1],
 ['situacao','Situação','select:pago|em_aberto',1],
 ['modalidade','Forma de pagamento','select:a_vista|parcelado',1],
 ['numero_parcelas','Número de parcelas','number'],
 ['valor_parcela','Valor de cada parcela','number'],
 ['data_pagamento','Data do pagamento','date'],
 ['observacoes','Observações','textarea']
];

var previousColumns=columnsFor;
columnsFor=function(p){if(p==='IPTU')return [['imovel_id','Imóvel'],['ano','Ano de referência'],['valor_total','Valor anual'],['modalidade','Forma'],['situacao','Situação']];return previousColumns(p)};
window.columnsFor=columnsFor;
var previousFormat=formatCell;
formatCell=function(k,v){if(k==='situacao')return iptuStatus(v);return previousFormat(k,v)};
window.formatCell=formatCell;

function decorateIptuForm(p){
 if(p==='Imóveis'){
  var grid=document.querySelector('.modal .formgrid');
  if(grid&&!document.getElementById('iptu_source_notice')){
   var n=document.createElement('div');n.id='iptu_source_notice';n.className='notice full';n.innerHTML='<b>IPTU anual:</b> o valor, ano de referência e situação são cadastrados na aba <b>IPTU</b>. Assim o sistema evita valores mensais duplicados ou divergentes.';grid.appendChild(n)
  }
  return;
 }
 if(p!=='IPTU')return;
 var status=document.getElementById('f_situacao'),mode=document.getElementById('f_modalidade'),year=document.getElementById('f_ano'),value=document.getElementById('f_valor_total');
 if(status){Array.prototype.forEach.call(status.options,function(o){if(o.value==='pago')o.textContent='Pago';if(o.value==='em_aberto')o.textContent='Pendente'})}
 if(mode){Array.prototype.forEach.call(mode.options,function(o){if(o.value==='a_vista')o.textContent='À vista';if(o.value==='parcelado')o.textContent='Parcelado'})}
 if(year&&!year.value)year.value=String(currentYear);
 if(value)value.setAttribute('placeholder','Valor total do IPTU no ano de referência');
 var grid2=document.querySelector('.modal .formgrid');
 if(grid2&&!document.getElementById('iptu_annual_notice')){
  var info=document.createElement('div');info.id='iptu_annual_notice';info.className='notice full';info.innerHTML='<b>Registro anual:</b> informe o valor total do IPTU para o ano selecionado. Use <b>Pendente</b> enquanto houver saldo a pagar e <b>Pago</b> quando estiver quitado.';grid2.insertBefore(info,grid2.firstChild)
 }
}
// Não permitir novo lançamento anual de um imóvel que já tenha registro naquele ano.
// Isso inclui IPTUs pagos e pendentes: ambos devem ser corrigidos pelo botão "Editar".
function recordedIptu(year,rows,exceptId){
 return (rows||[]).filter(function(r){
  return Number(r.ano)===Number(year)&&(!exceptId||r.id!==exceptId)
 })
}
function availableIptuProperties(year,rows,exceptId,properties){
 var registered=recordedIptu(year,rows,exceptId);
 var blocked=new Set(registered.map(function(r){return r.imovel_id}));
 return (properties||[]).filter(function(imovel){return !blocked.has(imovel.id)})
}
function refreshIptuPropertyOptions(row){
 var yearSelect=document.getElementById('f_ano'),select=document.getElementById('f_imovel_id');
 if(!yearSelect||!select)return;
 var year=Number(yearSelect.value),existing=cache.iptu||[],all=cache.imoveis||[];
 var permitted=availableIptuProperties(year,existing,row&&row.id,all);
 var chosen=select.value;
 // Ao editar, manter o imóvel originalmente selecionado sem permitir outro
 // lançamento duplicado do mesmo ano.
 if(row&&row.imovel_id&&permitted.some(function(x){return x.id===row.imovel_id})){
  if(!chosen)chosen=row.imovel_id
 }
 var accepted=permitted.some(function(x){return x.id===chosen});
 select.innerHTML='<option value="">Selecione um imóvel disponível</option>'+
  permitted.map(function(imovel){return '<option value="'+esc(imovel.id)+'">'+esc(lookupLabel('imoveis',imovel))+'</option>'}).join('');
 select.value=accepted?chosen:'';
 select.disabled=permitted.length===0;
 var blocked=recordedIptu(year,existing,row&&row.id),paid=blocked.filter(function(x){return x.situacao==='pago'}).length;
 var notice=document.getElementById('iptu_available_notice');
 if(!notice){
  notice=document.createElement('div');
  notice.id='iptu_available_notice';
  notice.className='notice full';
  select.closest('.field').appendChild(notice)
 }
 notice.textContent=permitted.length
  ? permitted.length+' imóveis disponíveis para '+year+'. '+blocked.length+
    ' já cadastrados (sendo '+paid+' pagos) foram retirados da lista. Para corrigir um lançamento, use Editar na tabela de IPTU.'
  : 'Todos os imóveis já possuem registro de IPTU em '+year+'. Para alterar o pagamento, use Editar na tabela de IPTU.';
 var save=document.getElementById('savemodal');
 if(save)save.disabled=!permitted.length;
}
var previousOpenForm=window.openForm||openForm;
openForm=async function(p,row){
 if(p==='IPTU'&&currentRole==='admin'){
  // Consultar o banco novamente ao abrir: não depender da lista em cache.
  try{await dbGet('iptu')}
  catch(e){
   var content=document.getElementById('content');
   if(content){
    var warning=document.createElement('div');
    warning.className='notice err';
    warning.textContent='Não foi possível conferir os IPTUs cadastrados. Tente novamente antes de incluir um novo registro.';
    content.prepend(warning)
   }
   return
  }
 }
 var out=await previousOpenForm.apply(this,arguments);
 decorateIptuForm(p,row);
 if(p==='IPTU'){
  refreshIptuPropertyOptions(row);
  var year=document.getElementById('f_ano');
  if(year)year.addEventListener('change',function(){refreshIptuPropertyOptions(row)})
 }
 return out
};
window.openForm=openForm;

// Além de esconder a opção, conferir no servidor antes de gravar.
// A restrição UNIQUE (imovel_id, ano) do PostgreSQL permanece como
// proteção contra cadastros simultâneos em abas/navegadores diferentes.
var previousSaveForm=window.saveForm||saveForm;
saveForm=async function(p,id){
 if(p==='IPTU'&&currentRole==='admin'){
  var imovel=document.getElementById('f_imovel_id'),ano=document.getElementById('f_ano');
  var msg=document.getElementById('formmsg');
  if(!imovel||!imovel.value||!ano||!ano.value){
   if(msg)msg.textContent='Selecione um imóvel disponível e o ano de referência.';
   return
  }
  try{
   var rows=await dbGet('iptu');
   var exists=recordedIptu(Number(ano.value),rows,id).some(function(r){return r.imovel_id===imovel.value});
   if(exists){
    if(msg)msg.textContent='Este imóvel já possui IPTU cadastrado para '+ano.value+'. Edite o lançamento existente na tabela, em vez de duplicá-lo.';
    refreshIptuPropertyOptions(id?rows.find(function(r){return r.id===id}):null);
    return
   }
  }catch(e){
   if(msg)msg.textContent='Não foi possível verificar duplicidade no banco. Tente novamente.';
   return
  }
 }
 return previousSaveForm.apply(this,arguments)
};
window.saveForm=saveForm;

function availableYears(rows){var years=(rows||[]).map(function(r){return Number(r.ano)}).filter(Boolean);if(years.indexOf(currentYear)<0)years.push(currentYear);return years.filter(function(v,i,a){return a.indexOf(v)===i}).sort(function(a,b){return b-a})}
function annualSummary(rows,year){var r=(rows||[]).filter(function(x){return Number(x.ano)===Number(year)}),pending=r.filter(function(x){return isPending(x.situacao)}),paid=r.filter(function(x){return x.situacao==='pago'});return {rows:r,pending:pending,paid:paid,total:r.reduce(function(s,x){return s+Number(x.valor_total||0)},0),pendingValue:pending.reduce(function(s,x){return s+Number(x.valor_total||0)},0),paidValue:paid.reduce(function(s,x){return s+Number(x.valor_total||0)},0)}}
function dashboardIptu(){
 var rows=cache.iptu||[],years=availableYears(rows),year=window._dashIptuYear&&years.indexOf(Number(window._dashIptuYear))>=0?Number(window._dashIptuYear):(years.indexOf(currentYear)>=0?currentYear:years[0]),s=annualSummary(rows,year);
 var panels=Array.prototype.slice.call(document.querySelectorAll('.panel')),panel=panels.find(function(x){var h=x.querySelector('h3');return h&&h.textContent.indexOf('IPTU em aberto')>=0});if(!panel)return;
 var opts=years.map(function(y){return '<option value="'+y+'" '+(y===year?'selected':'')+'>'+y+'</option>'}).join('');
 panel.innerHTML='<div class="panel-title"><div><h3>IPTU — referência '+year+'</h3><div class="muted">Valores anuais, sem mistura com cobranças mensais.</div></div><select id="dashIptuYear" class="inp" style="width:auto">'+opts+'</select></div><div class="iptu-box"><div class="iptu-stat"><small class="muted">Pendente no ano</small><b style="color:var(--red)">'+money(s.pendingValue)+'</b></div><div class="iptu-stat"><small class="muted">Pago no ano</small><b style="color:var(--green)">'+money(s.paidValue)+'</b></div><div class="iptu-stat"><small class="muted">Registros pendentes</small><b>'+s.pending.length+'</b></div><div class="iptu-stat"><small class="muted">Total anual cadastrado</small><b>'+money(s.total)+'</b></div></div><button class="linkmini" style="margin-top:12px" onclick="goQuick(\'IPTU\')">Ver lançamentos de IPTU →</button>';
 var sel=document.getElementById('dashIptuYear');if(sel)sel.onchange=function(){window._dashIptuYear=Number(this.value);dashboardIptu()}
}
var previousDash=window.dash||dash;
dash=async function(){var out=await previousDash.apply(this,arguments);dashboardIptu();return out};
window.dash=dash;

function iptuReportSection(rows){
 var years=availableYears(rows),year=window._reportIptuYear&&years.indexOf(Number(window._reportIptuYear))>=0?Number(window._reportIptuYear):(years.indexOf(currentYear)>=0?currentYear:years[0]),s=annualSummary(rows,year),ims=cache.imoveis||[];
 var opts=years.map(function(y){return '<option value="'+y+'" '+(y===year?'selected':'')+'>'+y+'</option>'}).join('');
 var body=s.rows.map(function(r){var im=ims.find(function(x){return x.id===r.imovel_id});return '<tr><td>'+esc(im?im.nome:'—')+'</td><td>'+esc(r.ano)+'</td><td>'+money(r.valor_total||0)+'</td><td>'+esc(r.modalidade==='a_vista'?'À vista':'Parcelado')+'</td><td>'+iptuStatus(r.situacao)+'</td><td>'+dateBR(r.data_pagamento)+'</td></tr>'}).join('');
 return '<div class="panel" id="reportIptuAnnual"><div class="toolbar"><div><h3 style="margin:0">Relatório anual de IPTU — '+year+'</h3><div class="muted">Separado do relatório mensal de aluguéis para evitar interpretação incorreta.</div></div><select id="reportIptuYear" class="inp" style="width:auto">'+opts+'</select></div><div class="mini-fin" style="margin:14px 0"><div class="mini-stat"><small>Total anual</small><b>'+money(s.total)+'</b></div><div class="mini-stat"><small>Pago</small><b style="color:var(--green)">'+money(s.paidValue)+'</b></div><div class="mini-stat"><small>Pendente</small><b style="color:var(--red)">'+money(s.pendingValue)+'</b></div><div class="mini-stat"><small>Registros pendentes</small><b>'+s.pending.length+'</b></div></div><div class="tablewrap"><table class="table"><thead><tr><th>Imóvel</th><th>Ano</th><th>Valor anual</th><th>Forma</th><th>Situação</th><th>Pagamento</th></tr></thead><tbody>'+(body||'<tr><td colspan="6" class="empty">Nenhum IPTU cadastrado para este ano.</td></tr>')+'</tbody></table></div></div>'
}
function bindReportYear(rows){var s=document.getElementById('reportIptuYear');if(s)s.onchange=function(){window._reportIptuYear=Number(this.value);var old=document.getElementById('reportIptuAnnual');if(old){var wrap=document.createElement('div');wrap.innerHTML=iptuReportSection(rows);old.replaceWith(wrap.firstChild);bindReportYear(rows)}}}
var previousReports=window.reports||reports;
reports=async function(){var out=await previousReports.apply(this,arguments);var rows=await dbGet('iptu');if(!cache.imoveis)await dbGet('imoveis');var area=document.getElementById('printArea');if(area){area.insertAdjacentHTML('beforeend',iptuReportSection(rows));bindReportYear(rows)}return out};
window.reports=reports;
})();