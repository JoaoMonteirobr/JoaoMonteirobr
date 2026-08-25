(function(){
'use strict';

if(adminMenus.indexOf('Histórico')<0)adminMenus.push('Histórico');

function mesAtual(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function fmtDateTime(v){if(!v)return '—';try{return new Date(v).toLocaleString('pt-BR')}catch(e){return v}}

async function gerarCobrancasMes(){
 var mes=E('gerar_mes')&&E('gerar_mes').value||mesAtual();
 var msg=E('gerar_msg');
 if(!/^\d{4}-\d{2}$/.test(mes)){if(msg)msg.innerHTML='<div class="notice err">Informe um mês válido.</div>';return}
 if(msg)msg.innerHTML='<div class="notice">Gerando cobranças...</div>';
 try{
   var r=await request('/rest/v1/rpc/gerar_cobrancas_mes',{method:'POST',headers:authHeaders(session.access_token),body:JSON.stringify({p_mes:mes+'-01'})});
   cache.cobrancas=null;cache.financeiro=null;
   if(msg)msg.innerHTML='<div class="notice">'+Number(r||0)+' cobrança(s) criada(s). Contratos já lançados no mês foram ignorados.</div>';
   if(page==='Cobranças')setTimeout(function(){load()},700);
 }catch(e){if(msg)msg.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}
}
window.gerarCobrancasMes=gerarCobrancasMes;

var oldModule=window.modulePage;
window.modulePage=async function(){
 await oldModule();
 if(page==='Cobranças'&&currentRole==='admin'){
   var c=E('content');
   if(c)c.insertAdjacentHTML('afterbegin','<div class="panel" style="margin-bottom:14px"><div class="panel-title"><h3>Automação mensal de cobranças</h3></div><p class="muted">Gera uma cobrança para cada contrato ativo no mês selecionado. Cobranças já existentes para o mesmo contrato e mês não são duplicadas.</p><div class="toolbar" style="justify-content:flex-start"><input id="gerar_mes" class="inp" type="month" value="'+mesAtual()+'" style="max-width:190px"><button class="btn primary" type="button" onclick="gerarCobrancasMes()">Gerar cobranças do mês</button></div><div id="gerar_msg"></div></div>');
 }
};

async function historicoPage(){
 var C=E('content');
 C.innerHTML='<div class="panel">Carregando histórico...</div>';
 try{
  var data=await request('/rest/v1/auditoria?select=*&order=criado_em.desc&limit=200',{headers:authHeaders(session.access_token)});
  var rows=(data||[]).map(function(x){var nome=x.tabela||'—',acao=x.acao||'—';return '<tr><td>'+fmtDateTime(x.criado_em)+'</td><td>'+esc(nome)+'</td><td>'+esc(acao)+'</td><td><code>'+esc(x.registro_id||'—')+'</code></td></tr>'}).join('');
  C.innerHTML='<div class="panel"><div class="panel-title"><h3>Histórico de alterações</h3></div><p class="muted">Registro das inclusões, alterações e exclusões realizadas nos principais módulos. Somente o administrador possui acesso.</p><div class="tablewrap"><table class="table"><thead><tr><th>Data e hora</th><th>Módulo</th><th>Ação</th><th>Registro</th></tr></thead><tbody>'+(rows||'<tr><td colspan="4" class="empty">Nenhuma alteração registrada ainda.</td></tr>')+'</tbody></table></div></div>';
 }catch(e){C.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}
}

var oldLoad=window.load;
window.load=async function(){if(page==='Histórico')return historicoPage();return oldLoad()};

var oldDash=window.dash;
window.dash=async function(){
 await oldDash();
 if(currentRole==='admin'){
   var C=E('content');
   if(C)C.insertAdjacentHTML('afterbegin','<div class="notice" style="margin-bottom:14px"><b>Fluxo automatizado ativo:</b> contratos ativos podem gerar as cobranças mensais em lote. Ao marcar uma cobrança como paga, a entrada correspondente é sincronizada automaticamente no Financeiro. Todas as alterações relevantes passam a ser registradas no Histórico.</div>');
 }
};
})();
