import { createDb, type Database } from './connection';

// D2: quina_platform se usa SOLO para escribir credit_rate_caps, que quina_app
// solo puede leer. Todo lo demás de la plataforma va con quina_app. ESLint
// impide importar este módulo fuera del repositorio de topes.
let instance: Database | undefined;

export function getPlatformDb(): Database {
  if (!instance) {
    const url = process.env.DATABASE_PLATFORM_URL;
    if (!url) throw new Error('Falta la variable de entorno DATABASE_PLATFORM_URL.');
    instance = createDb(url);
  }
  return instance;
}

export async function closePlatformDb(): Promise<void> {
  if (instance) {
    const current = instance;
    instance = undefined;
    await current.$client.end();
  }
}
