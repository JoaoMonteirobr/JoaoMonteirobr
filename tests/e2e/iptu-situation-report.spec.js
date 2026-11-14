import { expect, test } from '@playwright/test';

test('IPTU: emite PDF de saldos pendentes sem alterar dados de produção', async ({ page }) => {
  // O PR ainda não está na produção. O teste funcional completo usa o build local
  // com Supabase simulado; a suíte original testa separadamente o site público.
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), 'Emissão é testada no build local com API simulada.');
  const uid = '00000000-0000-4000-8000-000000000001';
  await page.addInitScript((id) => {
    localStorage.setItem('matos_session', JSON.stringify({
      access_token: 'token-simulado-playwright',
      user: { id, email: 'teste@example.invalid' },
    }));
  }, uid);
  await page.route('https://behmmbgbrsesxthsczdl.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    const respond = (value) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(value),
    });
    if (url.pathname === '/auth/v1/user') return respond({ id: uid, email: 'teste@example.invalid' });
    if (url.pathname === '/rest/v1/perfis') return respond([{ user_id: uid, nome: 'Teste de qualidade', role: 'admin' }]);
    if (url.pathname === '/rest/v1/imoveis') return respond([
      { id: 'p1', nome: 'Loja Azul' },
      { id: 'p2', nome: 'Sala Verde' },
      { id: 'p3', nome: 'Galpão Laranja' },
    ]);
    if (url.pathname === '/rest/v1/iptu') return respond([
      { id: 'a', imovel_id: 'p1', ano: 2026, modalidade: 'parcelado', valor_total: 400, numero_parcelas: 4, parcelas_pagas: 3, valor_parcela: 100, situacao: 'em_aberto' },
      { id: 'b', imovel_id: 'p2', ano: 2026, modalidade: 'a_vista', valor_total: 600, situacao: 'pago' },
      { id: 'c', imovel_id: 'p3', ano: 2026, modalidade: 'parcelado', valor_total: 300, numero_parcelas: 3, parcelas_pagas: null, valor_parcela: 100, situacao: 'em_aberto' },
    ]);
    return respond([]);
  });
  await page.goto('/');
  await expect(page.locator('#content')).toBeVisible();
  await page.evaluate(() => window.goQuick('IPTU'));
  await expect(page.locator('#isr-panel')).toBeVisible();
  await expect(page.locator('#isr-preview')).toContainText('Parcialmente pago');
  await expect(page.locator('#isr-preview')).toContainText('A conferir');
  await expect(page.locator('#isr-preview')).toContainText('R$');

  await page.locator('#isr-filter').selectOption('pendentes');
  await expect(page.locator('#isr-preview')).not.toContainText('Sala Verde');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#isr-download').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('MATOS_IPTU_Situacao_2026_pendentes.pdf');
  await expect(page.locator('#isr-message')).toContainText('Relatório emitido');
});
