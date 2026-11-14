import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read=(name)=>fs.readFileSync(path.join(process.cwd(),name),'utf8');
const app=read('app1.js'),ui=read('simple-ui.js');
const finance=read('owner-finance.js'),files=read('property-files.js');
const index=read('index.html');
const disabled=['Repasses','Documentos','Vistorias'];

describe('pausa temporária de Repasses, Documentos e Vistorias',()=>{
  it('centraliza o estado das três abas para futura reativação',()=>{
    const start=app.indexOf('var adminMenus='),end=app.indexOf('var tables=',start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const config=new Function(app.slice(start,end)+';return {adminMenus,ownerMenus,tenantMenus,consultaMenus,matosPausedSections,isMatosSectionPaused};')();
    expect(config.matosPausedSections).toEqual(disabled);
    for (const name of disabled) expect(config.isMatosSectionPaused(name)).toBe(true);
    expect(config.isMatosSectionPaused('Pagamentos')).toBe(false);
    expect(config.isMatosSectionPaused('Relatórios')).toBe(false);
    for(const name of ['adminMenus','ownerMenus','tenantMenus','consultaMenus']){
      const visible=config[name].filter(x=>!config.isMatosSectionPaused(x));
      for(const off of disabled)expect(visible).not.toContain(off);
    }
  });
  it('oculta as abas em todos os perfis na interface atual',()=>{
    const start=ui.indexOf('var consultaMenus='),end=ui.indexOf('// Liga cada tela',start);
    const current=new Function('adminMenus','ownerMenus','tenantMenus',ui.slice(start,end)+';return {adminMain,consultaMenus,ownerMain,tenantMain};')([],[],[]);
    for(const menu of Object.values(current)){
      for(const name of disabled)expect(menu).not.toContain(name);
    }
    expect(current.consultaMenus).toContain('Pagamentos');
    expect(current.adminMain).toContain('Configurações');
    expect(current.consultaMenus).not.toContain('Configurações');
  });
  it('impede abrir aba pausada pelo menu, atalho ou carregamento direto',()=>{
    expect(app).toContain("function goQuick(p){page=isMatosSectionPaused(p)?'Dashboard':p;shell()}");
    expect(app).toContain('menus=menus.filter(function(x){return !isMatosSectionPaused(x)})');
    expect(app).toContain("if(isMatosSectionPaused(page)){page='Dashboard';return shell()}");
    expect(ui).toContain("if(isMatosSectionPaused(page)){page='Dashboard';return shell()}");
    expect(finance).toContain("if(!isMatosSectionPaused('Repasses'))");
    expect(finance).toContain("if(page==='Repasses'&&isMatosSectionPaused(page))");
    expect(files).toContain("if(isMatosSectionPaused(x))return");
    expect(files).toContain("if(isMatosSectionPaused(page)){page='Dashboard';return shell()}");
  });
  it('não remove código nem dados: módulos podem voltar a ser habilitados',()=>{
    expect(finance).toContain('async function repassesPage()');
    expect(files).toContain('async function documentosPage()');
    expect(files).toContain('async function vistoriasPage()');
    expect(ui).toContain('async function simpleReports()');
    expect(index).toContain('/app1.js?v=20261113-4');
    expect(index).toContain('/simple-ui.js?v=19');
    expect(index).toContain('/owner-finance.js?v=20261108-3');
    expect(index).toContain('/property-files.js?v=20261108-3');
  });
});