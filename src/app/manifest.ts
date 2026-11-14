import type { MetadataRoute } from 'next';

// US22 crit. 1 y 3. Las rutas del manifest no reciben el basePath: van con /app escrito.
// El alcance es "/app" (sin barra) para incluir la portada, que Next sirve en /app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/app',
    name: 'Quina',
    short_name: 'Quina',
    description: 'Ordena el fiado de tu bodega: ventas, cobros y deudas en un solo lugar.',
    lang: 'es-PE',
    start_url: '/app',
    scope: '/app',
    display: 'standalone',
    // --color-paper y --color-primary de DESIGN.md (aquí no llegan los tokens CSS)
    background_color: '#f8f8fa',
    theme_color: '#2bdd66',
    icons: [
      { src: '/app/brand/pwa-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app/brand/pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/app/brand/pwa-icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
