'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { SIZE_TO_COLS, type WidgetCols, type WidgetRows, type WidgetSize } from './widgets';

export type WidgetDimensions = {
  size: WidgetSize;
  cols: WidgetCols;
  rows: WidgetRows;
};

const WidgetSizeContext = createContext<WidgetDimensions>({
  size: 'sm',
  cols: 1,
  rows: 1,
});

/** Comparte las dimensiones Bento 2D resueltas del widget para adaptar gráficos y densidad sin latencia. */
export function WidgetSizeProvider({
  size,
  cols,
  rows = 1,
  children,
}: {
  size: WidgetSize;
  cols?: WidgetCols;
  rows?: WidgetRows;
  children: ReactNode;
}) {
  return (
    <WidgetSizeContext.Provider value={{ size, cols: cols ?? SIZE_TO_COLS[size], rows }}>
      {children}
    </WidgetSizeContext.Provider>
  );
}

/** Tamaño Bento de ancho actual (`sm`, `md` o `lg`) del widget que contiene al componente. */
export function useWidgetSize(): WidgetSize {
  return useContext(WidgetSizeContext).size;
}

/** Dimensiones 2D (`size`, `cols`, `rows`) del widget que contiene al componente. */
export function useWidgetDimensions(): WidgetDimensions {
  return useContext(WidgetSizeContext);
}
