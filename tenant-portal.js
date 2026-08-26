(function(){
'use strict';

tenantMenus.length=0;
['Dashboard','Imóveis','Contratos','Cobranças','IPTU','Manutenção','Documentos'].forEach(function(x){tenantMenus.push(x)});

function tenantId(){return currentProfile&&currentProfile.inquilino_id||null}
function dueStatus(c){
  if(c.status==='pago'||Number(c.valor_pago||0)>=Number(c.aluguel||0)+Number(c.outros_encargos||0))return 'pago';
  if(c.vencimento&&new Date(c.vencimento+'T23:59:59')<new Date())return 'atrasado';
  return 'pendente';
}
function chargeTotal(c){return Number(c.aluguel||0)+Number(c.outros_encargos||0)+Number(c.multa||0)+Number(c.juros||0)}
function tenantChargeRows(rows,limit){
  var arr=(rows||[]).slice().sort(function(a,b){return String(b.vencimento||'').localeCompare(String(a.vencimento||''))});
  if(limit)arr=arr.slice(0,limit);
  return arr.map(function(c){var s=dueStatus(c),total=chargeTotal(c);return '<tr><td>'+dateBR(c.competencia||c.vencimento)+'</td><td>'+dateBR(c.vencimento)+'</td><td>'+money(total)+'</td><td>'+money(c.valor_pago||0)+'</td><td>'+st(s)+'</td></tr>'}).join('');
}

async function tenantDash(){
  var C=E('content');C.innerHTML='<div class="panel">Carregando seus dados...</div>';
  try{
    var sets=await Promise.all(['imoveis','contratos','cobrancas','iptu','manutencoes'].map(dbGet)),im=sets[0]||[],ct=sets[1]||[],cb=sets[2]||[],ip=sets[3]||[],ma=sets[4]||[];
    var hoje=new Date(),pagas=cb.filter(function(c){return dueStatus(c)==='pago'}),abertas=cb.filter(function(c){return dueStatus(c)!=='pago'}),futuras=abertas.filter(function(c){return c.vencimento&&new Date(c.vencimento+'T23:59:59')>=hoje}),atrasadas=abertas.filter(function(c){return dueStatus(c)==='atrasado'}),pendente=abertas.reduce(function(s,c){return s+Math.max(0,chargeTotal(c)-Number(c.valor_pago||0))},0),ipAbertos=ip.filter(function(x){return x.situacao!=='pago'}),ipValor=ipAbertos.reduce(function(s,x){return s+Number(x.valor_total||0)},0),manAberta=ma.filter(function(x){return x.status!=='concluido'&&x.status!=='cancelado'}).length;
    var imovel=im[0],contrato=ct.find(function(x){return x.status==='ativo'})||ct[0];
    var endereco=imovel?[imovel.endereco,imovel.numero,imovel.bairro,imovel.cidade].filter(Boolean).join(', '):'Nenhum imóvel vinculado';
    C.innerHTML='<div class="cards"><div class="card blue"><div class="cl">Meu imóvel</div><div class="num" style="font-size:22px">'+esc(imovel?imovel.nome:'—')+'</div><div class="card-sub">'+esc(endereco)+'</div></div><div class="card greenish"><div class="cl">Pagamentos realizados</div><div class="num">'+pagas.length+'</div><div class="card-sub">Histórico das suas cobranças pagas</div></div><div class="card goldish"><div class="cl">Contas a vencer</div><div class="num">'+futuras.length+'</div><div class="card-sub">'+money(pendente)+' em cobranças abertas</div></div><div class="card redish"><div class="cl">Em atraso</div><div class="num">'+atrasadas.length+'</div><div class="card-sub">Somente cobranças vinculadas a você</div></div><div class="card purpleish"><div class="cl">Manutenções em análise</div><div class="num">'+manAberta+'</div><div class="card-sub">Solicitações abertas ou em andamento</div></div></div>'+
      '<div class="dashgrid"><div class="panel"><div class="panel-title"><h3>Meu contrato</h3></div>'+(contrato?'<div class="mini-fin"><div class="mini-stat"><small>Início</small><b>'+dateBR(contrato.data_inicio)+'</b></div><div class="mini-stat"><small>Término</small><b>'+dateBR(contrato.data_fim)+'</b></div><div class="mini-stat"><small>Vencimento</small><b>Dia '+esc(contrato.dia_vencimento)+'</b></div><div class="mini-stat"><small>Aluguel atual</small><b>'+money(contrato.aluguel_atual)+'</b></div></div>':'<div class="empty">Nenhum contrato vinculado.</div>')+'</div><div class="panel"><div class="panel-title"><h3>IPTU e encargos</h3><button class="linkmini" onclick="goQuick(\'IPTU\')">Ver detalhes →</button></div><div class="mini-fin"><div class="mini-stat"><small>IPTU em aberto</small><b>'+ipAbertos.length+'</b></div><div class="mini-stat"><small>Valor cadastrado</small><b>'+money(ipValor)+'</b></div></div><p class="muted">São exibidos somente encargos relacionados ao imóvel vinculado ao seu acesso.</p></div></div>'+
      '<div class="panel"><div class="panel-title"><h3>Minhas cobranças e pagamentos</h3><button class="linkmini" onclick="goQuick(\'Cobranças\')">Ver histórico completo →</button></div><div class="tablewrap"><table class="table"><thead><tr><th>Referência</th><th>Vencimento</th><th>Total</th><th>Pago</th><th>Situação</th></tr></thead><tbody>'+(tenantChargeRows(cb,10)||'<tr><td colspan="5" class="empty">Nenhuma cobrança vinculada ao seu acesso.</td></tr>')+'</tbody></table></div></div>'+
      '<div class="panel"><div class="panel-title"><h3>Precisa de manutenção?</h3><button class="btn primary" onclick="goQuick(\'Manutenção\')">Solicitar manutenção</button></div><p class="muted">Relate o problema pelo sistema. A administração receberá a solicitação e atualizará o andamento após análise.</p></div>';
  }catch(e){C.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}
}

async function tenantMaintenance(){
  var C=E('content');C.innerHTML='<div class="panel">Carregando suas solicitações...</div>';
  try{
    var sets=await Promise.all([dbGet('imoveis'),dbGet('manutencoes')]),im=sets[0]||[],rows=sets[1]||[],tid=tenantId();
    var opts=im.map(function(x){return '<option value="'+x.id+'">'+esc(x.nome)+'</option>'}).join('');
    var tr=rows.map(function(m){return '<tr><td>'+dateBR(m.data_abertura)+'</td><td>'+esc(m.categoria||'Outro')+'</td><td>'+esc(m.descricao)+'</td><td>'+st(m.status||'aberto')+'</td><td>'+dateBR(m.data_conclusao)+'</td></tr>'}).join('');
    C.innerHTML='<div class="panel" style="margin-bottom:14px"><div class="panel-title"><h3>Solicitar manutenção</h3></div><p class="muted">Descreva o ocorrido com clareza. A prioridade, custos, responsável e decisão sobre o atendimento são definidos pela administração.</p><div class="formgrid"><div class="field"><span class="lbl">Imóvel *</span><select id="tm_imovel" class="inp">'+(opts||'<option value="">Nenhum imóvel vinculado</option>')+'</select></div><div class="field"><span class="lbl">Categoria</span><select id="tm_categoria" class="inp"><option>Hidráulica</option><option>Elétrica</option><option>Estrutural</option><option>Pintura</option><option>Ar-condicionado</option><option>Portas e janelas</option><option>Telhado</option><option selected>Outro</option></select></div><div class="field full"><span class="lbl">O que aconteceu? *</span><textarea id="tm_descricao" class="inp" rows="5" placeholder="Descreva o problema, onde ocorreu e quando percebeu."></textarea></div></div><button id="tm_enviar" class="btn primary" type="button">Enviar solicitação</button><div id="tm_msg" style="margin-top:10px"></div></div><div class="panel"><div class="panel-title"><h3>Minhas solicitações</h3></div><div class="tablewrap"><table class="table"><thead><tr><th>Abertura</th><th>Categoria</th><th>Relato</th><th>Situação</th><th>Conclusão</th></tr></thead><tbody>'+(tr||'<tr><td colspan="5" class="empty">Nenhuma solicitação de manutenção.</td></tr>')+'</tbody></table></div></div>';
    E('tm_enviar').onclick=async function(){var msg=E('tm_msg'),imovel=E('tm_imovel').value,descricao=E('tm_descricao').value.trim();if(!imovel||!tid||descricao.length<5){msg.innerHTML='<div class="notice err">Selecione o imóvel e descreva o ocorrido.</div>';return}msg.innerHTML='<div class="notice">Enviando solicitação...</div>';try{await dbInsert('manutencoes',{imovel_id:imovel,inquilino_id:tid,data_abertura:new Date().toISOString().slice(0,10),categoria:E('tm_categoria').value,descricao:descricao,prioridade:'media',orcamento:0,custo_final:0,status:'aberto'});cache.manutencoes=null;msg.innerHTML='<div class="notice success">Solicitação enviada. Aguarde a análise da administração.</div>';setTimeout(tenantMaintenance,500)}catch(e){msg.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}};
  }catch(e){C.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}
}

var originalDash=window.dash;
window.dash=async function(){if(currentRole==='inquilino')return tenantDash();return originalDash()};

var originalModule=window.modulePage;
window.modulePage=async function(){if(currentRole==='inquilino'&&page==='Manutenção')return tenantMaintenance();return originalModule()};

})();
