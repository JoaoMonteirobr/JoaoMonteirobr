(function(){
'use strict';

var monetaryFields=['aluguel_base','iptu_mensal','condominio','aluguel_atual','valor_garantia','aluguel','outros_encargos','valor_pago','multa','juros','orcamento','custo_final','valor_cota_unica','valor_parcela','valor_total','entrada','saida'];
var singularNames={'Proprietários':'Proprietário','Imóveis':'Imóvel','Inquilinos':'Inquilino','Contratos':'Contrato','Cobranças':'Cobrança','IPTU':'IPTU','Financeiro':'Lançamento financeiro','Manutenção':'Manutenção'};
var optionLabels={
 'a_vista':'À vista','em_aberto':'Em aberto','manutencao':'Manutenção','media':'Média','aguardando terceiro':'Aguardando terceiro',
 'em andamento':'Em andamento','concluido':'Concluído','cancelado':'Cancelado','ativo':'Ativo','inativo':'Inativo','ocupado':'Ocupado','vago':'Vago',
 'encerrado':'Encerrado','futuro':'Futuro','pago':'Pago','pendente':'Pendente','atrasado':'Atrasado','aberto':'Aberto','parcelado':'Parcelado',
 'receita':'Receita','despesa':'Despesa','repasse':'Repasse','ajuste':'Ajuste','baixa':'Baixa','alta':'Alta','urgente':'Urgente'
};

function isMoneyField(k){return monetaryFields.indexOf(k)>=0}
function brl(v){var n=Number(v||0);return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function parseBRL(v){
 if(v==null||v==='')return null;
 var s=String(v).trim().replace(/R\$/g,'').replace(/\s/g,'');
 if(s.indexOf(',')>=0)s=s.replace(/\./g,'').replace(',','.');
 else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
 var n=Number(s.replace(/[^0-9.-]/g,''));
 return isNaN(n)?null:n;
}
function maskMoneyInput(el){
 var digits=String(el.value||'').replace(/\D/g,'');
 var n=digits?Number(digits)/100:0;
 el.value=n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}
function humanOption(v){return optionLabels[v]||String(v||'').replace(/_/g,' ').replace(/^./,function(c){return c.toUpperCase()})}
function singular(p){return singularNames[p]||p}

window.modulePage=async function(){
 var t=tables[page];
 if(page==='IPTU'&&!cache.imoveis)await dbGet('imoveis');
 var rows=await dbGet(t),cols=columnsFor(page);
 var createBtn=currentRole==='admin'?'<button id="newrec" class="btn primary">+ Cadastrar '+esc(singular(page))+'</button>':'';
 E('content').innerHTML='<div class="panel"><div class="toolbar"><input id="search" class="inp search" placeholder="Pesquisar registros...">'+createBtn+'</div><div id="tbl">'+tableHtml(rows,cols)+'</div></div>';
 E('search').oninput=function(ev){var q=ev.target.value.toLowerCase(),r=rows.filter(function(x){return Object.keys(x).some(function(k){return String(x[k]==null?'':x[k]).toLowerCase().indexOf(q)>=0})});E('tbl').innerHTML=tableHtml(r,cols);bindRowActions(t)};
 if(E('newrec'))E('newrec').onclick=function(){openForm(page,null)};
 bindRowActions(t);
};

window.openForm=async function(p,row){
 if(currentRole!=='admin')return;
 await ensureLookups();
 var fields=forms[p],id=row&&row.id||null,body='<div id="formmsg"></div><div class="formgrid">';
 fields.forEach(function(f){
   var k=f[0],lab=f[1],type=f[2]||'text',req=f[3],v=row&&row[k]!=null?row[k]:'';
   body+='<div class="field '+(type==='textarea'?'full':'')+'"><span class="lbl">'+esc(lab)+(req?' *':'')+'</span>';
   if(type==='textarea') body+='<textarea id="f_'+k+'" class="inp">'+esc(v)+'</textarea>';
   else if(type.indexOf('select:')===0){
     var vals=type.slice(7).split('|');
     body+='<select id="f_'+k+'" class="inp"><option value="">Selecione</option>'+vals.map(function(x){return '<option value="'+esc(x)+'" '+(String(v)===String(x)?'selected':'')+'>'+esc(humanOption(x))+'</option>'}).join('')+'</select>';
   } else if(type.indexOf('lookup:')===0){
     var lt=type.slice(7),arr=cache[lt]||[];
     body+='<select id="f_'+k+'" class="inp"><option value="">Selecione</option>'+arr.map(function(x){return '<option value="'+x.id+'" '+(String(v)===String(x.id)?'selected':'')+'>'+esc(lookupLabel(lt,x))+'</option>'}).join('')+'</select>';
   } else if(type==='boolean'){
     body+='<select id="f_'+k+'" class="inp"><option value="true" '+(v===true?'selected':'')+'>Sim</option><option value="false" '+(v===false?'selected':'')+'>Não</option></select>';
   } else if(isMoneyField(k)){
     body+='<input id="f_'+k+'" class="inp money-input" inputmode="decimal" autocomplete="off" value="'+esc(v===''?'':brl(v))+'">';
     body+='<small>Valor em reais (R$).</small>';
   } else if(k==='cep'){
     body+='<div style="display:flex;gap:8px"><input id="f_cep" class="inp" inputmode="numeric" maxlength="9" value="'+esc(v)+'" placeholder="00000-000"><button id="buscar_cep" type="button" class="btn secondary" style="white-space:nowrap">Buscar CEP</button></div><small id="cep_status">Digite o CEP para preencher o endereço automaticamente.</small>';
   } else body+='<input id="f_'+k+'" class="inp" type="'+type+'" value="'+esc(v)+'">';
   body+='</div>';
 });
 body+='</div>';
 document.body.insertAdjacentHTML('beforeend','<div class="modalbg" id="modal"><div class="modal"><div class="modalhead"><h2>'+(id?'Editar ':'Cadastrar ')+esc(singular(p))+'</h2><button id="closemodal" class="close">×</button></div><div class="modalbody">'+body+'</div><div class="modalfoot"><button id="cancelmodal" class="btn secondary">Cancelar</button><button id="savemodal" class="btn primary">Salvar</button></div></div></div>');
 E('closemodal').onclick=E('cancelmodal').onclick=function(){E('modal').remove()};
 E('savemodal').onclick=function(){saveForm(p,id)};
 Array.prototype.forEach.call(document.querySelectorAll('.money-input'),function(el){el.addEventListener('input',function(){maskMoneyInput(el)});el.addEventListener('focus',function(){if(el.value==='R$ 0,00'||el.value==='R$ 0,00')el.select()})});
 if(E('f_cep')){
   E('f_cep').addEventListener('input',function(){var d=this.value.replace(/\D/g,'').slice(0,8);this.value=d.length>5?d.slice(0,5)+'-'+d.slice(5):d});
   E('f_cep').addEventListener('blur',function(){if(this.value.replace(/\D/g,'').length===8)buscarCEP()});
   if(E('buscar_cep'))E('buscar_cep').onclick=buscarCEP;
 }
};

async function buscarCEP(){
 var el=E('f_cep'),status=E('cep_status');if(!el)return;
 var cep=el.value.replace(/\D/g,'');
 if(cep.length!==8){if(status)status.textContent='Informe um CEP com 8 dígitos.';return}
 try{
   if(status)status.textContent='Buscando endereço...';
   var res=await fetch('https://viacep.com.br/ws/'+cep+'/json/');
   if(!res.ok)throw new Error('Falha na consulta');
   var d=await res.json();
   if(d.erro)throw new Error('CEP não encontrado');
   if(E('f_endereco'))E('f_endereco').value=d.logradouro||'';
   if(E('f_bairro'))E('f_bairro').value=d.bairro||'';
   if(E('f_cidade'))E('f_cidade').value=d.localidade||'';
   if(E('f_complemento')&&!E('f_complemento').value&&d.complemento)E('f_complemento').value=d.complemento;
   if(status)status.textContent='Endereço encontrado'+(d.uf?' — '+d.localidade+'/'+d.uf:'')+'. Confira os dados e informe o número.';
   if(E('f_numero'))E('f_numero').focus();
 }catch(e){if(status)status.textContent='Não foi possível localizar o CEP. Você pode preencher o endereço manualmente.'}
}
window.buscarCEP=buscarCEP;

window.saveForm=async function(p,id){
 if(currentRole!=='admin')return;
 var fields=forms[p],obj={},msg=E('formmsg');
 for(var i=0;i<fields.length;i++){
   var f=fields[i],k=f[0],lab=f[1],type=f[2]||'text',req=f[3],el=E('f_'+k),v=el.value;
   if(req&&!v){msg.innerHTML='<div class="notice err">Preencha o campo: '+esc(lab)+'.</div>';return}
   if(isMoneyField(k))v=parseBRL(v);
   else if(type==='number')v=v===''?null:Number(String(v).replace(',','.'));
   else if(type==='boolean')v=v==='true';
   else if(v==='')v=null;
   obj[k]=v;
 }
 if(p==='IPTU'){
   var mod=obj.modalidade||'a_vista';
   if(mod==='parcelado'){
     obj.numero_parcelas=Math.max(1,Number(obj.numero_parcelas||1));obj.valor_parcela=Number(obj.valor_parcela||0);obj.valor_total=obj.numero_parcelas*obj.valor_parcela;
   }else{
     obj.numero_parcelas=1;obj.valor_cota_unica=Number(obj.valor_cota_unica||obj.valor_total||0);obj.valor_total=obj.valor_cota_unica;obj.valor_parcela=0;
   }
   if(obj.situacao==='pago'&&!obj.data_pagamento)obj.data_pagamento=new Date().toISOString().slice(0,10);
   if(obj.situacao==='em_aberto')obj.data_pagamento=null;
 }
 if(p==='Cobranças'){
   var hoje=new Date(),venc=obj.vencimento?new Date(obj.vencimento+'T23:59:59'):null,base=Number(obj.aluguel||0)+Number(obj.outros_encargos||0),pago=Number(obj.valor_pago||0),atrasado=venc&&hoje>venc&&pago<base;
   if(!atrasado){obj.multa=0;obj.juros=0;if(pago>=base&&base>0)obj.status='pago';else if(obj.status==='atrasado')obj.status='pendente'}
   else{var dias=Math.max(1,Math.floor((hoje-venc)/86400000));obj.multa=base*.10;obj.juros=base*.01*(dias/30);if(obj.status!=='pago')obj.status='atrasado'}
 }
 msg.innerHTML='<div class="notice">Salvando cadastro...</div>';
 try{var t=tables[p];if(id)await dbUpdate(t,id,obj);else await dbInsert(t,obj);E('modal').remove();cache[t]=null;load()}catch(e){msg.innerHTML='<div class="notice err">Não foi possível salvar: '+esc(e.message)+'</div>'}
};
})();
