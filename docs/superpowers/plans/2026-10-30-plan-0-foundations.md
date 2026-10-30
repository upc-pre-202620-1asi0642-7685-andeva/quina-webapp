# Plan 0 (Fundaciones), parte 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Al aprobarse, este archivo se copia a `docs/superpowers/plans/2026-10-30-plan-0-foundations.md`.

**Goal:** Completar el Plan 0: esquema de 35 tablas con migración segura (roles, RLS, triggers), `withTenant`, Better Auth con registro autoservicio del dueño (US24 completa), autenticación US02 completa con Google, idioma con selector (US27 base), CI y despliegue bajo `quina.andeva.tech/app`.

**Architecture:** Rebanada vertical: dominio puro (`TaxId`, `PasswordPolicy`, `AccountLockoutPolicy`) → caso de uso `RegisterStoreUseCase` con puertos → Drizzle + Better Auth + correo (Resend / buzón de archivos para pruebas) → pantallas con Server Actions → Vitest (unitarias en memoria), Vitest de integración contra PostgreSQL real (RLS) y Playwright con axe.

**Tech Stack:** Next 16.4 (App Router, `basePath: '/app'`, `proxy.ts`), React 19, TS 6 estricto, Tailwind 4 + shadcn, next-intl 4, Drizzle 0.45 + drizzle-kit 0.31 + postgres-js, Better Auth 1.7 (+ emailOTP, captcha, nextCookies), `@node-rs/argon2`, Resend, `@marsidev/react-turnstile`, `@zxcvbn-ts/core`, Zod 4, React Hook Form, Sileo, Vitest 5, Playwright 1.64 + axe.

**Spec:** `docs/instructions.md` (Plan 0), `docs/quina-webapp-documentation.md` §0, 3, 5, 7, 9, 10; `docs/quina-database-schema.md` §3–6; `docs/quina-user-stories.md` US02, US24, US27 (+ US01 crit. 5 en lo que toca el login); `DESIGN.md`; `AGENTS.md`.

## Decisiones del usuario (2026-10-30)
1. Rol temporal `PENDING_OWNER` (sin tienda) hasta completar la tienda; luego `STORE_OWNER` en la misma transacción. Vale para correo y Google.
2. Migración crea `quina_app` y `quina_platform` **NOLOGIN sin contraseña**; `pnpm db:roles` les da LOGIN + contraseña desde `.env`.
3. El proceso diario usa `quina_app` + `withTenant` por tienda (el cron en sí es Plan 4). *Ajuste tras la revisión:* no hace falta la función `SECURITY DEFINER`: `stores` no tiene RLS y `quina_app` ya la lee (`SELECT id FROM stores WHERE is_active`).
4. Alcance: US02 completa (incluye cambio de correo con OTP), Google OAuth, prueba Pro de 14 días en el alta, selector de idioma en el perfil.

## Revisión cruzada (Claude + Gemini 4 Argon High)
Gemini revisó en 3 partes (BD/RLS, historias/UX/CI/despliegue; la de Better Auth se quedó sin tiempo y la verificó Claude contra `node_modules/better-auth@1.7.11`: todas las opciones existen). Incorporado: bloqueo `FOR UPDATE` del usuario en el alta; UUID de tienda generado en la app; `audit_logs` con `store_id` NULL sin `RETURNING`; `search_path` seguro; dos URLs de prueba; CI con rol migrador **no superusuario** (como Supabase) para no dar falso verde; verificación temprana de `BYPASSRLS` en Supabase; pruebas que faltaban (OTP 15 min / 5 intentos / 60 s, Argon2id, `rate_limits`, reset 30 min, paridad de mensajes, idioma al registrarse, Google→`PENDING_OWNER`, vínculo de cuentas); ayuda en cada campo, `inputMode`, ver/ocultar clave 44 px, Google como `secondary`, `aria-live`, Turnstile en recuperación; un solo campo de nombre; `serverActions.allowedOrigins` y `trustedOrigins` para el rewrite; variables de build en CI. Descartado: quitar `FORCE ROW LEVEL SECURITY` (inocuo y está en el esquema).

