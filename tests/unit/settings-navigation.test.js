import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const js = read('simple-ui.js');

function sandbox(role = 'admin') {
  const dom = new JSDOM('<div id="app"><div id="content"></div></div>');
  const counts = { module: 0, accesses: 0, create: 0, accessSave: 0, shell: 0, pages: [] };
  const ctx = {
    document: dom.window.document,
    currentRole: role,
    page: 'Configurações',
    cache: {},
    tables: {},
    adminMenus: [],
    ownerMenus: [],
    tenantMenus: [],
    consultaMenus: [],
    isMatosSectionPaused: (name) => ['Repasses', 'Documentos', 'Vistorias'].includes(name),
    navIcon: () => '•',
    E: (id) => dom.window.document.getElementById(id),
    esc: (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
    setTimeout,
    modulePage: async () => {
      counts.module++;
      counts.pages.push(ctx.page);
      ctx.E('content').innerHTML = '<div class="panel"><input id="search" /><button type="button" id="newrec">+ Novo</button><div id="tbl">Tabela</div></div>';
      ctx.E('newrec').onclick = () => { counts.create++; };
      ctx.E('search').oninput = () => { ctx.E('tbl').textContent = 'Pesquisa ativa'; };
    },
    accesses: async () => {
      counts.accesses++;
      counts.pages.push(ctx.page);
      ctx.E('content').innerHTML = '<div class="panel"><button id="acc_save" type="button">Criar acesso</button></div>';
      ctx.E('acc_save').onclick = () => { counts.accessSave++; };
    },
    load: async () => {
      if (ctx.currentRole !== 'admin' && ctx.page === 'Configurações') {
        ctx.E('content').textContent = 'Configurações disponíveis somente para administradores.';
      }
    },
    shell: () => {
      counts.shell++;
      return ctx.load();
    },
  };
  ctx.window = ctx;
  vm.runInNewContext(js, ctx, { filename: 'simple-ui.js' });
  return { ctx, counts, dom };
}

describe('Configurações: cinco cadastros funcionais', () => {
  it('mostra os cinco cartões corretos sem usar cópias inertes de HTML', async () => {
    const { ctx, dom } = sandbox();
    await ctx.load();
    const sections = [...dom.window.document.querySelectorAll('[data-config]')].map((el) => el.dataset.config);
    expect(sections).toEqual(['Imóveis', 'Inquilinos', 'Contratos', 'Proprietários', 'Acessos']);
    expect(js).not.toContain("var html=E('content').innerHTML");
    expect(js).toContain("C.insertBefore(toolbar,C.firstChild)");
  });

  it('o clique em Imóveis conserva os eventos de pesquisa, cadastro e retorno', async () => {
    const { ctx, counts, dom } = sandbox();
    await ctx.load();
    dom.window.document.querySelector('[data-config="Imóveis"]').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(counts.pages.at(-1)).toBe('Imóveis');
    expect(ctx.MatosSettings.getActive()).toBe('Imóveis');
    expect(ctx.E('backSettings')).not.toBeNull();
    ctx.E('newrec').click();
    expect(counts.create).toBe(1);
    ctx.E('search').value = 'teste';
    ctx.E('search').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(ctx.E('tbl').textContent).toBe('Pesquisa ativa');
    await ctx.load(); // simula reabrir a lista após salvar ou excluir
    expect(ctx.E('backSettings')).not.toBeNull();
    ctx.E('newrec').click();
    expect(counts.create).toBe(2);
    ctx.E('backSettings').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ctx.page).toBe('Configurações');
    expect(ctx.MatosSettings.getActive()).toBeNull();
    expect(dom.window.document.querySelectorAll('[data-config]').length).toBe(5);
  });

  it.each(['Inquilinos', 'Contratos', 'Proprietários'])(
    'abre %s com os controles de cadastro ligados',
    async (section) => {
      const { ctx, counts } = sandbox();
      await ctx.load();
      await ctx.MatosSettings.open(section);
      expect(counts.pages.at(-1)).toBe(section);
      expect(ctx.E('backSettings')).not.toBeNull();
      ctx.E('newrec').click();
      expect(counts.create).toBe(1);
      await ctx.load();
      ctx.E('newrec').click();
      expect(counts.create).toBe(2);
    },
  );

  it('abre Acessos e mantém o botão de cadastrar após atualizar', async () => {
    const { ctx, counts } = sandbox();
    await ctx.load();
    await ctx.MatosSettings.open('Acessos');
    expect(ctx.E('acc_save')).not.toBeNull();
    ctx.E('acc_save').click();
    expect(counts.accessSave).toBe(1);
    await ctx.load();
    expect(ctx.E('backSettings')).not.toBeNull();
    ctx.E('acc_save').click();
    expect(counts.accessSave).toBe(2);
    expect(read('app3.js')).toContain("if(page==='Acessos')load()");
  });

  it('bloqueia acesso à área administrativa para proprietário', async () => {
    const { ctx, counts } = sandbox('proprietario_consulta');
    await ctx.load();
    expect(ctx.E('content').textContent).toMatch(/somente para administradores/i);
    await ctx.MatosSettings.open('Imóveis');
    expect(counts.module).toBe(0);
    expect(ctx.MatosSettings.getActive()).toBeNull();
  });

  it('inclui validação de dados, preserva seleções existentes e atualiza caches', () => {
    const enhancements = read('enhancements.js');
    const app2 = read('app2.js');
    const html = read('index.html');
    expect(enhancements).toContain("if(obj.taxa_administracao==null)obj.taxa_administracao=10");
    expect(enhancements).toContain("if(obj.aluguel_base==null)obj.aluguel_base=0");
    expect(enhancements).toContain("if(p==='Inquilinos'&&!obj.status)obj.status='ativo'");
    expect(enhancements).toContain("if(!obj.status)obj.status=obj.data_inicio>");
    expect(enhancements).toContain('if(current&&vals.indexOf(current)<0)vals.push(current)');
    expect(app2).toContain("'Imóveis':'imóvel'");
    expect(app2).toContain("'Contratos':'contrato'");
    expect(html).toContain('/simple-ui.js?v=17');
    expect(html).toContain('/app2.js?v=20261108-2');
    expect(html).toContain('/enhancements.js?v=20261108-2');
  });
});
