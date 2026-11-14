/* Relatório de situação do IPTU: leitura autorizada e PDF gerado no navegador. */
(function(root){
'use strict';
function centavos(value){return Math.max(0,Math.round((Number(value)||0)*100))}
function brl(value){return Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function escHtml(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function classify(detail){
 if(detail.needsReview||detail.total<=0)return 'conferir';
 if(detail.paid)return 'quitado';
 if(detail.partial)return 'parcial';
 return 'pendente'
}
var labels={quitado:'Quitado',parcial:'Parcialmente pago',pendente:'Pendente',conferir:'A conferir'};
function parcelas(item){
 var d=item.detail;
 if(item.kind==='conferir')return 'A conferir';
 if(!d.installment)return 'À vista';
 var paid=d.installmentsPaid;
 if(paid===null)return 'A conferir';
 return paid+' de '+d.installments+' pagas'+(item.kind==='quitado'?'':'; faltam '+Math.max(0,d.installments-paid))
}
function build(records,properties,year,filter){
 var yr=Number(year),state=filter||'todos',lookup={};
 (properties||[]).forEach(function(p){lookup[p.id]=p});
 var items=(records||[]).filter(function(r){return Number(r.ano)===yr}).map(function(r){
  var d=root.MatosIptuAccounting.detail(r),kind=classify(d),imovel=lookup[r.imovel_id];
  return {id:r.id,imovel:imovel&&imovel.nome||'Imóvel não identificado',kind:kind,label:labels[kind],
   mode:r.modalidade==='parcelado'?'Parcelado':'À vista',detail:d,year:yr}
 }).filter(function(r){return state==='pagos'?r.kind==='quitado':state==='pendentes'?r.kind!=='quitado':true});
 var priority={parcial:0,pendente:1,conferir:2,quitado:3};
 items.sort(function(a,b){return priority[a.kind]-priority[b.kind]||a.imovel.localeCompare(b.imovel,'pt-BR')});
 var total=0,received=0,pending=0,reviewBase=0,count={quitado:0,parcial:0,pendente:0,conferir:0};
 items.forEach(function(r){
  var d=r.detail;count[r.kind]++;total+=centavos(d.total);received+=centavos(d.received);
  if(r.kind==='conferir')reviewBase+=centavos(d.total);
  else pending+=centavos(d.pending);
 });
 return {year:yr,filter:state,items:items,count:count,total:total/100,received:received/100,
  pending:pending/100,reviewBase:reviewBase/100}
}
function years(rows){
 var current=new Date().getFullYear(),list=[current];
 (rows||[]).forEach(function(r){var y=Number(r.ano);if(Number.isInteger(y)&&y>=2000&&y<=current+10&&list.indexOf(y)<0)list.push(y)});
 return list.sort(function(a,b){return b-a})
}
function cells(model){
 return model.items.map(function(r){
  return '<tr><td>'+escHtml(r.imovel)+'</td><td><span class="isr-status isr-'+r.kind+'">'+r.label+'</span></td>'+
   '<td>'+escHtml(parcelas(r))+'</td><td class="isr-num">'+brl(r.detail.total)+'</td>'+
   '<td class="isr-num">'+brl(r.detail.received)+'</td><td class="isr-num isr-balance">'+
   (r.kind==='conferir'?'A conferir':brl(r.detail.pending))+'</td></tr>'
 }).join('')
}
function renderPreview(){
 var yr=document.getElementById('isr-year'),filter=document.getElementById('isr-filter'),preview=document.getElementById('isr-preview');
 if(!yr||!filter||!preview)return;
 var model=build(root._isrRecords||[],root._isrProperties||[],yr.value,filter.value);
 var counts='Quitados: '+model.count.quitado+' · Parcialmente pagos: '+model.count.parcial+
  ' · Pendentes: '+model.count.pendente+' · A conferir: '+model.count.conferir;
 preview.innerHTML='<div class="isr-stats">'+
  '<div class="isr-stat"><small>IPTU total no filtro</small><b>'+brl(model.total)+'</b></div>'+
  '<div class="isr-stat"><small>Valor já pago</small><b>'+brl(model.received)+'</b></div>'+
  '<div class="isr-stat isr-red"><small>Falta quitar (confirmado)</small><b>'+brl(model.pending)+'</b></div>'+
  '<div class="isr-stat"><small>Base a conferir</small><b>'+brl(model.reviewBase)+'</b></div></div>'+
  '<p class="isr-legend">'+counts+'</p>'+
  (model.count.conferir?'<p class="isr-warning">Há '+model.count.conferir+' lançamento(s) sem saldo confirmado. Confira o valor e as parcelas pagas antes de considerar esses registros quitados. A base a conferir não integra o saldo confirmado.</p>':'')+
  (model.items.length?'<div class="isr-scroll"><table class="table isr-table"><thead><tr><th>Imóvel</th><th>Situação</th><th>Parcelas</th><th>Valor anual</th><th>Pago</th><th>Falta quitar</th></tr></thead><tbody>'+cells(model)+'</tbody></table></div>':
   '<p class="isr-empty">Não há lançamentos de IPTU para o ano e filtro escolhidos.</p>');
 var button=document.getElementById('isr-download');if(button)button.disabled=!model.items.length;
}
function pdfText(text){return String(text==null?'':text).replace(/[\u2013\u2014]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[\u2022]/g,'-').replace(/[^\x20-\xFF]/g,'?')}
function moneyPdf(value){return pdfText(brl(value))}
function exportPdf(model){
 if(!root.jspdf||!root.jspdf.jsPDF)throw new Error('Biblioteca de PDF indisponível.');
 var doc=new root.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
 var W=297,H=210,margin=14,inner=269,navy=[16,41,69],gold=[199,149,57],mute=[91,109,130],green=[19,111,70],red=[162,43,49];
 var widths=[62,39,45,41,40,42],titles=['IMÓVEL','SITUAÇÃO','PARCELAS / RESTANTES','VALOR ANUAL','JÁ PAGO','FALTA QUITAR'];
 var selected={todos:'Todos',pagos:'Quitados',pendentes:'Pendentes'}[model.filter]||'Todos';
 var created=new Date().toLocaleString('pt-BR',{timeZone:'America/Rio_Branco'});
 function text(t,x,y,size,color,bold){
  doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);
  doc.setTextColor.apply(doc,color||navy);doc.text(pdfText(t),x,y)
 }
 function header(){
  doc.setFillColor.apply(doc,navy);doc.rect(0,0,W,32,'F');
  doc.setFillColor.apply(doc,gold);doc.rect(0,32,W,2,'F');
  text('MATOS',margin,13,20,[255,255,255],true);
  text('GESTÃO DE ALUGUÉIS',margin,20,8,[234,226,210],false);
  text('RELATÓRIO DE SITUAÇÃO DO IPTU',103,14,14,[255,255,255],true);
  text('Ano '+model.year+'  |  '+selected+'  |  Emitido em '+created,103,23,9,[234,226,210],false)
 }
 function stats(){
  var stat=[
   ['VALOR ANUAL',model.total],
   ['JÁ PAGO',model.received],
   ['SALDO CONFIRMADO',model.pending],
   ['BASE A CONFERIR',model.reviewBase]
  ],gap=4,width=(inner-3*gap)/4;
  stat.forEach(function(s,i){
   var x=margin+i*(width+gap);
   doc.setFillColor(244,247,250);doc.roundedRect(x,39,width,22,2,2,'F');
   text(s[0],x+4,46,8,mute,true);
   text(moneyPdf(s[1]),x+4,56,13,i===2?red:navy,true)
  });
  text('Quitados: '+model.count.quitado+'  |  Parciais: '+model.count.parcial+'  |  Pendentes: '+model.count.pendente+'  |  A conferir: '+model.count.conferir,
   margin,68,9,mute,false);
  if(model.count.conferir)text('Atenção: registros a conferir não compõem o saldo confirmado; valide as parcelas já pagas.',margin,75,8,red,false)
 }
 function tableHeader(y){
  doc.setFillColor(235,240,246);doc.rect(margin,y,inner,9,'F');
  var x=margin;titles.forEach(function(t,i){text(t,x+2,y+6,7.3,navy,true);x+=widths[i]});
 }
 function row(item,y,index){
  if(index%2===0){doc.setFillColor(250,251,253);doc.rect(margin,y,inner,14,'F')}
  var d=item.detail,last=item.kind==='conferir'?'A conferir':moneyPdf(d.pending);
  var col=[item.imovel,item.label,parcelas(item),moneyPdf(d.total),moneyPdf(d.received),last];
  var x=margin;
  for(var k=0;k<col.length;k++){
   var w=widths[k],size=k<3?8:8.3,content=pdfText(col[k]),lines=doc.splitTextToSize(content,w-4).slice(0,2);
   if(lines.length>1&&lines[1].length>0&&doc.getTextWidth(lines[1])>w-4)lines[1]=lines[1].slice(0,23);
   for(var j=0;j<lines.length;j++)text(lines[j],x+2,y+5+j*4.2,size,
    k===5&&item.kind!=='quitado'?red:k===1&&item.kind==='quitado'?green:navy,k===1||k===5);
   x+=w
  }
  doc.setDrawColor(230,235,240);doc.line(margin,y+14,margin+inner,y+14)
 }
 header();stats();
 var y=model.count.conferir?82:75;tableHeader(y);y+=9;
 var rowIndex=0;
 model.items.forEach(function(item){
  if(y+14>191){doc.addPage();header();y=40;tableHeader(y);y+=9;rowIndex=0}
  row(item,y,rowIndex++);y+=14
 });
 var pages=doc.internal.getNumberOfPages();
 for(var p=1;p<=pages;p++){
  doc.setPage(p);doc.setDrawColor(222,226,231);doc.line(margin,197,W-margin,197);
  text('Relatório gerado a partir dos lançamentos autorizados no sistema Matos.',margin,202,8,mute,false);
  text('Página '+p+' de '+pages,W-37,202,8,mute,false)
 }
 var name='MATOS_IPTU_Situacao_'+model.year+'_'+model.filter+'.pdf';
 doc.save(name);return name
}
async function download(){
 var btn=document.getElementById('isr-download'),notice=document.getElementById('isr-message'),
  year=document.getElementById('isr-year'),filter=document.getElementById('isr-filter');
 if(!btn||!year||!filter)return;
 btn.disabled=true;btn.textContent='Preparando relatório...';
 if(notice)notice.textContent='';
 try{
  // Consulta fresca, sujeita às políticas RLS do perfil autenticado.
  var records=await dbGet('iptu'),properties=await dbGet('imoveis');
  root._isrRecords=records;root._isrProperties=properties;
  var model=build(records,properties,year.value,filter.value);
  renderPreview();
  if(!model.items.length)throw new Error('Nenhum IPTU cadastrado para o filtro selecionado.');
  if(typeof root.ensurePdfLibraries!=='function')throw new Error('Gerador de PDF não está disponível.');
  await root.ensurePdfLibraries();
  var name=exportPdf(model);
  if(notice)notice.textContent='Relatório emitido: '+name
 }catch(error){
  if(notice)notice.textContent='Não foi possível emitir o relatório. '+(error&&error.message||'Tente novamente.')
 }finally{
  btn.textContent='Emitir relatório PDF';btn.disabled=!build(root._isrRecords||[],root._isrProperties||[],year.value,filter.value).items.length
 }
}
function mount(){
 var target=document.getElementById('content');
 if(!target||document.getElementById('isr-panel'))return;
 var records=cache.iptu||[],properties=cache.imoveis||[];
 root._isrRecords=records;root._isrProperties=properties;
 var allYears=years(records),defaultYear=allYears[0],options=allYears.map(function(y){return '<option value="'+y+'">'+y+'</option>'}).join('');
 var panel=document.createElement('section');
 panel.className='panel isr-panel';panel.id='isr-panel';
 panel.innerHTML='<div class="isr-head"><div><span class="isr-eyebrow">CONTROLE FINANCEIRO · IPTU</span>'+
  '<h2>Relatório de situação</h2><p>Identifique imóveis quitados e pendentes, parcelas pagas e o saldo que falta para quitar.</p></div>'+
  '<div class="isr-filters"><label>Ano de referência<select class="inp" id="isr-year">'+options+'</select></label>'+
  '<label>Situação<select class="inp" id="isr-filter"><option value="todos">Todos</option><option value="pagos">Quitados</option><option value="pendentes">Pendentes e a conferir</option></select></label>'+
  '<button type="button" id="isr-download" class="btn primary">Emitir relatório PDF</button></div></div>'+
  '<div id="isr-preview"></div><p class="isr-message" id="isr-message" role="status" aria-live="polite"></p>';
 target.prepend(panel);
 document.getElementById('isr-year').value=String(defaultYear);
 document.getElementById('isr-year').addEventListener('change',renderPreview);
 document.getElementById('isr-filter').addEventListener('change',renderPreview);
 document.getElementById('isr-download').addEventListener('click',download);
 renderPreview()
}
var previousModulePage=root.modulePage;
if(typeof previousModulePage==='function'){
 root.modulePage=async function(){
  var result=await previousModulePage.apply(this,arguments);
  if(typeof page!=='undefined'&&page==='IPTU')mount();
  return result
 }
}
root.MatosIptuSituationReport={build:build,years:years,parcelas:parcelas,exportPdf:exportPdf,mount:mount};
})(window);
