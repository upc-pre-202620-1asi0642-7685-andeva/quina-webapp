import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

/** Debe coincidir con `basePath` de next.config.ts. */
const BASE_PATH = '/app';

/**
 * `redirect` para Server Actions. Next 16 agrega `basePath` cuando la acción llega
 * por fetch (cabecera `Next-Action`), pero no cuando el formulario se envía antes
 * de cargar JavaScript: ese 303 apuntaría fuera de /app (action-handler.js). En ese
 * caso la ruta se completa aquí.
 */
export async function actionRedirect(path: string): Promise<never> {
  const viaFetch = (await headers()).has('next-action');
  redirect(viaFetch ? path : `${BASE_PATH}${path}`);
}
