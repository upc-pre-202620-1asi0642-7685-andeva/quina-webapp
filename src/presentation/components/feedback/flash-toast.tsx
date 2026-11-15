'use client';

import { useEffect, useRef } from 'react';
import { sileo } from 'sileo';

/**
 * Aviso de Sileo para el resultado que una página recibe tras redirigir
 * (`?notice=created`). Sale una vez por aviso, también en el modo estricto; si la
 * misma página recibe otro aviso (observar y luego anular), ese también sale.
 */
export function FlashToast({ type, title }: { type: 'success' | 'warning'; title: string }) {
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (shown.current === type + title) return;
    shown.current = type + title;
    // Sileo reusa un solo id: sin limpiar, el aviso nuevo se funde con el anterior aún visible
    sileo.clear();
    sileo[type]({ title });
  }, [type, title]);
  return null;
}
