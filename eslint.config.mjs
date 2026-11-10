import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const DECIMAL_MODULE = 'src/core/domain/shared/decimal.ts';

const corePatterns = [
  {
    group: [
      'next',
      'next/*',
      'react',
      'react/*',
      'react-dom',
      'drizzle-orm',
      'drizzle-orm/*',
      'postgres',
      'better-auth',
      'better-auth/*',
      '@/infrastructure/*',
      '@/presentation/*',
      '@/app/*',
    ],
    message: 'src/core no puede depender de frameworks ni de capas externas.',
  },
];

export default defineConfig(
  globalIgnores([
    '.next/',
    'node_modules/',
    'drizzle/',
    'playwright-report/',
    'test-results/',
    'next-env.d.ts',
    '.claude/',
    '.agents/',
  ]),
  nextVitals,
  nextTs,
  {
    // Regla de dependencias (AGENTS.md, sección 4): el núcleo no conoce frameworks
    files: ['src/core/**/*.ts'],
    ignores: [DECIMAL_MODULE],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...corePatterns,
            {
              group: ['decimal.js'],
              message:
                'Usa Dec de @/core/domain/shared/decimal: es el único punto que conoce decimal.js.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [DECIMAL_MODULE],
    rules: { 'no-restricted-imports': ['error', { patterns: corePatterns }] },
  },
  {
    // D2: quina_platform solo escribe los topes del BCRP
    files: ['src/app/**', 'src/presentation/**', 'src/infrastructure/**'],
    ignores: ['src/infrastructure/db/repositories/drizzle-rate-cap-repository.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/infrastructure/db/platform-connection', '**/platform-connection'],
              message: 'quina_platform solo se usa en drizzle-rate-cap-repository.ts (D2).',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
