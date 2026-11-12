import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

let P;

beforeAll(() => {
  window.adminMenus = ['Dashboard', 'Configurações'];
  window.ownerMenus = ['Dashboard'];
  window.tenantMenus = ['Dashboard'];
  window.navIcon = () => '•';
  window.load = async () => {};
  new Function(fs.readFileSync(path.join(process.cwd(), 'meu-perfil.js'), 'utf8'))();
  P = window.MatosPerfil;
});

describe('Meu perfil', () => {
  it('aparece no menu de todos os perfis', () => {
    expect(window.adminMenus).toContain('Meu perfil');
    expect(window.ownerMenus).toContain('Meu perfil');
    expect(window.tenantMenus).toContain('Meu perfil');
  });

  it('limpa e valida o nome', () => {
    expect(P.cleanName('  Ney   Freitas ')).toBe('Ney Freitas');
    expect(P.nameError('Ney Freitas')).toBe('');
    expect(P.nameError('N')).toMatch(/entre 2 e 80/);
    expect(P.nameError('x'.repeat(81))).toMatch(/entre 2 e 80/);
    expect(P.nameError('ney@gmail.com')).toMatch(/não o e-mail/);
  });

  it('exige senha com 8 caracteres e confirmação igual', () => {
    expect(P.passwordError('12345678', '12345678')).toBe('');
    expect(P.passwordError('123', '123')).toMatch(/8 caracteres/);
    expect(P.passwordError('12345678', '12345679')).toMatch(/não são iguais/);
  });

  it('é carregado no index.html', () => {
    const index = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    expect(index).toContain('/meu-perfil.js?v=1');
  });
});