## Global Constraints
- pnpm siempre (`pnpm dlx`, nunca npx). Node ≥ 22.12.
- Rutas en código sin prefijo; URLs absolutas desde `APP_URL` (`https://quina.andeva.tech/app`; local `http://localhost:3000/app`, e2e `http://localhost:3100/app`).
- `src/core/domain` sin imports de Next, React, Drizzle ni librerías de infraestructura.
- Toda operación de negocio en `withTenant(storeId, …)`; la app conecta como `quina_app` (nunca `postgres` en runtime).
- Dinero `NUMERIC` como texto; fechas `TIMESTAMPTZ` UTC; zona de negocio `America/Lima`.
- Tablas inmutables: solo INSERT (trigger `forbid_mutation`).
- Esquema solo con migraciones de Drizzle Kit.
- Server Actions: sesión → rol → (plan) → Zod, antes de mutar.
- Textos solo en `messages/{es,en,qu}.json`; qu es borrador. Montos/fechas `es-PE`.
- DESIGN.md: solo tokens, Lucide 20 px, botones 44/56 px, etiqueta + ayuda en cada campo, errores bajo el campo, una acción verde por pantalla, WCAG AA en ambos temas.
- Contraseña: ≥ 8, 1 mayúscula, 1 número, 1 símbolo; Argon2id `memoryCost: 65536, timeCost: 3, parallelism: 4`.
- OTP 6 dígitos, 15 min, 5 intentos, reenvío cada 60 s. Reset 30 min, un solo uso. Bloqueo: 5 fallos → 15 min.
- Prueba Pro: `plan_tier='BODEGA_PRO'`, `status='TRIALING'`, `trial_ends_at = now + 14 días`.
- Commits: Conventional Commits en inglés, cuerpo con `Refs: USxx`.

## Review Focus
1. **Correo ya usado con Google y luego registro con contraseña (o al revés):** no se crea un segundo usuario; mensaje claro "Ese correo ya tiene cuenta. Ingresa". → Task 8.
2. **Doble envío de "Crear mi tienda" (dos pestañas o doble toque):** una sola tienda; el segundo envío ve su tienda, no un error 500. → Task 6.
3. **RUC/DNI con espacios o guiones (`20 123456789`, `4567-8901`):** se normaliza a dígitos; longitud incorrecta da error que dice cómo corregir. → Task 2.
4. **Bloqueo en el borde:** el intento 5 bloquea; a los 15 min exactos se puede ingresar; un login correcto antes del 5.º reinicia el contador; el login correcto durante el bloqueo también se rechaza. → Task 2 y Task 7.
5. **Usuario `PENDING_OWNER` o sin verificar navega a `/` o `/profile`:** se le lleva a `/register/verify` o `/register/store`, nunca ve el panel. → Task 9.

---

## Estructura de archivos

```
src/core/domain/shared/result.ts                 Result<T,E>
src/core/domain/identity/tax-id.ts               TaxId (RUC/DNI)
src/core/domain/identity/password-policy.ts      PasswordPolicy
src/core/domain/identity/account-lockout.ts      AccountLockoutPolicy
src/core/domain/identity/roles.ts                Role union, incl. PENDING_OWNER
src/core/domain/ports/store-registration-repository.ts
src/core/domain/ports/auth-mailer.ts
src/core/application/identity/register-store.ts  RegisterStoreUseCase
src/infrastructure/db/schema/{identity,credit,catalog,sales,notifications,audit,index}.ts
src/infrastructure/db/connection.ts              db (postgres-js, prepare:false)
src/infrastructure/db/with-tenant.ts             withTenant, Tx
src/infrastructure/db/repositories/drizzle-store-registration-repository.ts
src/infrastructure/email/{resend-auth-mailer,outbox-auth-mailer,auth-mailer-factory,templates}.ts
src/infrastructure/auth/{auth,lockout-hooks,auth-client}.ts
src/app/api/auth/[...all]/route.ts
src/proxy.ts
src/presentation/auth/session.ts                 getSessionUser, requireOwner
src/presentation/actions/{register,locale}.ts
src/presentation/validation/auth-schemas.ts      Zod compartido cliente/servidor
src/presentation/components/auth/*               AuthShell, FormField, OtpInput, PasswordStrength, TurnstileField, GoogleButton
src/app/(auth)/login, (auth)/register, (auth)/register/verify, (auth)/register/store,
src/app/auth/forgot-password, src/app/auth/reset-password, src/app/(dashboard)/page.tsx, (dashboard)/profile
drizzle/0000_*.sql (generada), drizzle/0001_security.sql (custom)
scripts/db-roles.ts
tests/unit/**, tests/fakes/**, tests/integration/** (vitest.integration.config.ts), tests/e2e/**, tests/e2e/support/outbox.ts
.github/workflows/ci.yml
```

---

