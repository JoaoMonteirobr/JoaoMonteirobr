import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const read = (name) => fs.readFileSync(path.join(process.cwd(), name), 'utf8');
const accounting = read('iptu-accounting.js');
const report = read('iptu-situation-report.js');
const html = read('index.html');

const properties = [
  { id: 'a', nome: 'Loja A' },
  { id: 'b', nome: 'Apartamento B' },
  { id: 'c', nome: 'Galpão C' },
  { id: 'd', nome: 'Loja <script> D' },
];
const rows = [
  { id: '1', imovel_id: 'a', ano: 2026, modalidade: 'parcelado', valor_total: 4879.2, numero_parcelas: 4, parcelas_pagas: 3, valor_parcela: 1219.8, situacao: 'em_aberto' },
  { id: '2', imovel_id: 'b', ano: 2026, modalidade: 'a_vista', valor_total: 625, situacao: 'pago' },
  { id: '3', imovel_id: 'c', ano: 2026, modalidade: 'a_vista', valor_total: 1000, situacao: 'em_aberto' },
  { id: '4', imovel_id: 'd', ano: 2026, modalidade: 'parcelado', valor_total: 500, numero_parcelas: 5, valor_parcela: 100, parcelas_pagas: null, situacao: 'em_aberto' },
  { id: '5', imovel_id: 'b', ano: 2025, modalidade: 'a_vista', valor_total: 333, situacao: 'pago' },
];
function context(options = {}) {
  const dom = new JSDOM('<div id="content"></div>');
  const root = { modulePage: async () => {} };
  const env = { window: root, document: dom.window.document, page: 'IPTU',
    cache: { iptu: [...rows], imoveis: properties },
    dbGet: async (name) => name === 'iptu' ? rows : properties };
  vm.runInNewContext(accounting, env);
  vm.runInNewContext(report, env);
  Object.assign(env, options);
  return { dom, env, root, api: root.MatosIptuSituationReport };
}

describe('relatório de situação do IPTU', () => {
  it('reaproveita cálculo anual, separa saldo certo de valores não conferidos', () => {
    const { api } = context();
    const snapshot = JSON.stringify(rows);
    const m = api.build(rows, properties, 2026, 'todos');
    expect(m.items).toHaveLength(4);
    expect(m.total).toBeCloseTo(7004.2, 2);
    expect(m.received).toBeCloseTo(4284.4, 2);
    expect(m.pending).toBeCloseTo(2219.8, 2);
    expect(m.reviewBase).toBe(500);
    expect(m.count).toEqual({ quitado: 1, parcial: 1, pendente: 1, conferir: 1 });
    expect(m.items.find((r) => r.id === '1').detail.pending).toBeCloseTo(1219.8, 2);
    expect(m.items.find((r) => r.id === '1').label).toBe('Parcialmente pago');
    expect(api.parcelas(m.items.find((r) => r.id === '1'))).toContain('faltam 1');
    expect(api.parcelas(m.items.find((r) => r.id === '4'))).toBe('A conferir');
    expect(JSON.stringify(rows)).toBe(snapshot);
  });

  it('filtra por ano, quitados e pendentes sem tratar revisão como quitação', () => {
    const { api } = context();
    expect(api.build(rows, properties, 2026, 'pagos').items.map((x) => x.id)).toEqual(['2']);
    expect(api.build(rows, properties, 2026, 'pendentes').items.map((x) => x.id)).toEqual(['1', '3', '4']);
    expect(api.build(rows, properties, 2025, 'todos').items.map((x) => x.id)).toEqual(['5']);
    expect(api.build(rows, properties, 2024, 'todos').items).toHaveLength(0);
    expect(api.years(rows)).toContain(2026);
  });

  it('monta painel, seleciona situação e escapa nomes recebidos do banco', async () => {
    const { dom, root } = context();
    await root.modulePage();
    const doc = dom.window.document;
    expect(doc.getElementById('isr-panel')).not.toBeNull();
    expect(doc.getElementById('isr-download').textContent).toContain('Emitir relatório PDF');
    expect(doc.getElementById('isr-preview').textContent).toContain('R$');
    expect(doc.getElementById('isr-preview').innerHTML).toContain('&lt;script&gt;');
    expect(doc.getElementById('isr-preview').querySelector('script')).toBeNull();
    const filter = doc.getElementById('isr-filter');
    filter.value = 'pendentes';
    filter.dispatchEvent(new dom.window.Event('change'));
    expect(doc.getElementById('isr-preview').textContent).toContain('Parcialmente pago');
    expect(doc.getElementById('isr-preview').textContent).not.toContain('Apartamento B');
    const year = doc.getElementById('isr-year');
    year.value = '2025';
    year.dispatchEvent(new dom.window.Event('change'));
    expect(doc.getElementById('isr-download').disabled).toBe(true);
  });

  it('exporta PDF multipágina com dados e páginas identificadas', () => {
    const { root, api } = context();
    const text = [];
    const saved = [];
    let page = 1;
    class Pdf {
      constructor() { this.internal = { getNumberOfPages: () => page }; }
      setFillColor() {}
      rect() {}
      roundedRect() {}
      setFont() {}
      setFontSize() {}
      setTextColor() {}
      setDrawColor() {}
      line() {}
      text(value) { text.push(String(value)); }
      splitTextToSize(value) { return [value]; }
      getTextWidth(value) { return String(value).length; }
      addPage() { page += 1; }
      setPage() {}
      save(name) { saved.push(name); }
    }
    root.jspdf = { jsPDF: Pdf };
    const many = Array.from({ length: 24 }, (_, i) => ({ ...rows[i % 4], id: 'x' + i, imovel_id: properties[i % 4].id }));
    const model = api.build(many, properties, 2026, 'todos');
    expect(api.exportPdf(model)).toBe('MATOS_IPTU_Situacao_2026_todos.pdf');
    expect(page).toBeGreaterThan(1);
    expect(saved).toEqual(['MATOS_IPTU_Situacao_2026_todos.pdf']);
    expect(text.join(' ')).toContain('FALTA QUITAR');
    expect(text.join(' ')).toContain('A conferir');
  });

  it('carrega o módulo e o CSS após o cálculo do IPTU', () => {
    expect(html.indexOf('/iptu-situation-report.js?v=1')).toBeGreaterThan(html.indexOf('/iptu-annual.js?v=3'));
    expect(html).toContain('/iptu-situation-report.css?v=1');
  });
});
