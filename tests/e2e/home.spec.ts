import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark'] as const) {
  test.describe(`inicio sin sesión en tema ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
    });

    test('redirige / hacia /app/login con el tema y el idioma esperados', async ({ page }) => {
      await page.goto('./');
      await expect(page).toHaveURL(/\/app\/login\/?$/);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('html')).toHaveAttribute('lang', 'es');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Entra a tu bodega' }),
      ).toBeVisible();
    });

    test('no tiene violaciones de accesibilidad (WCAG 2.1 AA)', async ({ page }) => {
      await page.goto('./');
      await expect(page).toHaveURL(/\/app\/login\/?$/);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  });
}

test('usa el idioma de la cookie quina-lang compartida con el sitio', async ({ page, context }) => {
  await context.addCookies([{ name: 'quina-lang', value: 'en', url: 'http://localhost:3100' }]);
  await page.goto('./');
  await expect(page).toHaveURL(/\/app\/login\/?$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sign in to your store' }),
  ).toBeVisible();
});
