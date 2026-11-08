import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const ui = read('simple-ui.js');
const report = read('monthly-report-pdf.js');
const makeRow = (kind = 'application/pdf') => ({
  tenant: { nome: 'Locatário exemplo' },
  property: { nome: 'Sala comercial 04' },
  paid: 1850,
  charge: {
    id: 'cobranca-exemplo',
    comprovante_path: kind === 'empty' ? null : 'pagamentos/arquivo.pdf',
    comprovante_nome: 'Comprovante do aluguel.pdf',
    comprovante_tipo: kind,
    data_pagamento: '2026-11-08',
  },
});

function proofHarness(kind) {
  const dom = new JSDOM('<html><body></body></html>', { url: 'https://matos.exemplo.test' });
  const request = vi.fn(async () => ({
    signedURL: '/object/sign/comprovantes/pagamentos/arquivo.pdf?token=ficticio',
  }));
  const fetch = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['pdf'], { type: 'application/pdf' }) }));
  const downloads = [];
  dom.window.URL.createObjectURL = () => 'blob:https://matos.exemplo.test/download';
  dom.window.URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function () {
    downloads.push({ href: this.href, filename: this.download });
  };
  const marker = ui.indexOf('async function openProof(row){');
  const tail = ui.indexOf('\nwindow.MatosPayment=', marker);
  expect(marker).toBeGreaterThan(0);
  expect(tail).toBeGreaterThan(marker);
  const ctx = {
    window: dom.window,
    document: dom.window.document,
    URL: dom.window.URL,
    Blob,
    fetch,
    KEY: 'anon-publica-teste',
    SUPA_URL: 'https://sistema.exemplo.supabase.co',
    session: { access_token: 'jwt-exemplo' },
    request,
    authHeaders: () => ({ Authorization: 'Bearer jwt-exemplo' }),
    money: (value) => 'R$ ' + Number(value).toFixed(2),
    dateBR: (date) => date.split('-').reverse().join('/'),
    E: (id) => dom.window.document.getElementById(id),
    setTimeout: () => {},
  };
  const open = vm.runInNewContext(ui.slice(marker, tail) + '\nopenProof;', ctx);
  return { dom, request, fetch, open, downloads, kind };
}

describe('Paridade de painel e comprovantes privados', () => {
  it('exibe as mesmas áreas operacionais nos menus de administrador e proprietário', () => {
    const start = ui.indexOf('var consultaMenus=');
    const stop = ui.indexOf('// Liga cada tela', start);
    const evaluate = new Function('adminMenus', 'ownerMenus', 'tenantMenus', ui.slice(start, stop) + ';return {adminMain,consultaMenus}');
    const { adminMain, consultaMenus } = evaluate([], [], []);
    expect(adminMain.slice(0, consultaMenus.length)).toEqual(consultaMenus);
    expect(consultaMenus).toEqual([
      'Dashboard','Cadastros','Inquilinos','Contratos','Pagamentos','IPTU','Chamados',
      'Financeiro','Gastos','Relatórios'
    ]);
    expect(adminMain.slice(-2)).toEqual(['Acessos', 'Configurações']);
    expect(consultaMenus).not.toContain('Acessos');
    expect(consultaMenus).not.toContain('Configurações');
    expect(ui).toContain("currentRole==='admin'?");
  });

  it('mantém relatório idêntico para ambos perfis, com data de pagamento e galeria', () => {
    expect(ui).toContain('async function simpleReports()');
    expect(ui).toContain('Pago em');
    expect(ui).toContain('Comprovantes do mês');
    expect(ui).toContain('data-proof-id');
    expect(ui).toContain('Não informada');
    expect(ui).toContain('Baixar PDF completo com anexos');
    expect(report).toContain("title:'PAGO EM'");
    expect(report).toContain("title:'COMPROVANTE'");
    expect(report).toContain('doc.copyPages(original,idx)');
    expect(report).toContain('r.charge&&r.charge.data_pagamento');
    expect(report).toContain("?'Comprovante '+byId[r.charge.id]:'Sem anexo'");
  });

  it('visualiza PDF em modal e usa URL assinada de duração limitada', async () => {
    const test = proofHarness('application/pdf');
    await test.open(makeRow());
    const modal = test.dom.window.document.querySelector('#matosProofModal');
    expect(modal).toBeTruthy();
    expect(modal.querySelector('[role=dialog]')).toBeTruthy();
    expect(modal.querySelector('#proofTenant').textContent).toContain('Locatário');
    expect(modal.querySelector('#proofAmount').textContent).toContain('1850');
    expect(modal.querySelector('iframe').src).toContain('/storage/v1/object/sign/comprovantes/pagamentos/arquivo.pdf');
    expect(modal.querySelector('iframe').src).toContain('token=ficticio');
    expect(modal.querySelector('#proofOpenTab').getAttribute('rel')).toContain('noopener');
    expect(test.request.mock.calls[0][1].body).toContain('"expiresIn":300');
    modal.querySelector('#proofClose').click();
    expect(test.dom.window.document.querySelector('#matosProofModal')).toBeNull();
  });

  it('permite baixar somente o arquivo autenticado sem torná-lo público', async () => {
    const test = proofHarness('image/png');
    await test.open(makeRow('image/png'));
    const modal = test.dom.window.document.querySelector('#matosProofModal');
    expect(modal.querySelector('img')).toBeTruthy();
    await modal.querySelector('#proofDownload').onclick();
    expect(test.fetch).toHaveBeenCalledOnce();
    expect(test.fetch.mock.calls[0][0]).toContain('/storage/v1/object/authenticated/comprovantes/');
    expect(test.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt-exemplo');
    expect(test.downloads).toHaveLength(1);
    expect(test.downloads[0].filename).toContain('Comprovante do aluguel.pdf');
  });

  it('não abre arquivos inexistentes ou lançamentos sem comprovante', async () => {
    const test = proofHarness('empty');
    await test.open(makeRow('empty'));
    expect(test.request).not.toHaveBeenCalled();
    expect(test.dom.window.document.querySelector('#matosProofModal')).toBeNull();
  });

  it('não expõe botões de alteração ao perfil somente leitura', () => {
    expect(ui).toContain("currentRole==='admin'?");
    expect(ui).toContain('var manual=currentRole===\'admin\'?');
    expect(ui).toContain("if(currentRole!=='admin')return");
    expect(read('app2.js')).toContain("if(currentRole==='admin')h+='<th>Ações</th>'");
  });
});
