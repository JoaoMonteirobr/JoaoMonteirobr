import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

let G;
const label = (im) => [im.endereco, im.numero].filter(Boolean).join(', ');
const ims = [
  { id: 'a101', nome: 'Apto 101', endereco: 'Rua Major Salinas', numero: '120' },
  { id: 'l02', nome: 'Loja 02', endereco: 'Rua Major Salinas', numero: '120' },
  { id: 'casa', nome: 'Casa', endereco: 'Rua das Flores', numero: '45' },
];
const imById = Object.fromEntries(ims.map((im) => [im.id, im]));
const tiposById = { r: { id: 'r', nome: 'Reparo' }, p: { id: 'p', nome: 'Pintura' } };
const gastos = [
  { id: '1', escopo: 'predio', predio: 'Rua Major Salinas, 120', tipo_id: 'r', data: '2026-10-28', valor: 3200 },
  { id: '2', escopo: 'unidade', imovel_id: 'a101', tipo_id: 'r', data: '2026-10-15', valor: 480.5 },
  { id: '3', escopo: 'unidade', imovel_id: 'casa', tipo_id: 'p', data: '2026-07-20', valor: 1900 },
  { id: '4', escopo: 'unidade', imovel_id: 'l02', tipo_id: 'p', data: '2025-12-10', valor: 100 },
];

beforeAll(() => {
  new Function(fs.readFileSync(path.join(process.cwd(), 'gastos.js'), 'utf8'))();
  G = window.MatosGastos;
});

describe('aba Gastos', () => {
  it('identifica o prédio de cada gasto, inteiro ou por unidade', () => {
    expect(G.buildingOf(gastos[0], imById, label)).toBe('Rua Major Salinas, 120');
    expect(G.buildingOf(gastos[1], imById, label)).toBe('Rua Major Salinas, 120');
    expect(G.buildingOf({ escopo: 'unidade', imovel_id: 'x' }, imById, label)).toBe('Imóvel removido');
  });

  it('monta a lista de prédios com suas unidades', () => {
    const b = G.buildingsFrom(ims, label);
    expect(b.map((x) => x.label)).toEqual(['Rua das Flores, 45', 'Rua Major Salinas, 120']);
    expect(b[1].units.map((u) => u.name)).toEqual(['Apto 101', 'Loja 02']);
  });

  it('filtra por período, prédio, unidade e tipo', () => {
    const f = (o) => G.filterGastos(gastos, { period: 'all', place: 'all', tipo: 'all', ...o }, imById, label).map((g) => g.id);
    expect(f({ period: '2026' })).toEqual(['1', '2', '3']);
    expect(f({ period: '2026-10' })).toEqual(['1', '2']);
    expect(f({ place: 'b:Rua Major Salinas, 120' })).toEqual(['1', '2', '4']);
    expect(f({ place: 'u:a101' })).toEqual(['2']);
    expect(f({ tipo: 'p' })).toEqual(['3', '4']);
  });

  it('agrupa por prédio com total e ordena do mais recente', () => {
    const groups = G.groupByBuilding(gastos.slice(0, 3), imById, label);
    expect(groups.map((g) => g.label)).toEqual(['Rua das Flores, 45', 'Rua Major Salinas, 120']);
    expect(groups[1].items.map((g) => g.id)).toEqual(['1', '2']);
    expect(groups[1].total).toBe(3680.5);
  });

  it('resume total, quantidade e tipos com maior gasto', () => {
    const s = G.summarize(gastos, tiposById);
    expect(s.total).toBe(5680.5);
    expect(s.count).toBe(4);
    expect(s.byType).toEqual([
      { nome: 'Reparo', total: 3680.5 },
      { nome: 'Pintura', total: 2000 },
    ]);
  });

  it('oferece mês atual, meses com gastos, anos e todo o período', () => {
    const v = G.periodOptions(gastos, '2026-11-02').map((p) => p.v);
    expect(v).toEqual(['2026', '2026-11', '2026-10', '2026-07', '2025', '2025-12', 'all']);
  });

  it('valida o formulário de gasto', () => {
    const ok = { escopo: 'predio', predio: 'Rua X, 1', tipo_id: 'r', valor: 10, data: '2026-11-02', descricao: 'a' };
    expect(G.validateGasto(ok)).toBe('');
    expect(G.validateGasto({ ...ok, predio: ' ' })).toMatch(/prédio/);
    expect(G.validateGasto({ ...ok, escopo: 'unidade', predio: null })).toMatch(/unidade/);
    expect(G.validateGasto({ ...ok, valor: 0 })).toMatch(/maior que zero/);
    expect(G.validateGasto({ ...ok, valor: Number.NaN })).toMatch(/maior que zero/);
    expect(G.validateGasto({ ...ok, descricao: '  ' })).toMatch(/Descreva/);
    expect(G.validateGasto({ ...ok, tipo_id: '' })).toMatch(/tipo/);
  });

  it('recusa nome de tipo repetido sem diferenciar maiúsculas e acentos', () => {
    const tipos = [
      { id: 'r', nome: 'Reparo', ativo: true },
      { id: 'e', nome: 'Elétrica', ativo: false },
    ];
    expect(G.typeNameError('  reparo ', tipos)).toMatch(/Já existe/);
    expect(G.typeNameError('eletrica', tipos)).toMatch(/desativado/);
    expect(G.typeNameError('Reparo', tipos, 'r')).toBe('');
    expect(G.typeNameError('', tipos)).toMatch(/Digite/);
    expect(G.typeNameError('x'.repeat(61), tipos)).toMatch(/60/);
    expect(G.cleanTypeName('  jardinagem   externa ')).toBe('Jardinagem externa');
  });

  it('entende valores digitados no formato brasileiro', () => {
    expect(G.parseMoney('1.250,50')).toBe(1250.5);
    expect(G.parseMoney('R$ 3.200,00')).toBe(3200);
    expect(G.parseMoney('480.5')).toBe(480.5);
    expect(Number.isNaN(G.parseMoney('abc'))).toBe(true);
  });

  it('aceita só PDF e fotos de até 10 MB e limpa o nome do arquivo', () => {
    expect(G.fileProblem({ name: 'nf.pdf', type: 'application/pdf', size: 1000 })).toBe('');
    expect(G.fileProblem({ name: 'a.xlsx', type: 'application/vnd.ms-excel', size: 10 })).toMatch(/PDF ou foto/);
    expect(G.fileProblem({ name: 'f.jpg', type: 'image/jpeg', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(G.safeFileName('Nota Fiscal nº 12 (ação).pdf')).toBe('Nota_Fiscal_n__12__acao_.pdf');
  });

  it('é carregado depois da tela simplificada', () => {
    const index = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    expect(index).toContain('/gastos.js?v=2');
    expect(index).toContain('/gastos.css?v=1');
    expect(index.indexOf('/gastos.js')).toBeGreaterThan(index.indexOf('/simple-ui.js'));
  });
});
