import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const read=(file)=>fs.readFileSync(path.join(process.cwd(),file),'utf8');
const app=read('app2.js');
const ui=read('iptu-annual.js');
const accounting=read('iptu-accounting.js');
const fields=[
 ['imovel_id','Imóvel','text',true],
 ['ano','Ano de referência','number',true],
 ['valor_total','Valor anual do IPTU','number',true],
 ['situacao','Situação','text',true],
 ['modalidade','Forma de pagamento','text',true],
 ['numero_parcelas','Número de parcelas','number'],
 ['parcelas_pagas','Quantas parcelas foram pagas?','number'],
 ['valor_parcela','Valor de cada parcela','number'],
 ['data_pagamento','Data do pagamento','date'],
 ['observacoes','Observações','textarea'],
];
function context(overrides={}){
 const dom=new JSDOM('<div id="modal"><div id="formmsg"></div><section id="fields"></section></div>');
 const doc=dom.window.document;
 for(const [key,_,type] of fields){
  let div=doc.createElement('div');div.className='field';
  let input=doc.createElement('input');input.id='f_'+key;input.type=type==='number'?'number':type==='date'?'date':'text';
  input.value=String(overrides[key]??'');
  div.appendChild(input);doc.getElementById('fields').appendChild(div);
 }
 // Form UI requires select elements with options
 for(const [id,opts] of [
  ['f_modalidade',['a_vista','parcelado']],
  ['f_situacao',['pago','em_aberto']]
 ]){
  const old=doc.getElementById(id),sel=doc.createElement('select');sel.id=id;
  for(const option of opts){const o=doc.createElement('option');o.value=option;o.textContent=option;sel.appendChild(o)}
  old.replaceWith(sel);sel.value=overrides[id.slice(2)]||opts[0];
 }
 const updated=vi.fn(async()=>{}),inserted=vi.fn(async()=>{}),load=vi.fn();
 const ctx={
  window:null,document:doc,forms:{IPTU:fields},tables:{IPTU:'iptu'},
  cache:{iptu:[{id:'iptu-old',data_pagamento:'2026-05-20'}]},
  currentRole:'admin',E:(id)=>doc.getElementById(id),dbUpdate:updated,dbInsert:inserted,load,
  esc:(v)=>String(v??''),money:(v)=>'R$ '+Number(v).toFixed(2),
  Date,
 };
 ctx.window=ctx;vm.runInNewContext(accounting,ctx);
 const start=app.indexOf('async function saveForm(p,id){');
 const end=app.indexOf('async function removeRecord(',start);
 if(start<0||end<0)throw Error('saveForm not found');
 ctx.saveForm=vm.runInNewContext(app.slice(start,end)+'\nsaveForm;',ctx);
 const uBegin=ui.indexOf('function configureIptuInstallments(row){');
 const uEnd=ui.indexOf('// Não permitir novo lançamento anual',uBegin);
 ctx.configure=vm.runInNewContext(ui.slice(uBegin,uEnd)+'\nconfigureIptuInstallments;',ctx);
 return {doc,ctx,updated,inserted,load,E:ctx.E};
}
describe('Formulário de IPTU parcelado e à vista',()=>{
 it('oculta a data e calcula recebimento parcial ao informar 3 de 4',()=>{
  const x=context({modalidade:'parcelado',situacao:'em_aberto',numero_parcelas:4,
   parcelas_pagas:3,valor_parcela:156.25,valor_total:625,data_pagamento:'2026-05-20'});
  x.ctx.configure({id:'iptu-old'});
  expect(x.E('f_data_pagamento').closest('.field').style.display).toBe('none');
  expect(x.E('f_situacao').disabled).toBe(true);
  expect(x.E('f_situacao').value).toBe('em_aberto');
  expect(x.E('iptu_installment_preview').textContent).toContain('R$ 468.75');
  expect(x.E('iptu_installment_preview').textContent).toContain('R$ 156.25');
  expect(x.E('f_valor_total').readOnly).toBe(true);
  x.E('f_parcelas_pagas').value='4';
  x.E('f_parcelas_pagas').dispatchEvent(new x.doc.defaultView.Event('input'));
  expect(x.E('f_situacao').value).toBe('pago');
 });
 it('salva três parcelas quitadas com situação pendente e preserva a data histórica',async()=>{
  const x=context({imovel_id:'test',ano:2026,modalidade:'parcelado',situacao:'pago',
   numero_parcelas:4,parcelas_pagas:3,valor_parcela:156.25,valor_total:625});
  await x.ctx.saveForm('IPTU','iptu-old');
  expect(x.updated).toHaveBeenCalledOnce();
  const obj=x.updated.mock.calls[0][2];
  expect(obj.parcelas_pagas).toBe(3);
  expect(obj.situacao).toBe('em_aberto');
  expect(obj.valor_total).toBe(625);
  expect(obj.data_pagamento).toBe('2026-05-20');
 });
 it('marca quitado automaticamente quando todas as parcelas são pagas',async()=>{
  const x=context({imovel_id:'test',ano:2026,modalidade:'parcelado',situacao:'em_aberto',
   numero_parcelas:4,parcelas_pagas:4,valor_parcela:156.25,valor_total:625});
  await x.ctx.saveForm('IPTU',null);
  expect(x.inserted).toHaveBeenCalledOnce();
  const obj=x.inserted.mock.calls[0][1];
  expect(obj.situacao).toBe('pago');expect(obj.parcelas_pagas).toBe(4);
  expect(obj.data_pagamento).toBeNull();
 });
 it('não inventa data de pagamento à vista quando não preenchida',async()=>{
  const x=context({imovel_id:'test',ano:2026,modalidade:'a_vista',situacao:'pago',
   valor_total:500,data_pagamento:''});
  x.ctx.configure(null);
  expect(x.E('f_data_pagamento').closest('.field').style.display).toBe('');
  expect(x.E('f_data_pagamento').required).toBe(false);
  await x.ctx.saveForm('IPTU',null);
  expect(x.inserted).toHaveBeenCalledOnce();
  const obj=x.inserted.mock.calls[0][1];
  expect(obj.data_pagamento).toBeNull();
  expect(obj.valor_total).toBe(500);
  expect(obj.parcelas_pagas).toBeNull();
 });
 it('impede mais parcelas pagas que o total contratado',async()=>{
  const x=context({imovel_id:'test',ano:2026,modalidade:'parcelado',situacao:'pago',
   numero_parcelas:4,parcelas_pagas:5,valor_parcela:156.25,valor_total:625});
  await x.ctx.saveForm('IPTU','iptu-old');
  expect(x.updated).not.toHaveBeenCalled();
  expect(x.E('formmsg').textContent).toContain('entre zero e o total');
 });
 it('mantém quantidades pendentes antigas como não conferidas em vez de zero',async()=>{
  const x=context({imovel_id:'test',ano:2026,modalidade:'parcelado',situacao:'em_aberto',
   numero_parcelas:4,parcelas_pagas:'',valor_parcela:156.25,valor_total:625});
  await x.ctx.saveForm('IPTU','iptu-old');
  expect(x.updated).toHaveBeenCalledOnce();
  expect(x.updated.mock.calls[0][2].parcelas_pagas).toBeNull();
 });
});
