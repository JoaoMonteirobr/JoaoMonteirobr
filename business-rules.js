(function(){
'use strict';

function parseBRL(v){if(v==null||v==='')return 0;var s=String(v).replace(/R\$/g,'').replace(/\s/g,'');if(s.indexOf(',')>=0)s=s.replace(/\./g,'').replace(',','.');var n=Number(s.replace(/[^0-9.-]/g,''));return isNaN(n)?0:n}
function mesAno(v){if(!v)return '—';var p=String(v).slice(0,7).split('-');return p.length===2?p[1]+'/'+p[0]:v}
function nomeLookup(table,id){var r=(cache[table]||[]).find(function(x){return x.id===id});return r?(r.nome||r.email||r.id):'—'}

forms['Cobranças']=[
 ['inquilino_id','Inquilino','lookup:inquilinos'],
 ['imovel_id','Imóvel','lookup:imoveis'],
 ['competencia','Mês de referência','date',1],
 ['vencimento','Data de vencimento','date',1],
 ['aluguel','Valor do aluguel','number',1],
 ['outros_encargos','Outros encargos','number'],
 ['valor_pago','Valor pago','number'],
 ['data_pagamento','Data do pagamento','date'],
 ['forma_pagamento','Forma de pagamento','select:pix|dinheiro|cartao_credito|cartao_debito|transferencia|boleto|outro'],
 ['multa','Multa por atraso','number'],
 ['juros','Juros por atraso','number'],
 ['status','Situação','select:pago|pendente|atrasado'],
 ['comprovante_path','Comprovante','hidden'],
 ['comprovante_nome','Nome do comprovante','hidden'],
 ['comprovante_tipo','Tipo do comprovante','hidden'],
 ['observacoes','Observações','textarea']
];

forms['Financeiro']=[
 ['imovel_id','Imóvel','lookup:imoveis'],
 ['contrato_id','Contrato (opcional)','lookup:contratos'],
 ['data','Data do lançamento','date',1],
 ['competencia','Mês de referência','date'],
 ['tipo','Tipo','select:receita|despesa|repasse|ajuste',1],
 ['categoria','Categoria','select:Aluguel|Condomínio|IPTU|Água|Energia|Manutenção|Seguro|Imposto|Taxa bancária|Multa/Juros|Repasse|Outros'],
 ['descricao','Descrição'],
 ['entrada','Valor de entrada','number'],
 ['saida','Valor de saída','number'],
 ['forma_pagamento','Forma de pagamento','select:pix|dinheiro|cartao_credito|cartao_debito|transferencia|boleto|outro'],
 ['pago','Pago/efetivado?','boolean'],
 ['comprovante_path','Comprovante','hidden'],
 ['comprovante_nome','Nome do comprovante','hidden'],
 ['comprovante_tipo','Tipo do comprovante','hidden'],
 ['observacoes','Observações','textarea']
];

var oldColumns=window.columnsFor;
window.columnsFor=function(p){
 if(p==='Cobranças')return [['inquilino_id','Inquilino'],['imovel_id','Imóvel'],['competencia','Mês de referência'],['vencimento','Vencimento'],['aluguel','Aluguel'],['valor_pago','Pago'],['forma_pagamento','Pagamento'],['comprovante_path','Comprovante'],['status','Situação']];
 if(p==='Financeiro')return [['data','Data'],['competencia','Mês de referência'],['tipo','Tipo'],['categoria','Categoria'],['descricao','Descrição'],['entrada','Entrada'],['saida','Saída'],['forma_pagamento','Pagamento'],['comprovante_path','Comprovante']];
 return oldColumns(p);
};

var oldFormat=window.formatCell;
window.formatCell=function(k,v){
 if(k==='inquilino_id')return esc(nomeLookup('inquilinos',v));
 if(k==='imovel_id')return esc(nomeLookup('imoveis',v));
 if(k==='competencia')return esc(mesAno(v));
 return oldFormat(k,v);
};

var oldModule=window.modulePage;
window.modulePage=async function(){
 await oldModule();
 if(page==='Cobranças'){
   var p=E('content');if(p)p.insertAdjacentHTML('afterbegin','<div class="notice" style="margin-bottom:14px"><b>Como lançar uma cobrança:</b> selecione o inquilino ou o imóvel. Se existir contrato ativo correspondente, o sistema faz esse vínculo automaticamente. O “Mês de referência” indica a qual mês o aluguel pertence. Forma de pagamento e comprovante são opcionais.</div>');
 }
 if(page==='Financeiro'){
   var f=E('content');if(f)f.insertAdjacentHTML('afterbegin','<div class="notice" style="margin-bottom:14px"><b>Financeiro:</b> registra o fluxo de dinheiro da gestão — entradas, despesas, repasses ao proprietário, manutenção, impostos, taxas e ajustes. “Data do lançamento” é quando o dinheiro entrou/saiu; “Mês de referência” é o período ao qual esse valor pertence. Você também pode registrar a forma de pagamento e anexar comprovante.</div>');
 }
};

var oldSave=window.saveForm;
window.saveForm=async function(p,id){
 if(p!=='Cobranças')return oldSave(p,id);
 if(currentRole!=='admin')return;
 var msg=E('formmsg'),inq=E('f_inquilino_id').value||null,imo=E('f_imovel_id').value||null;
 if(!inq&&!imo){msg.innerHTML='<div class="notice err">Selecione pelo menos um inquilino ou um imóvel.</div>';return}
 var competencia=E('f_competencia').value,vencimento=E('f_vencimento').value,aluguel=parseBRL(E('f_aluguel').value);
 if(!competencia||!vencimento||!aluguel){msg.innerHTML='<div class="notice err">Informe mês de referência, vencimento e valor do aluguel.</div>';return}
 var contratos=cache.contratos||[];
 var contrato=contratos.find(function(c){return c.status==='ativo'&&(!inq||c.inquilino_id===inq)&&(!imo||c.imovel_id===imo)});
 if(!contrato&&inq)contrato=contratos.find(function(c){return c.status==='ativo'&&c.inquilino_id===inq});
 if(!contrato&&imo)contrato=contratos.find(function(c){return c.status==='ativo'&&c.imovel_id===imo});
 if(contrato){if(!inq)inq=contrato.inquilino_id;if(!imo)imo=contrato.imovel_id}
 var obj={
   inquilino_id:inq,imovel_id:imo,contrato_id:contrato?contrato.id:null,
   competencia:competencia,vencimento:vencimento,
   aluguel:aluguel,outros_encargos:parseBRL(E('f_outros_encargos').value),valor_pago:parseBRL(E('f_valor_pago').value),
   data_pagamento:E('f_data_pagamento').value||null,forma_pagamento:E('f_forma_pagamento').value||null,
   multa:0,juros:0,status:E('f_status').value||'pendente',
   comprovante_path:E('f_comprovante_path').value||null,comprovante_nome:E('f_comprovante_nome').value||null,comprovante_tipo:E('f_comprovante_tipo').value||null,
   observacoes:E('f_observacoes').value||null
 };
 var hoje=new Date(),venc=new Date(vencimento+'T23:59:59'),base=obj.aluguel+obj.outros_encargos,pago=obj.valor_pago,atrasado=hoje>venc&&pago<base;
 if(atrasado){var dias=Math.max(1,Math.floor((hoje-venc)/86400000));obj.multa=base*.10;obj.juros=base*.01*(dias/30);if(obj.status!=='pago')obj.status='atrasado'}
 else{obj.multa=0;obj.juros=0;if(pago>=base&&base>0)obj.status='pago';else if(obj.status==='atrasado')obj.status='pendente'}
 msg.innerHTML='<div class="notice">Salvando cobrança...</div>';
 try{if(id)await dbUpdate('cobrancas',id,obj);else await dbInsert('cobrancas',obj);E('modal').remove();cache.cobrancas=null;load()}catch(e){msg.innerHTML='<div class="notice err">Não foi possível salvar: '+esc(e.message)+'</div>'}
};

})();
