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
