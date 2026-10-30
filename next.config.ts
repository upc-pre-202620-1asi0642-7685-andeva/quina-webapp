import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/presentation/i18n/request.ts');

const nextConfig: NextConfig = {
  // La webapp vive en quina.andeva.tech/app; el sitio público ocupa la raíz.
  basePath: '/app',
  // next dev no reescribe AGENTS.md: la regla equivalente ya está en su sección 3.
  agentRules: false,
  experimental: {
    serverActions: {
      // El sitio público reenvía quina.andeva.tech/app/* con el Origin público.
      allowedOrigins: ['quina.andeva.tech'],
    },
  },
};

export default withNextIntl(nextConfig);
