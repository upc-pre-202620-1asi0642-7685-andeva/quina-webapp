# AGENTS.md - Quina Webapp

Guía para agentes de IA (Claude Code, Codex, Gemini, etc.) y personas que
trabajen en este repositorio. Léela antes de proponer o aplicar cambios.

Quina es una webapp que ordena el fiado de las bodegas y comercios de barrio
del Perú. Este repositorio es **solo la webapp**. El sitio público es otro
repositorio (`quina-website`).

---

## 1. Dónde vive: `quina.andeva.tech/app`

Quina es un producto de Andeva en el subdominio `quina.andeva.tech`, como
`gemini.google.com` lo es de Google. El sitio público ocupa la raíz y **esta
webapp ocupa la ruta `/app`**:

- Webapp: `https://quina.andeva.tech/app`
- Iniciar sesión: `https://quina.andeva.tech/app/login`
- Registrarse: `https://quina.andeva.tech/app/register`

No existe un dominio ni un subdominio propio para la webapp. Next.js usa
`basePath: '/app'` y toda URL absoluta sale de `APP_URL`. El detalle está en
`docs/quina-webapp-documentation.md`, secciones 0 y 9.

---

## 2. Principio: coherencia antes que parches

El sistema visual está en [`DESIGN.md`](DESIGN.md) y es obligatorio. Antes de
aplicar un pedido de diseño, entiende la intención, evalúalo frente a
`DESIGN.md`, adáptalo a sus tokens y componentes, y si rompe la coherencia dilo
con claridad y ofrece una alternativa. **La última palabra es del usuario.**

Señales de alerta: dos estilos para el mismo componente, colores en hexadecimal
dentro de componentes, una segunda tipografía o set de íconos, textos de interfaz
fuera de los mensajes de idioma.

---

## 3. Stack y comandos

- **Next.js** (App Router, `basePath: '/app'`) con **React** y **TypeScript** en
  modo estricto.
- **Tailwind CSS 4** + **shadcn/ui** ajustado a los tokens de Quina.
- **next-intl** para castellano, inglés y quechua.
- **Drizzle ORM** sobre **Supabase PostgreSQL**; **Better Auth** para
  autenticación.
- **Resend** (correos), **Mercado Pago** (suscripciones), **Groq** (IA),
  **Cloudflare Turnstile** (bots), **Supabase Storage** (archivos).
- **Vitest** (unitarias con repositorios en memoria) y **Playwright** (e2e y
  accesibilidad con axe en ambos temas).
- **pnpm** siempre. Nunca `npm` ni `yarn`; usa `pnpm dlx` en lugar de `npx`.
- **Next.js 16** cambia APIs y convenciones respecto de versiones anteriores. Antes
  de escribir código de Next, consulta la guía incluida en
  `node_modules/next/dist/docs/` y respeta sus avisos de obsolescencia.

Scripts esperados (se crean en el plan de fundaciones):

```bash
pnpm dev            # http://localhost:3000/app
pnpm build
pnpm check          # tipos
pnpm lint
pnpm format
pnpm test           # Vitest
pnpm test:e2e       # Playwright (e2e y accesibilidad)
pnpm db:generate    # Drizzle Kit: genera migraciones
pnpm db:migrate     # Drizzle Kit: aplica migraciones
pnpm db:roles       # Activa LOGIN y contraseñas de quina_app y quina_platform desde .env
pnpm test:db        # Pruebas de integración contra un PostgreSQL real
```

---

## 4. Arquitectura

Clean Architecture con la regla de dependencias hacia adentro
(`docs/quina-webapp-documentation.md`, secciones 1 y 5):

- `src/core/domain`: entidades, objetos de valor y fórmulas financieras. **Sin
  imports** de Next.js, React, Drizzle ni de ninguna librería de infraestructura.
- `src/core/application`: casos de uso que solo conocen los puertos del dominio.
- `src/infrastructure`: Drizzle, Better Auth, Resend, Storage, Mercado Pago, Groq.
- `src/presentation`: rutas, Server Actions, componentes, estilos e idiomas.

Cada funcionalidad se construye como una **rebanada vertical** (dominio → casos de
uso → infraestructura → pantalla → pruebas), nunca por capas sueltas.

---

## 5. Reglas de datos y seguridad

- **Toda** operación de negocio corre dentro de `withTenant(storeId, ...)`, que
  fija `app.current_store_id` para RLS. La app se conecta con el rol `quina_app`,
  que no salta RLS. Nunca uses el rol `postgres` en tiempo de ejecución.
- La Data API de Supabase está cerrada; no se usa `supabase-js` para leer o
  escribir tablas (solo Storage, desde el servidor).
- **Dinero:** las columnas `NUMERIC` llegan como texto; se convierten al objeto de
  valor `Money` del dominio. Nunca uses `number` de JavaScript para montos.
- **Fechas:** se guardan en UTC; los días de corte, pago y mora se calculan en
  `America/Lima`.
- **Tablas inmutables** (ventas, pagos, kardex, auditoría, consentimientos,
  anulaciones de cargos): solo
  `INSERT`. Las correcciones son movimientos de ajuste.
- El esquema solo cambia con migraciones de Drizzle Kit, nunca a mano en el
  panel de Supabase.
- Las Server Actions verifican sesión, rol (US05) y límites del plan (US26) antes
  de cualquier mutación, y validan la entrada con Zod.

---

## 6. Idiomas

- Castellano, inglés y quechua con `next-intl`; los textos viven en
  `messages/es.json`, `en.json` y `qu.json`.
- El idioma no va en la URL. Se resuelve con `users.preferred_locale`, luego la
  cookie `quina-lang` (compartida con el sitio) y luego el navegador.
- El quechua es un **borrador** pendiente de revisión por un traductor nativo.

---

## 7. Contenido

- Usa el lenguaje del comerciante peruano: casero, vecino, fiado, fecha de corte,
  plata en la calle. Evita la jerga bancaria en la interfaz
  (`docs/product-marketing.md`).
- **No inventes pruebas:** ni testimonios, ni logos de clientes, ni cifras que no
  estén en `docs/`.
- Las reglas financieras salen del enunciado (`docs/project-statement.md`) y de
  las historias de usuario; ante una duda, pregunta antes de inventar una regla.

---

## 8. Calidad antes de terminar

1. `pnpm format`, `pnpm check` y `pnpm lint` sin errores.
2. `pnpm test` y `pnpm test:e2e` en verde (accesibilidad en tema claro y oscuro).
3. Cada criterio de aceptación de las historias trabajadas tiene su prueba.
4. Revisión visual en celular (390 px) y escritorio (1440 px), en ambos temas,
   con la lista de `DESIGN.md`, sección 12.

---

## 9. Git y despliegue

- **Commits:** Conventional Commits en inglés (`feat(credit): register credit sale`).
  Menciona las historias en el cuerpo (`Refs: US08`).
- **Ramas:** git-flow. `main` es producción y `develop` es integración; el trabajo
  va en `feature/<nombre>`. Versiones SemVer sin prefijo `v`.
- **Despliegue:** Vercel (plan Hobby, proyecto académico). El sitio reenvía
  `quina.andeva.tech/app/*` a este proyecto.
