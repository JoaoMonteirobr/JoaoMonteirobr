(function(root){
 'use strict';
 // Um único cálculo para o Dashboard, o cadastro e os relatórios de IPTU.
 // Trabalhar em centavos evita divergências por arredondamento em parcelas.
 function cents(value){
  var number=Number(value);
  return Number.isFinite(number)?Math.max(0,Math.round(number*100)):0
 }
 function detail(row){
  row=row||{};
  var total=cents(row.valor_total),isInstallment=row.modalidade==='parcelado';
  var n=Math.max(1,Math.trunc(Number(row.numero_parcelas)||1));
  var raw=row.parcelas_pagas,known=raw!==null&&raw!==undefined&&raw!=='';
  var count=known?Number(raw):null;
  if(known&&(!Number.isInteger(count)||count<0||count>n)){known=false;count=null}
  var fullyPaid=row.situacao==='pago';
  var received=0,needsReview=false;
  if(!isInstallment)received=fullyPaid?total:0;
  else if(known){
   var per=cents(row.valor_parcela);
   if(!per)per=Math.round(total/n);
   received=count===n?total:Math.min(total,count*per);
  }else if(fullyPaid)received=total; // Compatibilidade com registros legados pagos.
  else needsReview=true;
  var outstanding=Math.max(0,total-received);
  return {
   total:total/100,received:received/100,pending:outstanding/100,
   installment:isInstallment,installments:n,
   installmentsPaid:known?count:(fullyPaid?n:null),
   needsReview:needsReview,
   paid:outstanding===0&&total>0,
   partial:received>0&&outstanding>0,
   progress:isInstallment?(known?count+' de '+n:(fullyPaid?n+' de '+n:'A conferir')):'À vista'
  }
 }
 function summary(records,year){
  var rows=(records||[]).filter(function(r){return Number(r.ano)===Number(year)});
  var t=0,r=0,p=0,paid=0,pending=0,partial=0,unreviewed=0,unreviewedAmount=0;
  rows.forEach(function(row){
   var v=detail(row);
   t+=cents(v.total);r+=cents(v.received);p+=cents(v.pending);
   if(v.paid)paid++;if(v.pending>0)pending++;
   if(v.partial)partial++;
   if(v.needsReview){unreviewed++;unreviewedAmount+=cents(v.total)}
  });
  return {
   total:t/100,received:r/100,pending:p/100,
   count:rows.length,paidCount:paid,pendingCount:pending,
   partialCount:partial,unreviewedCount:unreviewed,
   unreviewedAmount:unreviewedAmount/100
  }
 }
 root.MatosIptuAccounting={detail:detail,summary:summary};
})(window);
