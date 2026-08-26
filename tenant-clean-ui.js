(function(){
'use strict';

function tenantColumns(p){
  if(p==='Imóveis')return [['nome','Imóvel'],['tipo','Tipo'],['endereco','Endereço'],['numero','Número'],['bairro','Bairro'],['cidade','Cidade'],['status','Situação']];
  if(p==='Contratos')return [['data_inicio','Início'],['data_fim','Término'],['dia_vencimento','Vencimento'],['aluguel_atual','Aluguel atual'],['status','Situação']];
  if(p==='Cobranças')return [['competencia','Referência'],['vencimento','Vencimento'],['aluguel','Aluguel'],['outros_encargos','Outros encargos'],['multa','Multa'],['juros','Juros'],['valor_pago','Pago'],['status','Situação']];
  if(p==='IPTU')return [['ano','Ano'],['modalidade','Forma'],['valor_total','Valor'],['situacao','Situação']];
  return [];
}

function tenantCell(k,v){
  if(['aluguel_atual','aluguel','outros_encargos','multa','juros','valor_pago','valor_total'].indexOf(k)>=0)return money(v||0);
  if(k==='status'||k==='situacao')return st(v||'pendente');
  if(k==='data_inicio'||k==='data_fim'||k==='competencia'||k==='vencimento')return dateBR(v);
  return esc(v==null||v===''?'—':v);
}

function tenantIntro(p){
  if(p==='Imóveis')return 'Dados do imóvel vinculado ao seu acesso.';
  if(p==='Contratos')return 'Informações do seu contrato de locação.';
  if(p==='Cobranças')return 'Consulte seu histórico de pagamentos, valores pagos, pendências e próximos vencimentos.';
  if(p==='IPTU')return 'Consulte somente os registros de IPTU e encargos vinculados ao seu imóvel.';
  return '';
}

async function tenantListPage(p){
  var C=E('content'),table=tables[p],cols=tenantColumns(p);
  C.innerHTML='<div class="panel">Carregando seus dados...</div>';
  try{
    var rows=await dbGet(table);
    var head=cols.map(function(c){return '<th>'+esc(c[1])+'</th>'}).join('');
    var body=(rows||[]).map(function(r){return '<tr>'+cols.map(function(c){return '<td>'+tenantCell(c[0],r[c[0]])+'</td>'}).join('')+'</tr>'}).join('');
    C.innerHTML='<div class="panel"><div class="panel-title"><div><h3>'+esc(p==='Cobranças'?'Minhas cobranças':p==='Contratos'?'Meu contrato':p==='Imóveis'?'Meu imóvel':'Meu IPTU e encargos')+'</h3><p class="muted" style="margin:6px 0 0">'+esc(tenantIntro(p))+'</p></div></div><div class="tablewrap" style="margin-top:14px"><table class="table"><thead><tr>'+head+'</tr></thead><tbody>'+(body||'<tr><td colspan="'+cols.length+'" class="empty">Nenhuma informação vinculada ao seu acesso.</td></tr>')+'</tbody></table></div></div>';
  }catch(e){C.innerHTML='<div class="notice err">'+esc(e.message)+'</div>'}
}

var previousModulePage=window.modulePage;
window.modulePage=async function(){
  if(currentRole==='inquilino'&&['Imóveis','Contratos','Cobranças','IPTU'].indexOf(page)>=0)return tenantListPage(page);
  return previousModulePage();
};

})();