### Task 1: Documentación y variables alineadas con las decisiones

**Files:** Modify `docs/quina-database-schema.md` (§3.1 users, §5.1, §5.4, §6), `docs/quina-webapp-documentation.md` (§3 versiones, §9 variables, §11.1 rol del cron), `.env.example`, `AGENTS.md` §3 (scripts nuevos). Memoria del proyecto.

- [ ] Añadir `PENDING_OWNER` al CHECK de `users.role` y a `chk_users_store_role` (`PENDING_OWNER` ⇒ `store_id IS NULL`).
- [ ] §5.1: roles creados NOLOGIN en migración; contraseñas con `pnpm db:roles`; `ALTER DEFAULT PRIVILEGES FOR ROLE postgres`.
- [ ] §11.1 (webapp-doc): el cron lista `stores` activas como `quina_app` y aplica `withTenant` por tienda.
- [ ] §6: `baseURL` = origen, `basePath: '/app/api/auth'` (Better Auth reemplaza basePath con la ruta de baseURL); `role.defaultValue: 'PENDING_OWNER'`.
- [ ] §3: Next 16, TS 6, PostgreSQL 17.
- [ ] `.env.example`: `QUINA_APP_DB_PASSWORD`, `QUINA_PLATFORM_DB_PASSWORD`, `EMAIL_TRANSPORT` (`resend` | `outbox`), `EMAIL_FROM` (`Quina <hola@andeva.tech>`), `DATABASE_TEST_URL` (propietario: migra y limpia) y `DATABASE_TEST_APP_URL` (`quina_app`: prueba RLS).
- [ ] Guardar las 4 decisiones en la memoria del proyecto.
- [ ] Commit `docs: align schema and auth docs with plan 0 decisions` (`Refs: US02, US24`).

### Task 2: Dominio de identidad

**Files:** Create `src/core/domain/shared/result.ts`, `src/core/domain/identity/{tax-id,password-policy,account-lockout,roles}.ts`; Test `tests/unit/identity/{tax-id,password-policy,account-lockout}.spec.ts`.

**Interfaces (Produces):**
- `type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }`, `ok(v)`, `err(e)`.
- `type Role = 'PLATFORM_ADMIN' | 'STORE_OWNER' | 'STORE_EMPLOYEE' | 'CUSTOMER' | 'PENDING_OWNER'`.
- `TaxId.parse(raw: string): Result<TaxId, 'TAX_ID_INVALID'>`; `TaxId { type: 'RUC' | 'DNI'; number: string }`. Quita espacios y guiones; 11 dígitos → RUC, 8 → DNI.
- `PasswordPolicy.check(pw: string): Result<void, PasswordRule[]>`, `PasswordRule = 'MIN_LENGTH' | 'UPPERCASE' | 'NUMBER' | 'SYMBOL'`.
- `AccountLockoutPolicy`: `MAX_FAILED_ATTEMPTS = 5`, `LOCK_MINUTES = 15`; `isLocked(state: { lockedUntil: Date | null }, now: Date): boolean` (estricto `now < lockedUntil`); `onFailure(state: { failedAttempts: number }, now): { failedAttempts: number; lockedUntil: Date | null; justLocked: boolean }`; `onSuccess(): { failedAttempts: 0; lockedUntil: null }`.

- [ ] Tests: `TaxId.parse('20 123456789')` → RUC `20123456789`; `'4567-8901'` → DNI; `'123'`, `'abcdefghijk'` → error. `PasswordPolicy.check('bodega')` devuelve las 4 reglas faltantes salvo las cumplidas; `'Bodega2026!'` ok. Lockout: 4.º fallo sin bloqueo, 5.º `justLocked` y `lockedUntil = now+15min`; `isLocked` a `lockedUntil` exacto → false; un milisegundo antes → true.
- [ ] Ejecutar `pnpm test` → FAIL; implementar; `pnpm test` → PASS.
- [ ] Commit `feat(identity): add tax id, password and lockout policies` (`Refs: US02, US24`).

### Task 3: Esquema Drizzle de las 35 tablas + migración generada

**Files:** Create `src/infrastructure/db/schema/{identity,credit,catalog,sales,notifications,audit}.ts`; Modify `src/infrastructure/db/schema/index.ts`; Generate `drizzle/0000_*.sql`; Test `tests/unit/db/schema.spec.ts`.

