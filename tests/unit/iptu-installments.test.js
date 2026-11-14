import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const read=(p)=>fs.readFileSync(path.join(process.cwd(),p),'utf8');
const accounting=read('iptu-accounting.js');
const iptu=read('iptu-annual.js');
const core=read('app2.js');
const dashboard=read('simple-ui.js');
const sql=read('supabase/migrations/20261113_iptu_parcelas_pagas.sql');
const scope={window:{}};
vm.runInNewContext(accounting,scope);
const {detail,summary}=scope.window.MatosIptuAccounting;

const sample=[
 {id:'avista-pago',ano:2026,modalidade:'a_vista',numero_parcelas:1,valor_total:625,
  situacao:'pago',data_pagamento:null},
 {id:'parcelado-parcial',ano:2026,modalidade:'parcelado',numero_parcelas:4,valor_parcela:1219.8,
  valor_total:4879.2,parcelas_pagas:3,situacao:'em_aberto'},
 {id:'parcelado-incerto',ano:2026,modalidade:'parcelado',numero_parcelas:4,valor_parcela:454.9,
  valor_total:1819.6,parcelas_pagas:null,situacao:'em_aberto'},
 {id:'parcelado-pago-legado',ano:2026,modalidade:'parcelado',numero_parcelas:4,valor_parcela:909.77,
  valor_total:3639.08,parcelas_pagas:null,situacao:'pago'},
 {id:'outro-ano',ano:2025,modalidade:'a_vista',valor_total:100,situacao:'pago'}
];

describe('IPTU anual com parcelas efetivamente quitadas',()=>{
 it('contabiliza 3 de 4 parcelas e deixa última pendente',()=>{
  const d=detail(sample[1]);
  expect(d.received).toBe(3659.4);
  expect(d.pending).toBeCloseTo(1219.8,2);
  expect(d.progress).toBe('3 de 4');
  expect(d.partial).toBe(true);
  expect(d.paid).toBe(false)
 });
 it('inclui integralmente os quitados antigos e os à vista sem exigir data',()=>{
  expect(detail(sample[0]).received).toBe(625);
  expect(detail(sample[3]).received).toBe(3639.08);
  expect(detail(sample[3]).installmentsPaid).toBe(4);
  expect(detail(sample[0]).needsReview).toBe(false)
 });
 it('nunca inventa recebimentos nos parcelados pendentes sem contagem confirmada',()=>{
  const d=detail(sample[2]);
  expect(d.received).toBe(0);
  expect(d.pending).toBe(1819.6);
  expect(d.needsReview).toBe(true);
  expect(d.progress).toBe('A conferir')
 });
 it('concilia valores em centavos e isola a competência anual',()=>{
  const s=summary(sample,2026);
  expect(s.total).toBeCloseTo(10962.88,2);
  expect(s.received).toBeCloseTo(7923.48,2);
  expect(s.pending).toBeCloseTo(3039.4,2);
  expect(s.paidCount).toBe(2);
  expect(s.partialCount).toBe(1);
  expect(s.unreviewedCount).toBe(1);
  expect(s.unreviewedAmount).toBe(1819.6);
  expect(summary(sample,2025).received).toBe(100);
 });
 it('usa o valor total na última parcela para eliminar diferenças de arredondamento',()=>{
  const r={modalidade:'parcelado',valor_total:100,valor_parcela:33.33,numero_parcelas:3,parcelas_pagas:2,situacao:'em_aberto'};
  expect(detail(r).received).toBe(66.66);
  expect(detail(r).pending).toBe(33.34);
  r.parcelas_pagas=3;r.situacao='pago';
  expect(detail(r).received).toBe(100);
  expect(detail(r).pending).toBe(0);
 });
 it('preserva os dados históricos sem presumir parcelas para observações ambíguas',()=>{
  expect(sql).toContain('ADD COLUMN IF NOT EXISTS parcelas_pagas');
  expect(sql).toContain("situacao = 'pago'");
  expect(sql).toContain('TENHO APENAS 3 COMPROVANTES');
  expect(sql).not.toContain('TRUNCATE');
  expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.iptu/i);
  expect(sql).toContain('iptu_parcelas_pagas_quantidade_valida');
  expect(sql).toContain('iptu_parcelas_pagas_situacao_coerente');
 });
 it('mostra campo parcelas pagas e deixa a data opcional somente no fluxo à vista',()=>{
  expect(iptu).toContain("['parcelas_pagas','Quantas parcelas foram pagas?','number']");
  expect(iptu).toContain("dateField.style.display=parcelado?'none':''");
  expect(iptu).toContain('date.required=false');
  expect(iptu).toContain("status.disabled=parcelado");
  expect(iptu).toContain("if(!row&&paid.value==='')paid.value='0'");
  expect(core).toContain("obj.situacao=pagas===numero?'pago':'em_aberto'");
  expect(core).toContain("if(!id&&pagas==null)");
  expect(core).toContain("obj.parcelas_pagas=null");
  expect(core).not.toContain("if(obj.situacao==='pago'&&!obj.data_pagamento)");
 });
 it('usa o mesmo cálculo na tabela, relatórios e dashboard',()=>{
  expect(iptu).toContain('window.MatosIptuAccounting.detail(row)');
  expect(iptu).toContain('window.MatosIptuAccounting.summary(r,year)');
  expect(iptu).toContain('Parcelas pagas</th><th>Recebido</th><th>Pendente');
  expect(dashboard).toContain('window.MatosIptuAccounting.summary(records,year)');
  expect(dashboard).toContain('summary.partialCount');
  expect(dashboard).toContain('summary.unreviewedCount');
 });
});
