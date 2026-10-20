import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

let MR;
const helpers = {
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]),
  money: (v) => `R$ ${Number(v || 0).toFixed(2)}`,
  dateBR: (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—'),
  picker: '<input id="simpleReportMonth">',
};

function row(name, status, expected, paid, due, paidAt) {
  return {
    tenant: { nome: name },
    property: { nome: `Imóvel ${name}` },
    status,
    expected,
    paid,
    pending: Math.max(0, expected - paid),
    due,
    charge: paidAt ? { data_pagamento: paidAt } : null,
  };
}

beforeAll(() => {
  const source = fs.readFileSync(path.join(process.cwd(), 'monthly-report.js'), 'utf8');
  new Function(source)();
  MR = window.MatosMonthlyReport;
});

describe('relatório mensal de aluguéis', () => {
  it('escreve o mês por extenso', () => {
    expect(MR.monthLabel('2026-10')).toBe('outubro de 2026');
    expect(MR.monthLabel('2026-01')).toBe('janeiro de 2026');
  });

  it('descreve atraso e prazo do vencimento', () => {
    expect(MR.dueLabel(15)).toEqual({ text: 'Atrasado há 15 dias', tone: 'late' });
    expect(MR.dueLabel(1).text).toBe('Atrasado há 1 dia');
    expect(MR.dueLabel(0).text).toBe('Vence hoje');
    expect(MR.dueLabel(-3)).toEqual({ text: 'Vence em 3 dias', tone: 'ok' });
    expect(MR.dueLabel(null).text).toBe('Sem vencimento');
  });

  it('calcula dias entre datas sem depender do fuso', () => {
    expect(MR.daysBetween('2026-10-05', '2026-10-20')).toBe(15);
    expect(MR.daysBetween('2026-10-25', '2026-10-20')).toBe(-5);
    expect(MR.daysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });

  it('separa pendentes e pagos, ordena por vencimento e soma os totais', () => {
    const rows = [
      row('Carlos', 'pendente', 1850, 0, '2026-10-10'),
      row('Ana', 'pago', 3200, 3200, '2026-10-05', '2026-10-04'),
      row('Ótica', 'pendente', 2900, 1500, '2026-10-10'),
      row('Fernanda', 'pendente', 2400, 0, '2026-10-05'),
      row('Bruno', 'pendente', 1000, 0, '2026-10-25'),
    ];
    const m = MR.summarize(rows, '2026-10', '2026-10-20');
    expect(m.pending.map((p) => p.tenant)).toEqual(['Fernanda', 'Carlos', 'Ótica', 'Bruno']);
    expect(m.pending[0].daysLate).toBe(15);
    expect(m.pending[3].daysLate).toBe(-5);
    expect(m.lateCount).toBe(3);
    expect(m.partialCount).toBe(1);
    expect(m.paidCount).toBe(1);
    expect(m.expected).toBe(11350);
    expect(m.received).toBe(4700);
    expect(m.missing).toBe(6650);
    expect(m.expected).toBe(m.received + m.missing);
  });

  it('mostra quanto falta no pagamento parcial e concilia o total recebido', () => {
    const rows = [row('Ótica', 'pendente', 2900, 1500, '2026-10-10'), row('Ana', 'pago', 3200, 3200, '2026-10-05', '2026-10-04')];
    const html = MR.render(MR.summarize(rows, '2026-10', '2026-10-20'), helpers);
    expect(html).toContain('R$ 1400.00');
    expect(html).toContain('Pagamentos parciais');
    expect(html).toContain('Total recebido no mês');
    expect(html).toContain('R$ 4700.00');
    expect(html).toContain('Relatório de aluguéis — Outubro de 2026');
    expect(html.indexOf('Falta receber</h3>')).toBeLessThan(html.indexOf('Recebidos</h3>'));
  });

  it('escapa nomes vindos do cadastro', () => {
    const html = MR.render(MR.summarize([row('<script>x</script>', 'pendente', 100, 0, '2026-10-05')], '2026-10', '2026-10-06'), helpers);
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('trata mês sem aluguéis', () => {
    const html = MR.render(MR.summarize([], '2026-10', '2026-10-20'), helpers);
    expect(html).toContain('Nenhum aluguel previsto');
  });

  it('é carregado depois da tela simplificada', () => {
    const index = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    expect(index).toContain('/monthly-report.js?v=1');
    expect(index).toContain('/monthly-report.css?v=1');
    expect(index.indexOf('/monthly-report.js')).toBeGreaterThan(index.indexOf('/simple-ui.js'));
  });
});