- Transcribir el DDL de `quina-database-schema.md` §4 (con el cambio de Task 1): columnas `snake_case` en SQL, `camelCase` en TS, `check()`, `unique()`, índices de §4 (31), FKs `onDelete` exactas. Claves TS de las tablas de Better Auth con los nombres que exige (`emailVerified`, `expiresAt`, `accountId`, `providerId`…). Export de tablas con nombres plurales (`users`, `sessions`, `accounts`, `verifications`, `rateLimits`) para `usePlural`.
- [ ] Test: `getTableConfig` sobre todos los exports `PgTable` → exactamente 35 nombres y coinciden con la lista del §3; `users` tiene el check `chk_users_store_role`.
- [ ] `pnpm db:generate` produce `0000`; revisar que no haya `DROP`.
- [ ] `pnpm check` y `pnpm test` → PASS.
- [ ] Commit `feat(db): define drizzle schema for the 35 tables` (`Refs: US24`).

### Task 4: Migración de seguridad, `db:roles`, conexión y `withTenant`

**Files:** Create `drizzle/0001_security.sql` (vía `pnpm drizzle-kit generate --custom --name security`), `scripts/db-roles.ts`, `src/infrastructure/db/{connection,with-tenant}.ts`, `vitest.integration.config.ts`, `tests/integration/{setup,security}.spec.ts`; Modify `package.json` scripts (`db:roles`, `test:db`).

**Interfaces (Produces):**
- `db` (drizzle + postgres-js, `DATABASE_URL`, `prepare: false`).
- `type Tx`; `withTenant<T>(storeId: string, work: (tx: Tx) => Promise<T>): Promise<T>` (`set_config('app.current_store_id', storeId, true)`).

Contenido de `0001_security.sql` (idempotente):
1. `forbid_mutation()` + los 10 triggers del §4.
2. `app_current_store_id()` y RLS + `FORCE` + política `tenant_isolation` para las 25 tablas de §5.4 + `notification_logs` y `audit_logs`.
3. Roles: `DO` que crea `quina_app NOLOGIN NOBYPASSRLS` y `quina_platform NOLOGIN BYPASSRLS` si no existen; GRANTs de §5.1; `REVOKE INSERT, UPDATE, DELETE ON credit_rate_caps, rus_categories FROM quina_app`; `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO quina_app, quina_platform`.
4. `REVOKE` a `anon`/`authenticated` dentro de un `DO` que solo corre si esos roles existen (Supabase; en el Postgres de CI no existen).
5. `app_current_store_id()` con `SET search_path = pg_catalog, public`.

`scripts/db-roles.ts`: con `DATABASE_MIGRATION_URL`, `ALTER ROLE quina_app LOGIN PASSWORD $QUINA_APP_DB_PASSWORD` (igual para platform); falla si falta la variable; nunca imprime la contraseña.

- [ ] **Primer paso, antes de escribir la migración:** en el proyecto Supabase de desarrollo, como `postgres`, probar `CREATE ROLE quina_probe NOLOGIN BYPASSRLS; DROP ROLE quina_probe;`. Si falla (Gemini sostiene que solo un superusuario puede; Claude cree que en PG 16+ basta `CREATEROLE` + `BYPASSRLS`), `quina_platform` se crea `NOBYPASSRLS` y el panel de plataforma usará políticas propias en su plan; avisar al usuario.
- [ ] Tests de integración (`pnpm test:db`, `vitest.integration.config.ts` con `fileParallelism: false`). `setup`: con `DATABASE_TEST_URL` hace `DROP SCHEMA public CASCADE; CREATE SCHEMA public` (las tablas inmutables no se limpian con DELETE), `migrate`, `db:roles`; las pruebas se conectan con `DATABASE_TEST_APP_URL` (`quina_app`) y usan ids aleatorios por prueba:
  - `select from customers` sin `withTenant` → 0 filas.
  - Tienda A no ve unidades de B; insertar con `store_id` de B dentro de `withTenant(A)` → error RLS.
  - `UPDATE audit_logs` → error `forbid_mutation`.
  - `INSERT rus_categories` como `quina_app` → permiso denegado.
  - `quina_app` lista `stores` activas sin contexto de tienda (base del cron).
  - `INSERT audit_logs` con `store_id` NULL sin contexto → permitido (sin `RETURNING`).
  - `users` con `PENDING_OWNER` + `store_id` → viola check; `STORE_OWNER` sin `store_id` → viola check.
  - Una tabla creada después por una migración nueva queda con permisos para `quina_app` (default privileges).
