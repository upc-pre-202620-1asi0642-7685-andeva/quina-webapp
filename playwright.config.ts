import { defineConfig, devices } from '@playwright/test';

// Puerto propio para no chocar con otro servidor de desarrollo en el 3000
const port = 3100;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  expect: {
    timeout: 15_000,
  },
  use: {
    // basePath '/app': las rutas de las pruebas son relativas a esta URL
    baseURL: `http://localhost:${port}/app/`,
    // Navegador de un comerciante peruano: Accept-Language es-PE
    locale: 'es-PE',
    trace: 'on-first-retry',
  },
  // DESIGN.md, sección 5: primero el celular (390 px) y luego escritorio (1440 px)
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: process.env.CI ? `pnpm start --port ${port}` : `pnpm dev --port ${port}`,
    url: `http://localhost:${port}/app`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      APP_URL: process.env.APP_URL ?? `http://localhost:${port}/app`,
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgres://quina_app:quina_app_test@localhost:54329/quina_test',
      EMAIL_TRANSPORT: process.env.EMAIL_TRANSPORT ?? 'outbox',
      // Imágenes del catálogo en public/uploads, nunca en el bucket real
      STORAGE_TRANSPORT: process.env.STORAGE_TRANSPORT ?? 'local',
      EMAIL_FROM: process.env.EMAIL_FROM ?? 'Quina <hola@andeva.tech>',
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? 'test-secret-e2e-con-32-caracteres-o-mas-ok',
      NEXT_PUBLIC_TURNSTILE_SITE_KEY:
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA',
      TURNSTILE_SECRET_KEY:
        process.env.TURNSTILE_SECRET_KEY ?? '1x0000000000000000000000000000000AA',
      GOOGLE_CLIENT_ID:
        process.env.GOOGLE_CLIENT_ID ?? 'test-google-client.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? 'test-google-client-secret',
    },
  },
});
