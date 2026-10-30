import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

export default defineConfig(
  globalIgnores([
    '.next/',
    'node_modules/',
    'drizzle/',
    'playwright-report/',
    'test-results/',
    'next-env.d.ts',
    '.claude/',
  ]),
  nextVitals,
  nextTs,
  {
    // Regla de dependencias (AGENTS.md, sección 4): el núcleo no conoce frameworks
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
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
          ],
        },
      ],
    },
  },
  prettier,
);