- [ ] Ejecutar → FAIL; implementar; → PASS. Volver a correr `migrate` sobre la misma BD → sin errores (idempotencia).
- [ ] Commit `feat(db): add rls, roles and immutability migration` (`Refs: US24`).

### Task 5: Correo de autenticación (puerto + Resend + buzón de archivos)

**Files:** Create `src/core/domain/ports/auth-mailer.ts`, `src/infrastructure/email/{resend-auth-mailer,outbox-auth-mailer,auth-mailer-factory,templates}.ts`, `tests/e2e/support/outbox.ts`; Modify `messages/*.json` (namespace `Email`); Test `tests/unit/email/*.spec.ts`.

**Interfaces (Produces):**
- `interface AuthMailer { sendVerificationOtp(i: { to: string; otp: string; locale: Locale }): Promise<void>; sendPasswordReset(i: { to: string; url: string; locale: Locale }): Promise<void>; sendLockoutAlert(i: { to: string; locale: Locale }): Promise<void> }`
- `getAuthMailer(): AuthMailer` (`EMAIL_TRANSPORT`; `outbox` prohibido si `VERCEL_ENV === 'production'`).
- Outbox: escribe `.outbox/<timestamp>-<to>.json` `{ to, kind, otp?, url?, locale }` (`.outbox/` en `.gitignore`).
- `readLatestMail(to: string, kind): Promise<OutboxMail>` en `tests/e2e/support/outbox.ts` (reintenta hasta 5 s).
- Plantillas con `createTranslator` de next-intl por `locale`; HTML mínimo con marca verde.

- [ ] Tests: outbox escribe y `readLatestMail` lo lee; plantilla `qu` usa textos qu; factory lanza en producción con `outbox`.
- [ ] Commit `feat(email): add auth mailer with resend and outbox adapters` (`Refs: US02, US27`).

### Task 6: Caso de uso `RegisterStoreUseCase` + repositorio Drizzle

**Files:** Create `src/core/domain/ports/store-registration-repository.ts`, `src/core/application/identity/register-store.ts`, `src/infrastructure/db/repositories/drizzle-store-registration-repository.ts`, `tests/fakes/in-memory-store-registration-repository.ts`; Test `tests/unit/identity/register-store.spec.ts`, `tests/integration/register-store.spec.ts`.

**Interfaces:**
- Consumes: `TaxId`, `Result` (Task 2), `withTenant` (Task 4).
- Produces:
  - `RegisterStoreInput { userId: string; commercialName: string; businessTurn: string; taxId: string; ownerFullName: string; contactEmail: string; ip?: string; userAgent?: string; now: Date }`
  - `RegisterStoreError = 'TAX_ID_INVALID' | 'TAX_ID_TAKEN' | 'EMAIL_TAKEN' | 'USER_NOT_PENDING'`
  - `RegisterStoreUseCase.execute(i): Promise<Result<{ storeId: string }, RegisterStoreError>>`
  - Puerto: `findUserRole(userId)`, `taxIdExists(n)`, `contactEmailExists(e)`, `createStoreForOwner(data): Promise<{ storeId } | 'TAX_ID_TAKEN' | 'EMAIL_TAKEN' | 'ALREADY_OWNER'>` (traduce `unique_violation` 23505).
- Si el usuario ya es `STORE_OWNER` devuelve su `storeId` (idempotente, Review Focus 2).
- `storeId = crypto.randomUUID()` en la app; toda la operación dentro de `withTenant(storeId, tx => …)`: `SELECT role, store_id FROM users WHERE id = $1 FOR UPDATE` (si ya es `STORE_OWNER` → devuelve su tienda) → `INSERT stores (id = storeId)` → `store_subscriptions` (BODEGA_PRO, TRIALING, `trial_ends_at = now+14d`) → `units` UND (Unidad, sin decimales), KG (Kilogramo, decimales), LTR (Litro, decimales) → `audit_logs` `CREATE_STORE` → `UPDATE users SET role='STORE_OWNER', store_id=storeId`.
- `ownerFullName` sale de `users.name` (no se vuelve a pedir).

- [ ] Unit (fake): ok crea todo; RUC duplicado → `TAX_ID_TAKEN`; correo de contacto duplicado → `EMAIL_TAKEN`; usuario ya dueño → mismo `storeId`; `TaxId` inválido → `TAX_ID_INVALID`; `trial_ends_at` = `now + 14 días` exacto.
- [ ] Integración: tras `execute`, como `quina_app` en `withTenant` hay 1 suscripción TRIALING, 3 unidades, 1 audit; dos `execute` concurrentes del mismo usuario → una sola tienda.
- [ ] Commit `feat(identity): register store with pro trial in one transaction` (`Refs: US24`).

