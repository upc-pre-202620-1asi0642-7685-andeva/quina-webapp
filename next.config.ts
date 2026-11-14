import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/presentation/i18n/request.ts');

const nextConfig: NextConfig = {
  // La webapp vive en quina.andeva.tech/app; el sitio público ocupa la raíz.
  basePath: '/app',
  // next dev no reescribe AGENTS.md: la regla equivalente ya está en su sección 3.
  agentRules: false,
  // US22: el service worker vive en /app/sw.js pero controla también /app (la portada)
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/app' },
          { key: 'Cache-Control', value: 'no-cache' },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // El sitio público reenvía quina.andeva.tech/app/* con el Origin público.
      allowedOrigins: ['quina.andeva.tech'],
      // Imagen del catálogo de hasta 2 MB más los campos del formulario (US03 crit. 3)
      bodySizeLimit: '3mb',
    },
  },
};

export default withNextIntl(nextConfig);
