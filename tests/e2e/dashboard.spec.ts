import { expect, test } from '@playwright/test';
import { expectAccessible, isolateRateLimitIp, registerOwnerWithStore } from './support/flows';

test.describe('Dashboard Bento con widgets personalizables', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('el dueño ve sus widgets, personaliza orden/tamaño Bento y agrega nuevos widgets', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const isDesktop = testInfo.project.name === 'desktop';
    await registerOwnerWithStore(page);
    await page.goto('./');

    // Navegación llamada Dashboard en escritorio e Inicio (con ícono de casa) en móvil
    await expect(
      page.getByRole('link', { name: isDesktop ? 'Dashboard' : 'Inicio' }).first(),
    ).toBeVisible();

    const grid = page.getByRole('list', { name: 'Widgets del Dashboard' });
    for (const name of ['Accesos rápidos', 'Por cobrar', 'Caja de hoy', 'Plata en la calle']) {
      await expect(grid.getByRole('heading', { name })).toBeVisible();
    }
    await expect(grid.getByRole('heading', { name: 'Ingresos reales vs. Compras' })).toHaveCount(0);
    await expectAccessible(page);

    if (isDesktop) {
      // Popover de Notificaciones en escritorio despeja el borde inferior
      await page.getByRole('button', { name: 'Notificaciones' }).click();
      const notifDialog = page.getByRole('dialog');
      await expect(notifDialog).toBeVisible();
      const notifBox = await notifDialog.boundingBox();
      const viewport = page.viewportSize()!;
      expect(notifBox).not.toBeNull();
      expect(notifBox!.y + notifBox!.height).toBeLessThanOrEqual(viewport.height - 12);
      await page.keyboard.press('Escape');
    }

    // Personalizar: mover, redimensionar (en escritorio), quitar y agregar un widget nuevo
    await page.getByRole('button', { name: 'Personalizar' }).click();

    // El borde discontinuo (en <li>) queda alineado 1:1 con la tarjeta (<section>)
    const firstLiBox = await grid.locator('li').first().boundingBox();
    const firstSectionBox = await grid.locator('li > div > section').first().boundingBox();
    expect(firstLiBox).not.toBeNull();
    expect(firstSectionBox).not.toBeNull();
    expect(Math.abs(firstLiBox!.y - firstSectionBox!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(firstLiBox!.height - firstSectionBox!.height)).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: 'Subir Por cobrar' }).click();
    if (isDesktop) {
      // Tirador de esquina inferior derecha (Bento 2D): Caja de hoy pasa a 3x1 (Mediano) y Ventas de la semana a 2x2
      await page.getByTestId('resize-corner-cashToday').click();
      await page.getByTestId('resize-corner-salesWeek').click();
    }
    await page.getByRole('button', { name: 'Quitar Tu plan del Dashboard' }).click();
    await page.getByRole('button', { name: 'Agregar widget' }).click();
    await page.getByRole('button', { name: 'Agregar Ingresos reales vs. Compras' }).click();
    await page.keyboard.press('Escape');
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Listo' }).click();
    await expect(page.getByText('Tu Dashboard quedó guardado')).toBeVisible();
    await expect(grid.getByRole('heading', { name: 'Ingresos reales vs. Compras' })).toBeVisible();

    // Ningún <caption> accesible dentro de .sr-only debe pintarse visible encima de los gráficos
    const captions = grid.locator('.sr-only caption');
    const captionCount = await captions.count();
    expect(captionCount).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < captionCount; i++) {
      const box = await captions.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(2);
      expect(box!.height).toBeLessThanOrEqual(2);
    }

    await page.reload();
    const headings = grid.getByRole('heading', { level: 2 });
    await expect(headings.first()).toHaveText('Por cobrar');
    await expect(grid.getByRole('heading', { name: 'Tu plan' })).toHaveCount(0);
    await expect(grid.getByRole('heading', { name: 'Ingresos reales vs. Compras' })).toBeVisible();
    if (isDesktop) {
      const cashCard = grid.locator('li', { hasText: 'Caja de hoy' });
      await expect(cashCard).toHaveClass(/xl:col-span-2/);
      const salesWeekCard = grid.locator('li', { hasText: 'Ventas de la semana' });
      await expect(salesWeekCard).toHaveClass(/xl:row-span-2/);
    }
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`en móvil (390 px) el panel de Módulos se ve completo y accesible (${theme})`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'Solo aplica al proyecto móvil');
      test.setTimeout(120_000);
      await page
        .context()
        .addCookies([{ name: 'quina-theme', value: theme, url: 'http://localhost:3100' }]);
      await registerOwnerWithStore(page);
      await page.goto('./');

      await page.getByRole('button', { name: 'Módulos' }).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole('link', { name: 'Inicio' })).toBeVisible();

      for (const label of ['Ajustes', 'Suscripción', 'Perfil']) {
        const link = sheet.getByRole('link', { name: new RegExp(label) });
        await link.scrollIntoViewIfNeeded();
        await expect(link).toBeVisible();
        const box = await link.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(48);
      }

      await expectAccessible(page);
    });
  }

  test('stock bajo muestra cantidades sin ceros de más y los toasts largos no se salen de su píldora', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await registerOwnerWithStore(page);
    await page.goto('./inventory/new');

    await page.getByLabel('Nombre').fill('Aceite Primor 900mL');
    await page.getByLabel('Precio al contado').fill('9.50');
    await page.getByLabel('Precio al fiado').fill('10.50');
    await page.getByLabel('Stock inicial').fill('2');
    await page.getByLabel('Stock mínimo (opcional)').fill('10');
    await page.getByRole('button', { name: 'Registrar producto' }).click();

    const toastTitle = page.locator('[data-sileo-title]').first();
    await expect(toastTitle).toContainText('Aceite Primor 900mL');
    const toastBox = await page.locator('[data-sileo-toast]').first().boundingBox();
    const headerBox = await page.locator('[data-sileo-header]').first().boundingBox();
    const titleBox = await toastTitle.boundingBox();
    expect(toastBox).not.toBeNull();
    expect(headerBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect(toastBox!.width).toBeLessThanOrEqual(355);
    expect(headerBox!.width).toBeGreaterThanOrEqual(240);
    expect(titleBox!.x).toBeGreaterThanOrEqual(toastBox!.x);
    expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(toastBox!.x + toastBox!.width + 1);

    await page.goto('./');
    const lowStock = page.locator('section[aria-labelledby="widget-lowStock"]');
    await expect(lowStock.getByText('2 de 10 UND')).toBeVisible();
    await expect(lowStock.getByText('2.000 de 10.000 UND')).toHaveCount(0);
  });

  test('las migas de pan muestran dónde está y llevan de vuelta', async ({ page }) => {
    test.setTimeout(120_000);
    await registerOwnerWithStore(page);
    await page.goto('./inventory/purchases');

    const crumbs = page.getByRole('navigation', { name: 'Estás en' });
    await expect(crumbs.getByText('Compras')).toHaveAttribute('aria-current', 'page');
    await crumbs.getByRole('link', { name: 'Inventario' }).click();
    await expect(page).toHaveURL(/\/app\/inventory\/?$/);
    await expectAccessible(page);
  });
});