### Task 7: Configuración de Better Auth + bloqueo de cuentas

**Files:** Create `src/infrastructure/auth/{auth,lockout-hooks,auth-client}.ts`, `src/app/api/auth/[...all]/route.ts`; Test `tests/integration/auth.spec.ts`.

- `auth.ts` según `quina-database-schema.md` §6, con: `baseURL: new URL(APP_URL).origin`, `basePath: '/app/api/auth'`, `trustedOrigins: [origin de APP_URL]` (las peticiones llegan por el rewrite con el `Origin` público), `advanced.database.generateId: false`, `user.additionalFields.role.defaultValue: 'PENDING_OWNER'`, `emailOTP({ …, overrideDefaultEmailVerification: true, sendVerificationOnSignUp: true, changeEmail: { enabled: true } })`, `captcha({ provider: 'cloudflare-turnstile', endpoints: ['/sign-up/email', '/sign-in/email', '/request-password-reset'] })`, `rateLimit: { enabled: true, storage: 'database' }`, `account.accountLinking: { enabled: true, trustedProviders: ['google'] }`, `revokeSessionsOnPasswordReset: true`, `databaseHooks.user.create.before` que fija `preferredLocale` desde la cookie `quina-lang`. **magicLink queda fuera** (portal, Plan 5). Verificar cada nombre de opción contra `node_modules/better-auth` instalado.
- `lockout-hooks.ts`: `hooks.before` en `/sign-in/email` rechaza con `APIError('FORBIDDEN', { code: 'ACCOUNT_LOCKED' })` si `AccountLockoutPolicy.isLocked`; también rechaza si `users.is_active = false` o la tienda está inactiva (US01 crit. 5). `hooks.after`: éxito → `onSuccess` + `last_login_at`; fallo de credenciales → `onFailure`, y si `justLocked` → `sendLockoutAlert` + `audit_logs LOCK_ACCOUNT` (store_id del usuario o NULL). Reset de contraseña exitoso → `onSuccess`.
- `auth-client.ts`: `createAuthClient({ basePath: '/app/api/auth', plugins: [emailOTPClient()] })`.

- [ ] Integración (`auth.api.*` con test DB, Turnstile secreto de prueba `1x0000000000000000000000000000000AA`, outbox): registro deja `PENDING_OWNER` sin verificar y con `preferred_locale` = cookie `quina-lang` enviada; `accounts.password` empieza con `$argon2id$v=19$m=65536,t=3,p=4`; sign-in antes de verificar → rechazado; verificar OTP del outbox → ok; OTP con `expires_at` adelantado 15 min → rechazado; 5 OTP erróneos invalidan el código; un usuario creado por el flujo social (`internalAdapter.createOAuthUser` o equivalente) nace `PENDING_OWNER` con correo verificado; registro con contraseña para un correo que ya tiene cuenta Google → error, sin segundo usuario; hay filas en `rate_limits` tras varios sign-in; cambio de correo con OTP actualiza `users.email`; 5 contraseñas malas → 6.º intento con la correcta → `ACCOUNT_LOCKED` y hay correo de alerta; tras adelantar `locked_until` al pasado → ingresa y el contador vuelve a 0; `signOut` borra la fila de `sessions`; cookie `HttpOnly`, `SameSite=Lax`, `Path=/` (y `Secure` en https).
- [ ] Commit `feat(auth): configure better auth with otp, captcha and lockout` (`Refs: US02`).

### Task 8: Pantallas de registro e ingreso

Usar la skill `ui-ux-pro-max` para revisar cada pantalla contra DESIGN.md.

**Files:** Create `src/presentation/validation/auth-schemas.ts`, `src/presentation/components/auth/{auth-shell,form-field,otp-input,password-strength,turnstile-field,google-button}.tsx`, `src/presentation/actions/register.ts`, `src/app/(auth)/{login,register,register/verify,register/store}/page.tsx`; Modify `messages/*.json` (`Auth`, `Register`); Test `tests/unit/validation/auth-schemas.spec.ts`, `tests/e2e/{register,login}.spec.ts`.

