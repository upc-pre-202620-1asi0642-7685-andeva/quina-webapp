'use client';

import { useEffect, useRef } from 'react';
import { sileo } from 'sileo';

/**
 * Aviso de Sileo para el resultado que una página recibe tras redirigir
 * (`?notice=created`). Sale una vez por montaje, también en el modo estricto.
 */
export function FlashToast({ type, title }: { type: 'success' | 'warning'; title: string }) {
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    sileo[type]({ title });
  }, [type, title]);
  return null;
}
