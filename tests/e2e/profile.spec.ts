import { expect, test } from '@playwright/test';
import {
  acceptInvite,
  expectAccessible,
  isolateRateLimitIp,
  registerOwnerWithStore,
  signIn,
  STRONG_PASSWORD,
  uniqueEmail,
} from './support/flows';

test.describe('módulo de perfil, subpantallas, RBAC y accesibilidad (US02, US05, US27)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('edita datos personales con deshacer, cambia preferencias de tema e idioma, cambia contraseña y cierra sesión', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const { email, storeName } = await registerOwnerWithStore(page);

    await page.goto('./profile');
    await expect(page).toHaveURL(/\/app\/profile/);
    await expect(page.getByRole('heading', { level: 1, name: 'Carmen Rojas' })).toBeVisible();

    // Deshacer cambios y guardar datos personales
    const nameInput = page.getByLabel('Nombre completo');
    const phoneInput = page.getByLabel('Celular de contacto (opcional)');
    await nameInput.fill('Carmen Elena');
    await phoneInput.fill('987654321');
    await page.getByRole('button', { name: 'Deshacer cambios' }).click();
    await expect(nameInput).toHaveValue('Carmen Rojas');
    await expect(phoneInput).toHaveValue('');

    await nameInput.fill('Carmen Elena');
    await phoneInput.fill('987 654 321');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Carmen Elena' })).toBeVisible();

    // Subpantalla Preferencias: tema + idioma
    await page.goto('./profile/preferences');
    await expect(page).toHaveURL(/\/app\/profile\/preferences/);
    await page.getByRole('radio', { name: /Oscuro/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('radio', { name: /Claro/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('radio', { name: /English/ }).click();
    await page
      .getByRole('button', { name: 'Save language' })
      .or(page.getByRole('button', { name: 'Guardar idioma' }))
      .click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Quina language' })).toBeVisible();

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'quina-lang')?.value).toBe('en');

    // Cambiar las cookies del sitio después no pisa las preferencias guardadas de la webapp
    await page.context().addCookies([
      { name: 'quina-lang', value: 'es', url: 'http://localhost:3100' },
      { name: 'quina-theme', value: 'dark', url: 'http://localhost:3100' },
    ]);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // Subpantalla Seguridad y sesiones: cambio de contraseña inline + sesión actual
    await page.goto('./profile/security');
    await expect(page.getByRole('heading', { name: 'Password' })).toBeVisible();
    await expect(page.getByText('Current session')).toBeVisible();

    const nextPassword = 'Bodega#2027y';
    await page.getByLabel('Current password').fill(STRONG_PASSWORD);
    await page.getByLabel('New password').fill(nextPassword);
    await page.getByLabel('Repeat password').fill(nextPassword);
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByText('Your password was updated.')).toBeVisible();

    // Volver a /profile y cerrar sesión (el botón atrás no muestra el panel)
    await page.goto('./profile');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/app\/login/);

    await page.goBack();
    await expect(page).toHaveURL(/\/app\/login/);
    await expect(page.getByRole('heading', { name: storeName })).toHaveCount(0);

    // Verificar que la nueva contraseña funciona
    await signIn(page, email, nextPassword);
    await expect(page).toHaveURL(/\/app\/?$/);
  });

  test('RBAC en /profile/access y tarjeta de tienda en la barra lateral', async ({ page }) => {
    test.setTimeout(150_000);
    const { storeName } = await registerOwnerWithStore(page);
    const isDesktop = (page.viewportSize()?.width ?? 0) >= 1024;

    if (isDesktop) {
      await expect(
        page.getByRole('complementary').getByRole('link', { name: new RegExp(storeName) }),
      ).toHaveAttribute('href', /\/app\/settings$/);
    }

    // Dueño en /profile/access ve su rol y permisos sin duplicar Ajustes
    await page.goto('./profile/access');
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: `Dueño en ${storeName}` })).toBeVisible();
    await expect(main.getByText('Solo tú como dueño')).toBeVisible();
    await expect(main.getByText('Empleado de mostrador')).toBeVisible();
    await expect(main.getByRole('link', { name: 'Gestionar equipo' })).toHaveAttribute(
      'href',
      /\/app\/team$/,
    );
    await expect(main.getByRole('link', { name: /Ajustes de la tienda/ })).toHaveCount(0);
    await expect(main.getByRole('link', { name: /Suscripción/ })).toHaveCount(0);
    await expect(main.getByRole('link', { name: /Auditoría/ })).toHaveCount(0);

    // Invitar empleado
    const employee = uniqueEmail('emp-prof');
    await page.goto('./team');
    await page.getByRole('button', { name: 'Invitar empleado' }).first().click();
    await page.getByLabel('Nombre', { exact: true }).fill('Luis Vega');
    await page.getByLabel('Correo', { exact: true }).fill(employee);
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText(`Invitación enviada a ${employee}.`)).toBeVisible();

    await page.context().clearCookies();
    await acceptInvite(page, employee);
    await signIn(page, employee);
    await expect(page).toHaveURL(/\/app\/?$/);

    if (isDesktop) {
      await expect(
        page.getByRole('complementary').getByRole('link', { name: new RegExp(storeName) }),
      ).toHaveCount(0);
      await expect(page.getByRole('complementary').getByText(storeName).first()).toBeVisible();
    }

    // Empleado en /profile/access solo ve su rol y matriz de mostrador
    await page.goto('./profile/access');
    await expect(main.getByRole('heading', { name: `Empleado en ${storeName}` })).toBeVisible();
    await expect(main.getByText('Lo que puedes hacer')).toBeVisible();
    await expect(main.getByText('Reservado para el dueño')).toBeVisible();
    await expect(main.getByRole('link', { name: 'Gestionar equipo' })).toHaveCount(0);
  });

  for (const viewport of [
    { width: 390, height: 844, label: 'mobile' },
    { width: 1440, height: 900, label: 'desktop' },
  ]) {
    test(`accesibilidad WCAG 2.1 AA y sin desbordamiento horizontal en ${viewport.label}`, async ({
      page,
    }) => {
      test.setTimeout(150_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await registerOwnerWithStore(page);

      for (const route of [
        './profile',
        './profile/security',
        './profile/preferences',
        './profile/access',
      ]) {
        await page.goto(route);
        const noOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        );
        expect(noOverflow, `overflow en ${route} (${viewport.label})`).toBe(true);
        await expectAccessible(page);
      }
    });
  }
});
