import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const ui = read('simple-ui.js');
const sql = read('supabase/migrations/20261113_estornar_pagamento.sql');

function demoCharge(value = 1000) {
  return {
    charge: { id: 'charge-123', valor_pago: value, data_pagamento: '2026-11-05',
      comprovante_path: 'pagamentos/arquivo.pdf' },
    tenant: { nome: 'Inquilino de exemplo' },
    property: { nome: 'Sala 02' },
    contract: { id: 'contrato-123' },
    status: value >= 1000 ? 'pago' : 'pendente',
    expected: 1000, paid: value, due: '2026-11-05',
  };
}

function runtime(role = 'admin', reject = false) {
  const dom = new JSDOM('<html><body></body></html>');
  const request = vi.fn(reject
    ? async () => { throw new Error('Estorno indisponível'); }
    : async () => ({ ok: true, cobranca_id: 'charge-123', valor_excluido: 1000 }));
  const paymentsPage = vi.fn(async () => {});
  const cache = { cobrancas: ['pagamento-antigo'], financeiro: ['receita-antiga'] };
  const ctx = {
    document: dom.window.document, currentRole: role,
    E: (id) => dom.window.document.getElementById(id),
    esc: (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    money: (v) => 'R$ ' + Number(v).toFixed(2),
    session: { access_token: 'jwt-ficticio' },
    authHeaders: (token) => ({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }),
    request, paymentsPage, cache,
  };
  const start = ui.indexOf('function openReversePayment(row,k){');
  const end = ui.indexOf('async function openQuickPayment(k){', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const open = vm.runInNewContext(ui.slice(start, end) + '\nopenReversePayment;', ctx);
  return { dom, ctx, open, request, cache, paymentsPage };
}

function tableRow(actions, charge = demoCharge().charge) {
  const start = ui.indexOf('function paymentRows(rows,actions){');
  const end = ui.indexOf('// Exibe os aluguéis previstos', start);
  const ctx = {
    esc: (v) => String(v ?? ''),
    dateBR: (v) => v,
    money: (v) => 'R$ ' + Number(v).toFixed(2),
    st: (s) => s,
  };
  const render = vm.runInNewContext(ui.slice(start, end) + '\npaymentRows;', ctx);
  return render([{ ...demoCharge(), charge }], actions);
}

describe('excluir pagamento — estorno seguro', () => {
  it('mostra excluir somente para o administrador e somente com pagamento informado', () => {
    expect(tableRow(true)).toContain('data-reverse-id="charge-123"');
    expect(tableRow(true)).toContain('Excluir pagamento');
    expect(tableRow(false)).not.toContain('data-reverse-id');
    expect(tableRow(true, { id: 'charge-123', valor_pago: 0, data_pagamento: null })).not.toContain('data-reverse-id');
    expect(tableRow(true, { id: 'charge-123', valor_pago: 500, data_pagamento: null })).toContain('data-reverse-id');
    expect(ui).toContain("if(currentRole!=='admin')return;var r=rows.find");
  });

  it('não permite abrir o modal no perfil proprietário ou inquilino', () => {
    for (const role of ['proprietario_consulta', 'inquilino', 'proprietario']) {
      const env = runtime(role);
      env.open(demoCharge(), '2026-11');
      expect(env.dom.window.document.getElementById('reversePaymentModal')).toBeNull();
      expect(env.request).not.toHaveBeenCalled();
    }
  });

  it('exige motivo, confirmação e chama RPC autenticada somente uma vez', async () => {
    const env = runtime();
    env.open(demoCharge(), '2026-11');
    const get = (id) => env.dom.window.document.getElementById(id);
    expect(get('reversePaymentModal')).not.toBeNull();
    expect(get('reversePaymentModal').textContent).toContain('Inquilino de exemplo');
    expect(get('reversePaymentModal').textContent).toContain('Sala 02');
    await get('reverseSave').onclick();
    expect(env.request).not.toHaveBeenCalled();
    get('reverseReason').value = 'Lançamento no imóvel errado';
    await get('reverseSave').onclick();
    expect(env.request).not.toHaveBeenCalled();
    get('reverseConfirm').checked = true;
    await get('reverseSave').onclick();
    expect(env.request).toHaveBeenCalledOnce();
    const [url,opts] = env.request.mock.calls[0];
    expect(url).toBe('/rest/v1/rpc/estornar_pagamento');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer jwt-ficticio');
    expect(JSON.parse(opts.body)).toEqual({
      p_cobranca_id:'charge-123',p_motivo:'Lançamento no imóvel errado'
    });
    expect(env.cache.cobrancas).toBeNull();
    expect(env.cache.financeiro).toBeNull();
    expect(env.paymentsPage).toHaveBeenCalledOnce();
    expect(get('reversePaymentModal')).toBeNull();
  });

  it('mantém a tela e os dados intactos se o servidor rejeitar o estorno', async () => {
    const env = runtime('admin', true);
    env.open(demoCharge(), '2026-11');
    const get = (id) => env.dom.window.document.getElementById(id);
    get('reverseReason').value = 'Erro no valor registrado';
    get('reverseConfirm').checked = true;
    await get('reverseSave').onclick();
    expect(get('reversePaymentModal')).not.toBeNull();
    expect(get('reverseMsg').textContent).toContain('Estorno indisponível');
    expect(get('reverseSave').disabled).toBe(false);
    expect(env.cache.cobrancas).toEqual(['pagamento-antigo']);
    expect(env.paymentsPage).not.toHaveBeenCalled();
  });

  it('preserva cobrança, contrato, auditoria, comprovante privado e regras de banco', () => {
    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).toContain('public.is_admin()');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('valor_pago = 0');
    expect(sql).toContain('data_pagamento = NULL');
    expect(sql).toContain("status = 'pendente'");
    expect(sql).toContain('comprovante_path = NULL');
    expect(sql).toContain('observacoes = concat_ws');
    expect(sql).toContain('trg_auditoria_cobrancas');
    expect(sql).toContain('trg_cobranca_financeiro');
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.cobrancas/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+storage\.objects/i);
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.estornar_pagamento(uuid, text) TO authenticated');
  });

  it('atualiza o script da interface para não usar versão antiga em cache', () => {
    expect(read('index.html')).toContain('/simple-ui.js?v=18');
    expect(read('index.html')).toContain('/simple-ui.css?v=16');
  });
});
