'use client';

import { usePathname } from 'next/navigation';
import { Skeleton } from 'boneyard-js/react';
// Huesos capturados con `pnpm bones` (registra cada forma por nombre de ruta)
import '@/bones/registry';

/** Nombre de huesos por ruta: /customers/<uuid>/pay → "customers-id-pay"; / → "home". */
export function boneName(pathname: string): string {
  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => (/^[0-9a-f-]{20,}$/i.test(segment) ? 'id' : segment));
  return segments.length === 0 ? 'home' : segments.join('-');
}

/** Esqueleto de la ruta destino, para `loading.tsx`. */
export function RouteSkeleton() {
  return <PageSkeleton name={boneName(usePathname())} loading />;
}

/** Envuelve la página activa para que `pnpm bones` capture su forma real. */
export function RouteBones({ children }: { children: React.ReactNode }) {
  return (
    <PageSkeleton name={boneName(usePathname())} loading={false}>
      {children}
    </PageSkeleton>
  );
}

// Los tokens cambian con data-theme; Boneyard solo detecta la clase .dark, así que se le pasa la variable
const BONE = 'var(--color-paper-deep)';

/** Forma genérica mientras una pantalla aún no tiene huesos capturados (pnpm bones). */
function GenericSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6 motion-reduce:animate-none">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-48 rounded-full bg-paper-deep" />
        <div className="h-4 w-72 max-w-full rounded-full bg-paper-deep" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="h-28 rounded-card bg-paper-deep" />
        <div className="h-28 rounded-card bg-paper-deep" />
        <div className="h-28 rounded-card bg-paper-deep" />
      </div>
      <div className="h-64 rounded-card bg-paper-deep" />
    </div>
  );
}

/**
 * Esqueleto de pantalla (DESIGN.md §7.3). Con `loading={false}` envuelve la página
 * real para que `pnpm bones` capture su forma; en `loading.tsx` se usa con `loading`.
 */
export function PageSkeleton({
  name,
  loading,
  children,
}: {
  name: string;
  loading: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Skeleton
      name={name}
      loading={loading}
      color={BONE}
      darkColor={BONE}
      animate="pulse"
      select="viewport"
      fallback={<GenericSkeleton />}
    >
      {children ?? null}
    </Skeleton>
  );
}