**Interfaces:**
- Consumes: `RegisterStoreUseCase` (Task 6), `auth`/`authClient` (Task 7), `PasswordPolicy`, `TaxId` (Task 2).
- Produces: `accountSchema`, `storeSchema`, `loginSchema` (Zod; mensajes = claves i18n); `completeStoreAction(formData): Promise<ActionState>` (sesión → rol `PENDING_OWNER` o `STORE_OWNER` → Zod → caso de uso → redirect `/`).
- Flujo: `/register` (nombre completo, correo, contraseña con `PasswordStrength` zxcvbn ≥ 3 + reglas, Turnstile, "Continuar con Google") → `/register/verify` (OTP 6 casillas, `inputMode="numeric"`, `autocomplete="one-time-code"`, reenvío con cuenta regresiva de 60 s) → `/register/store` (nombre comercial, giro [bodega, botica, carnicería, panadería, otro], RUC/DNI con `inputMode="numeric"`; titular = nombre del usuario, correo de contacto = el del usuario) → `/`.
- Cada campo: etiqueta, ayuda (`FormField` la enlaza con `aria-describedby` junto al error) y error que dice cómo corregir. Contraseña con botón ver/ocultar de 44 × 44 px. "Continuar con Google" es `secondary`; la única acción `primary` es el envío. Contador de reenvío y fuerza de contraseña con `aria-live="polite"`. `/login`: correo, contraseña, Turnstile, Google, enlace a recuperar; mensaje de bloqueo de §7.4 exacto. Google: `callbackURL` según rol.
- Errores: correo existente (Review Focus 1) → "Ese correo ya tiene cuenta. Ingresa"; RUC/DNI tomado; sin pedir datos de pago.

- [ ] Unit: esquemas aceptan/rechazan los mismos casos que el dominio; `tests/unit/i18n/messages.spec.ts`: `es`, `en` y `qu` tienen exactamente las mismas claves y `qu` conserva `_draft`; `formatDate(new Date('2026-11-13T05:00:00Z'))` → `13 nov 2026` (es-PE, America/Lima) en cualquier idioma, usado para "Prueba Pro hasta …".
- [ ] e2e (`EMAIL_TRANSPORT=outbox`, claves de prueba de Turnstile `1x00000000000000000000AA`; cada prueba usa correo y RUC únicos para correr en paralelo en 390 y 1440): registro completo con OTP del outbox llega a `/` mostrando el nombre de la tienda y "Prueba Pro: 14 días"; correo repetido → mensaje; RUC repetido → mensaje; 5 fallos → mensaje de bloqueo; botón Google navega a `accounts.google.com` (interceptado, sin seguir); axe sin violaciones en cada pantalla en tema claro y oscuro; proyectos 390 y 1440.
- [ ] Commit `feat(auth): add registration and login screens` (`Refs: US02, US24, US27`).

### Task 9: Protección de rutas, recuperación de contraseña, perfil e idioma

**Files:** Create `src/proxy.ts`, `src/presentation/auth/session.ts`, `src/presentation/actions/locale.ts`, `src/app/auth/{forgot-password,reset-password}/page.tsx`, `src/app/(dashboard)/{layout,page}.tsx`, `src/app/(dashboard)/profile/page.tsx`; Modify `src/presentation/i18n/request.ts` (pasar `userPreference`), `src/app/page.tsx` (eliminar marcador; `/` pasa a `(dashboard)`), `tests/e2e/home.spec.ts` (ahora `/` sin sesión → `/login`), `messages/*.json`, `next.config.ts` (`experimental.serverActions.allowedOrigins: ['quina.andeva.tech']`); Test `tests/unit/auth/route-guard.spec.ts`, `tests/e2e/{recovery,profile,guard}.spec.ts`.

**Interfaces (Produces):**
- `getSessionUser(): Promise<SessionUser | null>`; `SessionUser { id; email; emailVerified; role: Role; storeId: string | null; preferredLocale: Locale }`.
- `requireOwner(): Promise<SessionUser & { storeId: string }>`.
- `nextRouteFor(user: SessionUser | null, path: string): string | null` (pura, testeable): sin sesión → `/login`; sin verificar → `/register/verify`; `PENDING_OWNER` → `/register/store`; `STORE_OWNER` en rutas de auth → `/`.
- `proxy.ts`: chequeo optimista con `getSessionCookie` (excluye `api`, `_next`, `brand`, archivos); la verificación real en `(dashboard)/layout.tsx` con `nextRouteFor`.
- `setLocaleAction(locale)`: Zod → `users.preferred_locale` → cookie `quina-lang` (`path=/`, 1 año, `SameSite=Lax`).
- Recuperación: con Turnstile; respuesta siempre igual (texto de §7.6); reset invalida sesiones y reinicia bloqueo.
- Perfil: selector de idioma y cambio de correo con OTP (US02 crit. 2), cerrar sesión.

