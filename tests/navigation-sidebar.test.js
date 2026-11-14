import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('navegação lateral responsiva', () => {
  const js = fs.readFileSync(new URL('../navigation-sidebar.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../navigation-sidebar.css', import.meta.url), 'utf8');
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  it('oferece controle de abrir e recolher a sidebar', () => {
    expect(js).toContain("var PREF_KEY='matos_sidebar_collapsed'");
    expect(js).toContain('toggleSidebar');
    expect(js).toContain("className='nav-toggle'");
    expect(js).toContain("classList.toggle('sidebar-collapsed'");
    expect(js).toContain("classList.toggle('sidebar-open'");
  });

  it('usa drawer lateral no celular sem overflow horizontal', () => {
    expect(css).toContain('@media(max-width:820px)');
    expect(css).toContain('transform:translateX(-105%)!important');
    expect(css).toContain('.shell.sidebar-open .side');
    expect(css).toContain('overflow-x:hidden');
  });

  it('exibe logo animada no topo mobile sem alterar o menu', () => {
    const mobileCss = fs.readFileSync(new URL('../matos-brand.css', import.meta.url), 'utf8');
    expect(js).toContain("className='matos-mobile-top-brand'");
    expect(js).toContain("toggle.insertAdjacentElement('afterend',brand)");
    expect(js).toContain('/matos-marca.svg?v=2');
    expect(mobileCss).toContain('@media(max-width:820px)');
    expect(mobileCss).toContain('html body .appbar .matos-mobile-top-brand');
    expect(mobileCss).toContain('@keyframes matos-mobile-mark-motion');
    expect(mobileCss).toContain('@keyframes matos-mobile-ring');
    expect(mobileCss).toContain('@media(prefers-reduced-motion:reduce)');
  });

  it('carrega a camada de navegação antes da inicialização final', () => {
    expect(index).toContain('/navigation-sidebar.css?v=1');
    expect(index).toContain('/navigation-sidebar.js?v=2');
    expect(index.indexOf('/navigation-sidebar.js?v=2')).toBeLessThan(index.indexOf('/app3.js'));
  });
});
