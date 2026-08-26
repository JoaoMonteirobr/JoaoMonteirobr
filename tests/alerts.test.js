import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../alerts.js', import.meta.url), 'utf8');

describe('Central de Alertas', () => {
  it('não usa situação financeira genérica para alertas', () => {
    expect(source).not.toContain("a.resolvido?'pago':'pendente'");
  });

  it('define categorias distintas para eventos críticos', () => {
    expect(source).toContain("login:'Login'");
    expect(source).toContain("cobranca_atrasada:'Aluguel em atraso'");
    expect(source).toContain("cobranca_vencendo:'Conta a vencer'");
    expect(source).toContain("contrato_vencendo:'Contrato a vencer'");
    expect(source).toContain("contrato_vencido:'Contrato vencido'");
  });

  it('usa estados contextuais', () => {
    expect(source).toContain("['Visto','green']");
    expect(source).toContain("['Novo','blue']");
    expect(source).toContain("['Em atraso','red']");
    expect(source).toContain("['Vencido','red']");
    expect(source).toContain("['A vencer','yellow']");
  });
});
