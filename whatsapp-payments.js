'use strict';
(function(){
  if (Array.isArray(window.adminMenus) && window.adminMenus.indexOf('Pagamentos WhatsApp') < 0) window.adminMenus.push('Pagamentos WhatsApp');
  var originalLoad = window.load;
  window.load = function(){
    if (window.page === 'Pagamentos WhatsApp') return whatsappPayments();
    return originalLoad.apply(this, arguments);
  };
  function fmtMoney(v){try{return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}catch(e){return 'R$ '+Number(v||0).toFixed(2)}}
  function esc2(s){return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]})}
  function date2(v){if(!v)return '—';var p=String(v).slice(0,10).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:v}
  async function whatsappPayments(){
    if(window.currentRole!=='admin') return window.E('content').innerHTML='<div class="notice err">Acesso restrito ao administrador.</div>';
    var box=window.E('content');
    box.innerHTML='<div class="panel"><div class="toolbar"><div><h3 style="margin:0">Pagamentos recebidos pelo WhatsApp</h3><div class="muted">Comprovantes interpretados automaticamente e conciliados com as cobranças.</div></div><button id="waRefresh" class="btn secondary">Atualizar</button></div></div><div id="waSummary" class="cards"></div><div class="panel"><div class="tablewrap"><table class="table"><thead><tr><th>Recebido</th><th>Inquilino</th><th>Valor</th><th>Pagamento</th><th>Cobrança</th><th>Confiança</th><th>Situação</th><th>Ação</th></tr></thead><tbody id="waRows"><tr><td colspan="8" class="empty">Carregando...</td></tr></tbody></table></div></div><div id="waMsg"></div>';
    window.E('waRefresh').onclick=whatsappPayments;
    var rows=await window.dbGet('whatsapp_pagamentos_recebidos');
    await Promise.all([window.cache.inquilinos?Promise.resolve(window.cache.inquilinos):window.dbGet('inquilinos'),window.cache.cobrancas?Promise.resolve(window.cache.cobrancas):window.dbGet('cobrancas')]);
    rows=rows||[];
    var counts={revisao:0,aprovado:0,erro:0,processando:0};rows.forEach(function(r){counts[r.status]=(counts[r.status]||0)+1});
    window.E('waSummary').innerHTML='<div class="card"><div class="cl">Para revisar</div><div class="num">'+counts.revisao+'</div></div><div class="card"><div class="cl">Aprovados</div><div class="num" style="color:var(--green)">'+counts.aprovado+'</div></div><div class="card"><div class="cl">Processando</div><div class="num">'+counts.processando+'</div></div><div class="card"><div class="cl">Erros</div><div class="num" style="color:var(--red)">'+counts.erro+'</div></div>';
    window.E('waRows').innerHTML=rows.map(function(r){var inq=(window.cache.inquilinos||[]).find(function(x){return x.id===r.inquilino_id}),c=(window.cache.cobrancas||[]).find(function(x){return x.id===r.cobranca_id});var conf=r.confianca==null?'—':Math.round(Number(r.confianca)*100)+'%';var action=r.status==='revisao'&&r.cobranca_id?'<button class="btn primary waApprove" data-id="'+esc2(r.id)+'">Confirmar baixa</button> <button class="btn secondary waReject" data-id="'+esc2(r.id)+'">Rejeitar</button>':'—';return '<tr><td>'+date2(r.recebido_em)+'</td><td>'+esc2(inq?inq.nome:(r.nome_contato||r.telefone||'Não identificado'))+'</td><td>'+fmtMoney(r.valor_extraido)+'</td><td>'+date2(r.data_pagamento_extraida)+'</td><td>'+esc2(c?date2(c.competencia):'Não vinculada')+'</td><td>'+conf+'</td><td><span class="badge '+(r.status==='aprovado'?'green':(r.status==='erro'?'red':'yellow'))+'">'+esc2(r.status)+'</span><div class="muted" style="font-size:11px">'+esc2(r.motivo_status||'')+'</div></td><td>'+action+'</td></tr>'}).join('')||'<tr><td colspan="8" class="empty">Nenhum comprovante recebido.</td></tr>';
    Array.prototype.forEach.call(document.querySelectorAll('.waApprove'),function(b){b.onclick=function(){confirmPayment(b.dataset.id)}});
    Array.prototype.forEach.call(document.querySelectorAll('.waReject'),function(b){b.onclick=async function(){await window.dbUpdate('whatsapp_pagamentos_recebidos',b.dataset.id,{status:'rejeitado',motivo_status:'Rejeitado manualmente pelo administrador'});whatsappPayments()}});
  }
  async function confirmPayment(id){
    var r=(window.cache.whatsapp_pagamentos_recebidos||[]).find(function(x){return x.id===id});
    var rows=await window.dbGet('whatsapp_pagamentos_recebidos');r=(rows||[]).find(function(x){return x.id===id});
    if(!r||!r.cobranca_id)return;
    var c=(window.cache.cobrancas||[]).find(function(x){return x.id===r.cobranca_id});
    if(!c){await window.dbGet('cobrancas');c=(window.cache.cobrancas||[]).find(function(x){return x.id===r.cobranca_id})}
    if(!c)return;
    var val=Number(r.valor_extraido||0);if(!val){alert('O comprovante não possui valor identificado.');return}
    if(!confirm('Confirmar baixa de '+fmtMoney(val)+' para a cobrança de '+date2(c.competencia)+'?'))return;
    await window.dbUpdate('cobrancas',c.id,{valor_pago:val,data_pagamento:r.data_pagamento_extraida||new Date().toISOString().slice(0,10),status:'pago',forma_pagamento:r.forma_pagamento_extraida||'outro',comprovante_path:r.media_path||null,comprovante_nome:r.media_nome||null,comprovante_tipo:r.media_mime_type||null,observacoes:'Baixa confirmada a partir de comprovante recebido pelo WhatsApp.'});
    await window.dbUpdate('whatsapp_pagamentos_recebidos',id,{status:'aprovado',motivo_status:'Confirmado manualmente pelo administrador',processado_em:new Date().toISOString()});
    whatsappPayments();
  }
  window.whatsappPayments=whatsappPayments;
})();
