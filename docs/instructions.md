# Documentación para el repositorio de la webapp

Esta carpeta reúne **todo lo que el repositorio `quina-webapp` necesita** para
construir la webapp de Quina sin perder consistencia con el sitio público.
La webapp vive en `https://quina.andeva.tech/app` (login en `/app/login`,
registro en `/app/register`): no es un dominio nuevo, es una ruta dentro del
subdominio de Quina, como hace Google con `gemini.google.com`.

La fuente canónica de los documentos de producto y de la webapp es el
repositorio `quina-docs`; estas son sus copias con los enlaces ajustados a una
sola carpeta. Si cambias algo, actualiza ambos lugares.

---

## Qué contiene y dónde va en `quina-webapp`

| Archivo | Destino en `quina-webapp` | Para qué sirve |
| :--- | :--- | :--- |
| `AGENTS-webapp.md` | `AGENTS.md` (raíz) + un `CLAUDE.md` con `@AGENTS.md` | Reglas de trabajo para los agentes: URLs, arquitectura, datos, idiomas, calidad y git. |
| `DESIGN.md` | `DESIGN.md` (raíz) | Sistema visual de la webapp: tokens, tema oscuro, tipografía, componentes, estados y accesibilidad. |
| `styles/globals.css` | `src/presentation/styles/globals.css` | Tokens de Quina para Tailwind 4 y el mapeo de las variables de shadcn/ui. |
| `branding/*.svg`, `*.png`, `*.ico` | `public/brand/` | Isologos, isotipos, favicon e íconos de la PWA. |
| `branding/albert-sans/*.woff2` | `src/presentation/fonts/` | Albert Sans variable, cargada con `next/font/local`. |
| `quina-webapp-documentation.md` | `docs/` | Arquitectura, stack, seguridad, URLs bajo `/app`, idiomas y proceso diario. |
| `quina-database-schema.md` | `docs/` | Las 35 tablas, DDL, RLS, roles y configuración de Better Auth. |
| `quina-user-stories.md` | `docs/` | Las 27 historias con sus criterios de aceptación (base de cada plan). |
| `project-statement.md` | `docs/` | Enunciado del curso: reglas financieras obligatorias. |
| `quina-documentation.md` | `docs/` | Documento maestro del producto. |
| `pricing-strategy.md` | `docs/` | Planes, límites y prueba Pro. |
| `feature-prioritization.md` | `docs/` | Prioridad de cada característica. |
| `product-marketing.md` | `docs/` | Público, voz y lenguaje del comerciante. |

**No se copian:** las guías del informe académico (`report-guidelines.md`,
`tables-figures-apa-7-guidelines.md`), la documentación del sitio y los CSS
antiguos de `quina-docs/frontend-documentation/styles/`, que reemplaza
`styles/globals.css`. El `design-system.md` original tampoco: `DESIGN.md` toma
sus tokens y resuelve sus diferencias con el sitio.

---

## Orden de lectura para un agente

1. `AGENTS.md` y `DESIGN.md`.
2. `docs/quina-webapp-documentation.md` (empezar por la sección 0).
3. `docs/quina-database-schema.md`.
4. `docs/project-statement.md` y `docs/quina-user-stories.md` (solo las historias del plan en curso).
5. El resto de `docs/` cuando una decisión de producto lo requiera.

---

## Cómo construir la webapp: un plan por rebanada vertical

Cada plan entrega una funcionalidad completa (dominio → casos de uso → base de
datos → pantalla → pruebas) que se puede probar y mostrar.

| Plan | Qué construye | Historias |
| :---: | :--- | :--- |
| 0 | **Fundaciones:** repo, Next.js con `basePath: '/app'`, tokens y shadcn, next-intl, Drizzle con la migración completa (roles, RLS, triggers), Better Auth (registro y login del dueño), Vitest y Playwright, CI, despliegue y rewrite desde el sitio. | US24, US02 (base), US27 (base) |
| 1 | **Motor financiero** en TypeScript puro, sin interfaz ni base de datos, con los 2 juegos de datos del enunciado. | US09, cálculos de US10 y US13 |
| 2 | **Tienda y vecinos:** empleados, clientes con consentimiento, condiciones de crédito. | US01, US04, US05, US06, US26 (base) |
| 3 | **Mostrador:** catálogo, venta al contado y fiado en 3 toques. | US03, US07, US08 |
| 4 | **Corte y cobranza:** proceso diario, resumen de cargos, recordatorios, pagos y mora. | US10, US11, US12, US13 |
| 5 | **Portal del vecino.** | US14 |
| 6 | **Inventario y auditoría.** | US15, US16, US17, US18 |
| 7 | **SaaS:** Mercado Pago, prueba Pro, límites de plan. | US23, US25, US26 |
| 8 | **Analítica y cierre:** cartera, IA, Nuevo RUS, PWA. | US19, US20, US21, US22 |

### Plantilla para pedir cada plan

> Lee `AGENTS.md`, `DESIGN.md` y `docs/`. Planifica el **plan 3: Mostrador**, con
> las historias US03, US07 y US08.
> - **Alcance:** dominio, casos de uso, repositorios Drizzle con `withTenant`,
>   Server Actions, pantallas y mensajes en es/en/qu.
> - **Fuera de alcance:** kardex con costo promedio (US16) y corte (US10).
> - **Hecho cuando:** cada criterio de aceptación tiene su prueba (unitaria con
>   repositorios en memoria y e2e con Playwright); pasan `pnpm check`, `pnpm lint`,
>   `pnpm test` y `pnpm test:e2e`; y la revisión de `DESIGN.md` (sección 12) está
>   hecha en 390 px y 1440 px, en ambos temas.
> - **Antes de escribir código:** dime qué decisiones necesitas que tome yo.
