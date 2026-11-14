import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const loginScript = read('theme-led.js');
const mainScript = read('app1.js');
const brandCss = read('matos-brand.css');
const themeCss = read('theme-led.css');
const logoSvg = read('matos-marca.svg');
const html = read('index.html');

function loginHarness() {
  const dom = new JSDOM('<div id="app"></div>', { url: 'https://matos.local.test' });
  const APP = dom.window.document.getElementById('app');
  const animateLogin = vi.fn();
  const signin = vi.fn();
  const recover = vi.fn();
  const start = loginScript.indexOf('var ICONS=[');
  const end = loginScript.indexOf('\nfunction animateLogin(cv){', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const context = {
    document: dom.window.document,
    APP, animateLogin, signin, recover,
    E: (id) => dom.window.document.getElementById(id),
  };
  context.window = context;
  vm.runInNewContext(loginScript.slice(start, end), context, { filename: 'theme-led.js' });
  context.login();
  return { dom, APP, animateLogin, signin, recover };
}

describe('Nova identidade Matos com logo animada', () => {
  it('apresenta marca azul-marinho e laranja em vetor legível e sem imagem externa', () => {
    const dom = new JSDOM(logoSvg, { contentType: 'image/svg+xml' });
    const svg = dom.window.document.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('viewBox')).toBe('0 0 160 154');
    expect(dom.window.document.querySelectorAll('linearGradient')).toHaveLength(2);
    expect(logoSvg).toContain('#002B60');
    expect(logoSvg).toContain('#FF7800');
    expect(logoSvg).toContain('class="mark-roof"');
    expect(logoSvg).toContain('class="mark-curve"');
    expect(logoSvg).toContain('class="mark-window"');
    expect(logoSvg).not.toMatch(/<(?:script|foreignObject)\b/i);
    expect(logoSvg).not.toMatch(/https?:\/\//i);
  });

  it('mantém apenas o botão central para abrir o login', () => {
    const { dom, APP, animateLogin, signin, recover } = loginHarness();
    const doc = dom.window.document;
    expect(doc.querySelector('.led-auth nav button')).toBeNull();
    expect(doc.querySelector('.led-auth nav .matos-brand-landing')).toBeTruthy();
    expect(doc.querySelector('.led-auth nav .matos-brand-words strong').textContent).toBe('MATOS');
    expect(doc.querySelector('.led-auth nav .matos-brand-words small').textContent)
      .toBe('GESTÃO DE ALUGUÉIS');
    expect(doc.querySelector('.led-auth nav img').getAttribute('src')).toBe('/matos-marca.svg?v=1');
    expect(doc.querySelectorAll('[data-led-open]')).toHaveLength(1);
    expect(doc.querySelector('.cta [data-led-open]').textContent).toBe('Entrar no sistema');
    expect(doc.querySelector('#led_veil').classList.contains('open')).toBe(false);
    doc.querySelector('.cta [data-led-open]').click();
    expect(doc.querySelector('#led_veil').classList.contains('open')).toBe(true);
    expect(doc.activeElement).toBe(doc.querySelector('#email'));
    expect(doc.querySelector('#senha')).toBeTruthy();
    doc.querySelector('#signin').click();
    expect(signin).toHaveBeenCalledOnce();
    doc.querySelector('#recover').click();
    expect(recover).toHaveBeenCalledOnce();
    doc.querySelector('#led_x').click();
    expect(doc.querySelector('#led_veil').classList.contains('open')).toBe(false);
    expect(animateLogin).toHaveBeenCalledOnce();
    expect(APP.querySelectorAll('.led-auth')).toHaveLength(1);
  });

  it('utiliza o novo símbolo no menu de todos os perfis sem mudar autenticação', () => {
    expect(mainScript).toContain('class="sidebrand matos-dashboard-brand"');
    expect(mainScript).toContain('class="logo matos-sidebar-mark" aria-hidden="true"');
    expect(mainScript).toContain("currentRole==='admin'?adminMenus");
    expect(mainScript).toContain("currentRole==='proprietario_consulta'?consultaMenus");
    expect(mainScript).toContain('currentRole=\'visitante\';currentProfile=null;render()');
    expect(mainScript).toContain("session.access_token");
  });

  it('anima apenas a identidade visual e respeita movimento reduzido', () => {
    expect(brandCss).toContain('html body .sidebrand.matos-dashboard-brand .logo');
    expect(brandCss).toContain("background-image:url('/matos-marca.svg?v=1')");
    expect(brandCss).toContain('.led-auth .matos-mark-frame img');
    expect(brandCss).toContain('@keyframes matos-mark-float');
    expect(brandCss).toContain('@keyframes matos-wordmark-enter');
    expect(brandCss).toContain('@keyframes matos-dialog-enter');
    expect(brandCss).toContain('@media(prefers-reduced-motion:reduce)');
    expect(brandCss).toContain('@media(max-width:760px)');
    expect(logoSvg).toContain('@media(prefers-reduced-motion:reduce)');
    expect(themeCss).not.toContain('/logo-casa-matos.png');
  });

  it('publica arquivos e versões atualizadas sem quebrar os outros módulos', () => {
    expect(html).toContain('<link rel="icon" href="/matos-marca.svg?v=1"');
    expect(html).toContain('/matos-brand.css?v=1');
    expect(html).toContain('/theme-led.css?v=8');
    expect(html).toContain('/theme-led.js?v=14');
    expect(html).toContain('/app1.js?v=20261113-4');
    expect(html).toContain('/access-management.js?v=1');
    expect(html).toContain('/monthly-report-pdf.js?v=3');
  });
});
