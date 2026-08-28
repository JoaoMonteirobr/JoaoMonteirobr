import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('cadastro seguro PF/PJ de inquilinos', () => {
  const js = fs.readFileSync(new URL('../tenant-identity.js', import.meta.url), 'utf8');
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  it('valida CPF e CNPJ localmente e normaliza antes de persistir', () => {
    expect(js).toContain('function cpfValid');
    expect(js).toContain('function cnpjValid');
    expect(js).toContain('function validateDocument');
    expect(js).toContain('obj.cpf_cnpj=raw');
  });

  it('impede duplicidade de documento', () => {
    expect(js).toContain('async function ensureUnique');
    expect(js).toContain('já cadastrado para outro inquilino');
  });

  it('consulta CNPJ somente por ação explícita e sem cache', () => {
    expect(js).toContain("btn.textContent='Buscar CNPJ'");
    expect(js).toContain("btn.onclick=lookupCnpj");
    expect(js).toContain("cache:'no-store'");
    expect(js).toContain('LOOKUP_COOLDOWN=2500');
  });

  it('não importa dados societários desnecessários', () => {
    expect(js).not.toContain('qsa');
    expect(js).not.toContain('capital_social');
    expect(js).not.toContain('nome_socio');
  });

  it('carrega a camada antes da inicialização final', () => {
    expect(index).toContain('/tenant-identity.js?v=1');
    expect(index.indexOf('/tenant-identity.js?v=1')).toBeLessThan(index.indexOf('/app3.js'));
  });
});