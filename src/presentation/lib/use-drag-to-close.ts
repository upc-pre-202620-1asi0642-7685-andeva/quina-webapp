'use client';

import { useRef, useState } from 'react';

/**
 * Arrastre 1:1 con captura de puntero y proyección de velocidad (apple-design §2, §5, §6):
 * un gesto rápido hacia abajo cierra la hoja aunque el recorrido sea corto.
 */
export function useDragToClose(onClose: () => void) {
  const [dy, setDy] = useState(0);
  const start = useRef<{ y: number; t: number } | null>(null);

  return {
    dy,
    handlers: {
      onPointerDown: (event: React.PointerEvent) => {
        if (
          (event.target as HTMLElement).closest(
            'button, a, input, select, textarea, [role="button"]',
          )
        ) {
          return;
        }
        start.current = { y: event.clientY, t: event.timeStamp };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event: React.PointerEvent) => {
        if (start.current) setDy(Math.max(0, event.clientY - start.current.y));
      },
      onPointerUp: (event: React.PointerEvent) => {
        if (!start.current) return;
        const distance = event.clientY - start.current.y;
        const velocity = distance / Math.max(1, event.timeStamp - start.current.t);
        start.current = null;
        setDy(0);
        // Proyección exponencial (apple-design §6): distancia + velocidad proyectada
        if (distance > 96 || velocity > 0.5) onClose();
      },
      onPointerCancel: () => {
        start.current = null;
        setDy(0);
      },
    },
  };
}
