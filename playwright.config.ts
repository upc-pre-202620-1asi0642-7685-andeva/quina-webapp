import { defineConfig, devices } from '@playwright/test';

// Puerto propio para no chocar con otro servidor de desarrollo en el 3000
const port = 3100;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
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
  },
});
