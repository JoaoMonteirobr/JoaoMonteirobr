import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

describe('comprovantes nos pagamentos e PDF mensal', () => {
  const ui = fs.readFileSync(path.join(process.cwd(), 'simple-ui.js'), 'utf8');
  const report = fs.readFileSync(path.join(process.cwd(), 'monthly-report-pdf.js'), 'utf8');
  const index = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

  function moduleForTest() {
    const ctx = { window: {} };
    vm.runInNewContext(report, ctx);
    return ctx.window.MatosMonthlyReport;
  }

  it('carrega exportador e usa o bucket privado autenticado', () => {
    expect(index).toContain('/monthly-report-pdf.js?v=1');
    expect(report).toContain('/storage/v1/object/authenticated/comprovantes/');
    expect(report).not.toContain('/object/public/comprovantes/');
    expect(report).toContain('Authorization:');
  });

  it('oferece campo opcional em pagamentos rápidos e manuais, com validação e limpeza após erro', () => {
    expect(ui).toContain('id="qp_proof"');
    expect(ui).toContain('id="mp_proof"');
    expect(ui).toContain('id="pay_file"');
    expect(ui).toContain('async function savePaymentWithProof');
    expect(ui).toContain('await deleteUploadedProof(path)');
    expect(ui).toContain('old&&!confirm');
  });

  it('numera somente cobranças com arquivos efetivamente vinculados', () => {
    const rows = [
      { charge: { id: 'a', comprovante_path: 'pagamentos/a.pdf' } },
      { charge: { id: 'b', comprovante_path: null } },
      { charge: null },
      { charge: { id: 'c', comprovante_path: 'pagamentos/c.jpg' } },
    ];
    const entries = moduleForTest().proofEntries(rows);
    expect(entries.length).toBe(2);
    expect(entries.map((x) => x.number)).toEqual(['01', '02']);
    expect(entries[0].row.charge.id).toBe('a');
    expect(entries[1].row.charge.id).toBe('c');
  });

  it('rejeita mês inválido antes de tentar buscar arquivos', async () => {
    await expect(moduleForTest().export('2026-13', [])).rejects.toThrow('Competência mensal inválida');
  });

  it('inclui anexos PDF originais e converte imagens antes de incorporá-las', () => {
    expect(report).toContain('doc.copyPages(original,idx)');
    expect(report).toContain('async function jpegForImage');
    expect(report).toContain('await doc.embedJpg(jpg)');
    expect(report).toContain('Nenhum PDF parcial foi gerado.');
    expect(ui).toContain('Baixar PDF completo com anexos');
    expect(ui).toContain('Imprimir somente tabela');
  });
});


describe('exportação consolidada sem dados reais', () => {
  const report = fs.readFileSync(path.join(process.cwd(), 'monthly-report-pdf.js'), 'utf8');

  function fakePdfEnvironment(options = {}) {
    let downloaded = 0;
    let copiedPages = 0;
    let fetched = null;
    const pages = [];
    const font = { widthOfTextAtSize: (text, size) => String(text).length * size * 0.46 };
    const makePage = (size = [841.89, 595.28]) => ({
      getWidth: () => size[0],
      getHeight: () => size[1],
      drawText: () => {},
      drawRectangle: () => {},
      drawImage: () => {},
    });
    const pdf = {
      setTitle: () => {},
      setAuthor: () => {},
      embedFont: async () => font,
      embedJpg: async () => ({ width: 1000, height: 1000, scale: (n) => ({ width: 1000 * n, height: 1000 * n }) }),
      addPage: (size) => {
        const page = Array.isArray(size) ? makePage(size) : size;
        pages.push(page);
        return page;
      },
      copyPages: async (_source, indices) => {
        copiedPages += indices.length;
        return indices.map(() => makePage([595.28, 841.89]));
      },
      getPageCount: () => pages.length,
      save: async () => new Uint8Array([37, 80, 68, 70]),
    };
    const lib = {
      PDFDocument: {
        create: async () => pdf,
        load: async () => {
          if (options.invalidPdf) throw new Error('documento protegido');
          return { getPageIndices: () => [0, 1] };
        },
      },
      StandardFonts: { Helvetica: 'regular', HelveticaBold: 'bold' },
      rgb: (r, g, b) => ({ r, g, b }),
    };
    const doc = {
      head: { appendChild: () => {} },
      body: { appendChild: () => {} },
      createElement: (tag) => {
        if (tag === 'a') return { style: {}, click: () => { downloaded += 1; }, remove: () => {} };
        throw new Error('Elemento inesperado: ' + tag);
      },
    };
    const ctx = {
      window: { PDFLib: lib },
      document: doc,
      URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
      Blob,
      session: { access_token: 'jwt-privado-de-teste' },
      SUPA_URL: 'https://sistema-exemplo.supabase.co',
      KEY: 'chave-publica-de-teste',
      setTimeout: () => {},
      fetch: async (uri, init) => {
        fetched = { uri, init };
        return { ok: true, arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer };
      },
    };
    vm.runInNewContext(report, ctx);
    return {
      app: ctx.window.MatosMonthlyReport,
      pages,
      getDownloaded: () => downloaded,
      getCopied: () => copiedPages,
      getFetched: () => fetched,
    };
  }

  it('gera um relatório sem anexos e sem acessar armazenamento', async () => {
    const env = fakePdfEnvironment();
    const result = await env.app.export('2026-11', []);
    expect(result.anexos).toBe(0);
    expect(result.paginas).toBe(1);
    expect(env.getDownloaded()).toBe(1);
    expect(env.getFetched()).toBeNull();
  });

  it('incorpora todas as páginas do PDF do comprovante privado', async () => {
    const env = fakePdfEnvironment();
    const rows = [{
      status: 'pago',
      due: '2026-11-05',
      expected: 1000,
      paid: 1000,
      pending: 0,
      tenant: { nome: 'Teste' },
      property: { nome: 'Apartamento 1' },
      charge: {
        id: 'charge-test',
        comprovante_path: 'pagamentos/teste.pdf',
        comprovante_nome: 'comprovante.pdf',
        comprovante_tipo: 'application/pdf',
        data_pagamento: '2026-11-05',
      },
    }];
    const result = await env.app.export('2026-11', rows);
    expect(result.anexos).toBe(1);
    expect(env.getCopied()).toBe(2);
    expect(env.getDownloaded()).toBe(1);
    expect(env.getFetched().uri).toContain('/storage/v1/object/authenticated/comprovantes/pagamentos/teste.pdf');
    expect(env.getFetched().init.headers.Authorization).toBe('Bearer jwt-privado-de-teste');
  });

  it('não baixa PDF incompleto quando um comprovante está protegido ou danificado', async () => {
    const env = fakePdfEnvironment({ invalidPdf: true });
    const rows = [{
      status: 'pago', expected: 200, paid: 200, pending: 0, due: '2026-11-05',
      tenant: { nome: 'Teste' }, property: { nome: 'Unidade' },
      charge: { id: 'x', comprovante_path: 'pagamentos/x.pdf', comprovante_tipo: 'application/pdf', comprovante_nome: 'x.pdf' },
    }];
    await expect(env.app.export('2026-11', rows)).rejects.toThrow('Nenhum PDF parcial foi gerado.');
    expect(env.getDownloaded()).toBe(0);
  });
});
