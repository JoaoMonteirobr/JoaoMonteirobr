import { test, expect } from '@playwright/test';

test('shell da aplicação carrega sem tela branca', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/Matos/i);
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('body')).not.toHaveText('Application error');
  expect(errors).toEqual([]);
});
