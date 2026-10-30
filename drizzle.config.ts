import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Drizzle Kit usa la conexión directa con el rol postgres (puerto 5432).
// La aplicación nunca usa esta URL: se conecta como quina_app (DATABASE_URL).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/db/schema',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_MIGRATION_URL ?? '',
  },
  strict: true,
  verbose: true,
});
