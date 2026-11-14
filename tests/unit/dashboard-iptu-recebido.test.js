import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const js = read('simple-ui.js');
const accountingJs=read('iptu-accounting.js');
const css = read('simple-ui.css');
const index = read('index.html');

const iptuRecords = [
  {id:'i1',ano:2026,situacao:'pago',valor_total:7000.20},
  {id:'i2',ano:2026,situacao:'pago',valor_total:7784},
  {id:'i3',ano:2026,situacao:'em_aberto',valor_total:1819.60},
  {id:'i4',ano:2025,situacao:'pago',valor_total:3000},
  {id:'i5',ano:2025,situacao:'em_aberto',valor_total:500},
];

function sandbox(records=iptuRecords) {
  const dom = new JSDOM('<div id="content"></div>');
  const window = dom.window;
  const goQuick = vi.fn();
  const context = {
    document:window.document,window,goQuick,
    E:(id)=>window.document.getElementById(id),
    money:(n)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),
    esc:(v)=>String(v),
    Date,
  };
  const begin=js.indexOf('// IPTU tem competência ANUAL.');
  const end=js.indexOf('// =====================================================\n// DASHBOARD',begin);
  expect(begin).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(begin);
  vm.runInNewContext(accountingJs,context);
  context.window.MatosIptuAccounting=context.MatosIptuAccounting||context.window.MatosIptuAccounting;
  const helpers=vm.runInNewContext(js.slice(begin,end)+'\n({iptuDashboardTotals,iptuDashboardCard,bindIptuDashboardCard});',context);
  function render() {
    window.document.getElementById('content').innerHTML=helpers.iptuDashboardCard(records);
    helpers.bindIptuDashboardCard(records);
  }
  return {helpers,window,goQuick,render};
}

describe('Dashboard anual — IPTU recebido',()=>{
  it('soma somente IPTUs marcados como pagos no ano selecionado',()=>{
    const {helpers}=sandbox();
    const result=helpers.iptuDashboardTotals(iptuRecords,2026);
    expect(result.received).toBeCloseTo(14784.20,2);
    expect(result.pending).toBeCloseTo(1819.60,2);
    expect(result.total).toBeCloseTo(16603.80,2);
    expect(result.paidCount).toBe(2);
    expect(result.pendingCount).toBe(1);
    expect(result.count).toBe(3);
  });

  it('não inclui IPTU de 2025 nos valores de 2026 nem mistura aluguéis',()=>{
    const {helpers}=sandbox();
    const lastYear=helpers.iptuDashboardTotals(iptuRecords,2025);
    expect(lastYear.received).toBe(3000);
    expect(lastYear.total).toBe(3500);
    expect(helpers.iptuDashboardTotals(iptuRecords,2026).received).toBeCloseTo(14784.20,2);
    expect(js).toContain("dbGet('iptu')");
    expect(js).toContain("iptuDashboardCard(annualIptu)");
    expect(js).toContain('bindIptuDashboardCard(annualIptu)');
    expect(js).toContain('Resumo separado dos aluguéis para evitar dupla contagem.');
  });

  it('exibe card compacto com soma anual, valor recebido, pendente e quantidade',()=>{
    const x=sandbox();
    x.window._dashIptuYear=2026;x.render();
    const el=x.window.document.getElementById('dashIptuReceivedCard');
    expect(el).toBeTruthy();
    expect(el.querySelector('h3').textContent).toBe('IPTU recebido');
    expect(el.textContent).toContain('14.784,20');
    expect(el.textContent).toContain('16.603,80');
    expect(el.textContent).toContain('1.819,60');
    expect(el.textContent).toContain('2 de 3 IPTUs pagos');
    expect(x.window.document.getElementById('dashIptuReceivedYear').value).toBe('2026');
  });

  it('permite mudar o ano sem recarregar o dashboard de aluguéis',()=>{
    const x=sandbox();
    x.window._dashIptuYear=2026;x.render();
    const select=x.window.document.getElementById('dashIptuReceivedYear');
    select.value='2025';
    select.onchange();
    expect(x.window._dashIptuYear).toBe(2025);
    const card=x.window.document.getElementById('dashIptuReceivedCard');
    expect(card.textContent).toContain('3.000,00');
    expect(card.textContent).toContain('3.500,00');
    expect(card.textContent).not.toContain('14.784,20');
    expect(x.goQuick).not.toHaveBeenCalled();
    x.window.document.getElementById('dashIptuOpen').click();
    expect(x.goQuick).toHaveBeenCalledWith('IPTU');
  });

  it('apresenta R$ 0,00 sem registros no ano e usa apenas registros visíveis ao perfil',()=>{
    const x=sandbox([]);
    x.render();
    const card=x.window.document.getElementById('dashIptuReceivedCard');
    expect(card.textContent).toContain('R$\u00a00,00');
    expect(card.textContent).toContain('0 de 0 IPTUs pagos');
    expect(card.querySelector('select').options).toHaveLength(1);
    const totals=x.helpers.iptuDashboardTotals([iptuRecords[0]],2026);
    expect(totals.received).toBe(7000.20);
    expect(totals.total).toBe(7000.20);
  });

  it('adapta-se ao celular e mantém o valor separado da soma de aluguéis',()=>{
    expect(css).toContain('.iptu-received-card');
    expect(css).toContain('.iptu-received-primary');
    expect(css).toContain('@media(max-width:760px)');
    expect(css).toContain('@media(max-width:390px)');
    expect(index).toContain('/simple-ui.js?v=19');
    expect(index).toContain('/simple-ui.css?v=17');
    expect(js).toContain("Promise.all([ledgerData(k),dbGet('manutencoes'),dbGet('iptu')])");
  });
});
