import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

let P;
const read = (f) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

beforeAll(() => {
  const src = read('simple-ui.js');
  const block = src.slice(src.indexOf('// Comprovante de pagamento'), src.indexOf('window.MatosPayment='));
  P = new Function(`${block}; return { methods: PAY_METHODS, proofProblem, proofPath };`)();
});

describe('Informar pagamento', () => {
  it('oferece formas de pagamento aceitas pelo banco', () => {
    const allowed = ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'transferencia', 'boleto', 'outro'];
    expect(P.methods.map((m) => m[0]).sort()).toEqual([...allowed].sort());
    expect(P.methods[0]).toEqual(['pix', 'PIX']);
  });

  it('aceita só PDF e fotos de até 10 MB como comprovante', () => {
    expect(P.proofProblem({ type: 'application/pdf', size: 1000 })).toBe('');
    expect(P.proofProblem({ type: 'image/jpeg', size: 1000 })).toBe('');
    expect(P.proofProblem({ type: 'text/plain', size: 10 })).toMatch(/PDF ou uma foto/);
    expect(P.proofProblem({ type: 'image/png', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
  });

  it('guarda um caminho opaco sem o nome pessoal do arquivo', () => {
    expect(P.proofPath('Comprovante PIX (março).pdf', 123, 'abc')).toBe('pagamentos/123-abc.pdf');
  });

  it('salva a forma de pagamento escolhida', () => {
    const src = read('simple-ui.js');
    const fn = src.slice(src.indexOf('function openPayment('), src.indexOf('// Comprovante de pagamento'));
    expect(fn).toContain("forma_pagamento:E('pay_method').value");
    expect(read('index.html')).toContain('/simple-ui.js?v=13');
  });
});
