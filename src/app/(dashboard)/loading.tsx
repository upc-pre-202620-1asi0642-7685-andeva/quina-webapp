import { RouteSkeleton } from '@/presentation/components/feedback/page-skeleton';

// Un solo límite para todo el panel: la URL ya cambió, así que el esqueleto sale de la ruta destino
export default function Loading() {
  return <RouteSkeleton />;
}