- [ ] Unit: tabla de casos de `nextRouteFor` (Review Focus 5).
- [ ] e2e: recuperación con correo inexistente y existente muestran el mismo texto; enlace del outbox cambia la contraseña y el enlace usado una 2.ª vez falla; (integración) token con `expires_at` adelantado 30 min → rechazado; perfil cambia a `en` y la interfaz y la cookie cambian; logout y "atrás" no muestran el panel; axe en ambos temas.
- [ ] Commit `feat(auth): add route guard, password recovery and language selector` (`Refs: US02, US27`).

### Task 10: CI

**Files:** Create `.github/workflows/ci.yml`.
- Disparo: `push` a `develop`/`main`, `pull_request`. Node 22, pnpm (versión de `packageManager`), cache.
- Servicio `postgres:17` con `options: --health-cmd pg_isready --health-interval 5s --health-retries 10`. Un paso previo crea el rol `migrator NOSUPERUSER CREATEROLE BYPASSRLS LOGIN` dueño del esquema `public`, para que la migración corra con los mismos límites que `postgres` en Supabase (evita falso verde). Env: `DATABASE_MIGRATION_URL`/`DATABASE_TEST_URL` como `migrator`, `DATABASE_URL`/`DATABASE_TEST_APP_URL` como `quina_app`, contraseñas de prueba fijas, `EMAIL_TRANSPORT=outbox`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` de prueba **antes de `build`**, `GOOGLE_CLIENT_ID`/`SECRET` ficticios, `BETTER_AUTH_SECRET` de prueba, `APP_URL=http://localhost:3100/app`.
- Pasos: `pnpm install --frozen-lockfile` → `format:check` → `check` → `lint` → `test` → `db:migrate` → `db:roles` → `test:db` → `build` → `pnpm exec playwright install --with-deps chromium` → `test:e2e`; subir `playwright-report` si falla.
- [ ] Verificar empujando la rama y viendo la corrida en verde (`gh run watch` una sola vez, no sondeo).
- [ ] Commit `ci: add quality, database and e2e workflow`.

### Task 11: Despliegue (acciones externas, cada una se confirma con el usuario antes)

- [ ] Supabase producción: `db:migrate` + `db:roles` con contraseñas nuevas; cerrar Data API; versión de Postgres confirmada.
- [ ] Vercel: proyecto `quina-webapp` (Hobby), variables de §9 con `APP_URL=https://quina.andeva.tech/app`, `EMAIL_TRANSPORT=resend`; Deployment Protection apagada en producción (el rewrite del sitio no puede pasar la autenticación de Vercel).
- [ ] Google Cloud: URI `https://quina.andeva.tech/app/api/auth/callback/google`. Turnstile: dominio `quina.andeva.tech`.
- [ ] `quina-website`: `vercel.json` rewrites `/app` y `/app/:path*` → despliegue de la webapp, y redirect `/login` → `/app/login` (PR en ese repo si hay acceso; si no, entregar el fragmento).
- [ ] Humo en producción, a través de `quina.andeva.tech/app` (no del dominio `*.vercel.app`): `/app/login` carga con tema y fuente; registro real con OTP por Resend; la Server Action de crear tienda no es rechazada por origen; cookie de sesión con `Path=/` en `quina.andeva.tech`.

## Verificación final
`pnpm format && pnpm check && pnpm lint && pnpm test && pnpm test:db && pnpm test:e2e` en verde; CI verde; revisión DESIGN.md §12 en 390 y 1440 px, ambos temas (capturas); recorrido de registro < 2 min medido en e2e (`test.setTimeout` no aplica: medir con `Date.now()` y aserción < 120 s).

## Ejecución
Al aprobar: seguir en `feature/foundations` (es la rama del Plan 0), copiar este plan a `docs/superpowers/plans/2026-10-30-plan-0-foundations.md` y ejecutar con superpowers:subagent-driven-development: las tareas 3→4→6→7→8→9 dependen en cadena de interfaces y un error en RLS o auth es caro. Las tareas 8 y 9 usan la skill `ui-ux-pro-max` para revisar cada pantalla contra DESIGN.md. (El plugin "ponytail" no está instalado en esta máquina; si lo quieres, instálalo y lo sumo.) La Task 11 hace acciones externas: cada una se confirma contigo antes.
