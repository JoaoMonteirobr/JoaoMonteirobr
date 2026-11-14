import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync(path.join(process.cwd(), 'iptu-annual.js'), 'utf8');
const exampleProperties = Array.from({ length: 21 }, (_, index) => ({
  id: 'imovel-' + String(index + 1),
  nome: 'Imóvel ' + String(index + 1),
}));
const paid = [1, 2, 3].map((id) => ({
  id: 'iptu-' + id,
  imovel_id: 'imovel-' + id,
  ano: 2026,
  situacao: 'pago',
  valor_total: 300,
}));

function harness() {
  const dom = new JSDOM('<div id="content"></div>');
  const storage = paid.map((item) => ({ ...item }));
  const openOriginal = vi.fn(async (_page, row) => {
    dom.window.document.querySelector('#modal')?.remove();
    const document = dom.window.document;
    const year = row?.ano ?? 2026;
    document.body.insertAdjacentHTML('beforeend',
      '<div class="modalbg" id="modal"><div class="modal"><div class="modalbody"><div class="formgrid">'
      + '<div class="field"><select id="f_ano"><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option></select></div>'
      + '<div class="field"><select id="f_imovel_id"><option value="">Selecione</option>'
      + exampleProperties.map((item) => '<option value="' + item.id + '">' + item.nome + '</option>').join('')
      + '</select></div>'
      + '<div class="field"><select id="f_situacao"><option value="pago">pago</option><option value="em_aberto">em_aberto</option></select></div>'
      + '<div class="field"><select id="f_modalidade"><option value="a_vista">a_vista</option><option value="parcelado">parcelado</option></select></div>'
      + '<div class="field"><input id="f_valor_total"></div>'
      + '<div id="formmsg"></div></div></div><button id="savemodal">Salvar</button></div></div>');
    document.getElementById('f_ano').value = String(year);
    document.getElementById('f_imovel_id').value = row?.imovel_id ?? '';
  });
  const saveOriginal = vi.fn(async () => {});
  const ctx = {
    document: dom.window.document,
    forms: { Imóveis: [['iptu_mensal', 'IPTU mensal']], IPTU: [] },
    columnsFor: () => [],
    formatCell: () => '',
    openForm: openOriginal,
    saveForm: saveOriginal,
    dash: async () => {},
    reports: async () => {},
    cache: { imoveis: exampleProperties, iptu: null },
    currentRole: 'admin',
    dbGet: vi.fn(async (table) => {
      if (table !== 'iptu') throw new Error('Tabela inesperada');
      ctx.cache.iptu = storage.map((item) => ({ ...item }));
      return ctx.cache.iptu;
    }),
    esc: (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
    lookupLabel: (_table, item) => item.nome,
    money: (value) => String(value),
    dateBR: (value) => value || '—',
  };
  ctx.window = ctx;
  vm.runInNewContext(source, ctx, { filename: 'iptu-annual.js' });
  const get = (id) => dom.window.document.getElementById(id);
  const optionIds = () => [...get('f_imovel_id').options].map((item) => item.value).filter(Boolean);
  return { dom, ctx, storage, get, optionIds, openOriginal, saveOriginal };
}

describe('IPTU anual sem seleção duplicada', () => {
  it('retira automaticamente os três IPTUs pagos em 2026 já cadastrados', async () => {
    const x = harness();
    await x.ctx.openForm('IPTU', null);
    const ids = x.optionIds();
    expect(ids).toHaveLength(18);
    for (const id of ['imovel-1', 'imovel-2', 'imovel-3']) expect(ids).not.toContain(id);
    expect(ids).toContain('imovel-4');
    expect(x.get('iptu_available_notice').textContent).toContain('3 pagos');
    expect(x.ctx.dbGet).toHaveBeenCalledWith('iptu');
    expect(x.get('savemodal').disabled).toBe(false);
  });

  it('separa corretamente os anos: pago em 2026 fica disponível em 2025', async () => {
    const x = harness();
    await x.ctx.openForm('IPTU', null);
    x.get('f_ano').value = '2025';
    x.get('f_ano').dispatchEvent(new x.dom.window.Event('change'));
    expect(x.optionIds()).toHaveLength(21);
    expect(x.optionIds()).toContain('imovel-1');
    expect(x.get('iptu_available_notice').textContent).toContain('2025');
    x.get('f_ano').value = '2026';
    x.get('f_ano').dispatchEvent(new x.dom.window.Event('change'));
    expect(x.optionIds()).toHaveLength(18);
  });

  it('mantém imóvel atual ao editar seu próprio IPTU pago e exclui os demais', async () => {
    const x = harness();
    await x.ctx.openForm('IPTU', paid[0]);
    expect(x.optionIds()).toContain('imovel-1');
    expect(x.get('f_imovel_id').value).toBe('imovel-1');
    expect(x.optionIds()).not.toContain('imovel-2');
    expect(x.get('savemodal').disabled).toBe(false);
    await x.ctx.saveForm('IPTU', 'iptu-1');
    expect(x.saveOriginal).toHaveBeenCalledOnce();
  });

  it('também retira os pendentes já cadastrados para evitar duplicidade anual', async () => {
    const x = harness();
    x.storage.push({
      id: 'iptu-4',
      imovel_id: 'imovel-4',
      ano: 2026,
      situacao: 'em_aberto',
    });
    await x.ctx.openForm('IPTU', null);
    expect(x.optionIds()).toHaveLength(17);
    expect(x.optionIds()).not.toContain('imovel-4');
    expect(x.get('iptu_available_notice').textContent).toContain('4 já cadastrados');
    expect(x.get('iptu_available_notice').textContent).toContain('3 pagos');
  });

  it('evita cadastro se outro usuário registrar o mesmo imóvel antes de salvar', async () => {
    const x = harness();
    await x.ctx.openForm('IPTU', null);
    x.get('f_imovel_id').value = 'imovel-5';
    x.storage.push({
      id: 'iptu-5', imovel_id: 'imovel-5', ano: 2026, situacao: 'pago',
    });
    await x.ctx.saveForm('IPTU', null);
    expect(x.saveOriginal).not.toHaveBeenCalled();
    expect(x.get('formmsg').textContent).toContain('já possui IPTU cadastrado');
    expect(x.optionIds()).not.toContain('imovel-5');
  });

  it('não bloqueia um imóvel livre em 2026', async () => {
    const x = harness();
    await x.ctx.openForm('IPTU', null);
    x.get('f_imovel_id').value = 'imovel-6';
    await x.ctx.saveForm('IPTU', null);
    expect(x.saveOriginal).toHaveBeenCalledOnce();
  });

  it('quando nenhum imóvel está disponível, desativa seleção e salvamento', async () => {
    const x = harness();
    for (let n = 4; n <= 21; n++) x.storage.push({
      id: 'iptu-' + n, imovel_id: 'imovel-' + n, ano: 2026, situacao: 'em_aberto',
    });
    await x.ctx.openForm('IPTU', null);
    expect(x.optionIds()).toHaveLength(0);
    expect(x.get('f_imovel_id').disabled).toBe(true);
    expect(x.get('savemodal').disabled).toBe(true);
    expect(x.get('iptu_available_notice').textContent).toContain('Todos os imóveis');
  });

  it('impede novo cadastro quando não consegue consultar dados atuais do servidor', async () => {
    const x = harness();
    x.ctx.dbGet = vi.fn(async () => { throw new Error('Sem conexão'); });
    await x.ctx.openForm('IPTU', null);
    expect(x.openOriginal).not.toHaveBeenCalled();
    expect(x.get('content').textContent).toContain('Não foi possível conferir');
  });

  it('mantém proteção única do banco e atualização do script no navegador', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    expect(source).toContain('recordedIptu(Number(ano.value),rows,id)');
    expect(source).toContain("await dbGet('iptu')");
    expect(source).toContain("window.saveForm=saveForm");
    expect(html).toContain('/iptu-annual.js?v=3');
  });
});
