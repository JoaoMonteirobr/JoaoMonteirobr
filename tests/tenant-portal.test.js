import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('portal do inquilino', () => {
  const source = fs.readFileSync(new URL('../tenant-portal.js', import.meta.url), 'utf8');

  it('limita o menu do inquilino aos módulos pessoais', () => {
    expect(source).toContain("['Dashboard','Imóveis','Contratos','Cobranças','IPTU','Manutenção','Documentos']");
    expect(source).not.toContain("'Financeiro','Relatórios'");
    expect(source).not.toContain("tenantMenus.push('Vistorias')");
  });

  it('usa dashboard específico para inquilino', () => {
    expect(source).toContain("if(currentRole==='inquilino')return tenantDash()");
    expect(source).toContain('Minhas cobranças e pagamentos');
    expect(source).toContain('Somente cobranças vinculadas a você');
  });

  it('mantém manutenção do inquilino sem campos administrativos', () => {
    expect(source).toContain("prioridade:'media'");
    expect(source).toContain('orcamento:0');
    expect(source).toContain('custo_final:0');
    expect(source).toContain("status:'aberto'");
    expect(source).not.toContain('tm_orcamento');
    expect(source).not.toContain('tm_prioridade');
  });
});
