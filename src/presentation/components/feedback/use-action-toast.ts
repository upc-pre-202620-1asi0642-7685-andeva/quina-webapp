'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { sileo } from 'sileo';

export type ActionToast = {
  type: 'success' | 'warning' | 'error';
  title: string;
  description?: string;
} | null;

/**
 * Avisa con Sileo el resultado de una Server Action (DESIGN.md §7.3). `useActionState`
 * devuelve un objeto nuevo por envío, así que el aviso sale una vez por envío.
 */
export function useActionToast(state: unknown, toast: ActionToast) {
  const latest = useRef(toast);
  // Corre antes del efecto de abajo: el aviso usa el texto del mismo render
  useLayoutEffect(() => {
    latest.current = toast;
  });

  useEffect(() => {
    const current = latest.current;
    if (current) sileo[current.type]({ title: current.title, description: current.description });
  }, [state]);
}
