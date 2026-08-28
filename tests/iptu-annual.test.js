import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('IPTU anual', () => {
  const source = fs.readFileSync(new URL('../iptu-annual.js', import.meta.url), 'utf8');
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  it('remove o campo mensal do cadastro de imóvel', () => {
    expect(source).toContain("f[0]!=='iptu_mensal'");
    expect(source).toContain('IPTU anual:');
  });

  it('exige ano, valor anual e situação', () => {
    expect(source).toContain("['ano','Ano de referência'");
    expect(source).toContain("['valor_total','Valor anual do IPTU','number',1]");
    expect(source).toContain("['situacao','Situação','select:pago|em_aberto',1]");
    expect(source).toContain("o.textContent='Pendente'");
  });

  it('deixa o dashboard explícito por ano', () => {
    expect(source).toContain('IPTU — referência ');
    expect(source).toContain('Pendente no ano');
    expect(source).toContain('Pago no ano');
    expect(source).toContain('Total anual cadastrado');
  });

  it('inclui relatório anual separado do relatório mensal', () => {
    expect(source).toContain('Relatório anual de IPTU');
    expect(source).toContain('Separado do relatório mensal de aluguéis');
    expect(source).toContain('reportIptuYear');
  });

  it('carrega a camada anual após o núcleo do app', () => {
    expect(index).toContain('/iptu-annual.js?v=1');
    expect(index.indexOf('/iptu-annual.js?v=1')).toBeGreaterThan(index.indexOf('/app3.js'));
  });
});
