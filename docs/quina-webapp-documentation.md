# Quina Webapp - Documentación técnica y arquitectura de software

Este documento define la arquitectura de software, las decisiones tecnológicas,
los patrones de diseño y el conjunto de herramientas (_stack_) para la
construcción de la aplicación web de **Quina**. Aplica los principios de
**Clean Architecture**, **Hexagonal Architecture (Ports and Adapters)** y
**Domain-Driven Design (DDD)** táctico sobre un monolito modular full-stack en
**Next.js**, garantizando que las reglas financieras y de negocio sean 100 %
independientes de frameworks y completamente testeables sin bases de datos.

Para una visión global del producto, consulta la
[documentación maestra de Quina](quina-documentation.md).

---

## 0. Dónde vive la webapp: `quina.andeva.tech/app`

Quina es un producto de **Andeva** y vive en el subdominio `quina.andeva.tech`,
del mismo modo en que Google publica cada producto en su propio subdominio
(`gemini.google.com`, `drive.google.com`). Dentro de ese subdominio, el **sitio
público** ocupa la raíz y la **webapp** ocupa la ruta `/app`.

**La webapp no tiene un dominio ni un subdominio propio.** No existe
`app.quina.andeva.tech` ni un dominio aparte: todo lo que construye este
repositorio se sirve debajo de `https://quina.andeva.tech/app`.

| Qué | URL pública |
| :--- | :--- |
| Sitio público (otro repositorio, `quina-website`) | `https://quina.andeva.tech` |
| Webapp: panel del comerciante o portal del vecino, según el rol | `https://quina.andeva.tech/app` |
| Iniciar sesión | `https://quina.andeva.tech/app/login` |
| Registrar una bodega | `https://quina.andeva.tech/app/register` |
| Olvidé mi contraseña | `https://quina.andeva.tech/app/auth/forgot-password` |
| Restablecer contraseña (enlace del correo) | `https://quina.andeva.tech/app/auth/reset-password?token=...` |
| Portal del vecino | `https://quina.andeva.tech/app/portal` |
| Ingreso del vecino (documento + código, Google) | `https://quina.andeva.tech/app/portal/login` |
| Enlace mágico de los correos de cobranza | `https://quina.andeva.tech/app/portal/enter?token=...` |
| API de autenticación (Better Auth) | `https://quina.andeva.tech/app/api/auth/*` |
| Webhooks (Mercado Pago, Resend) | `https://quina.andeva.tech/app/api/webhooks/*` |
| Proceso programado diario | `https://quina.andeva.tech/app/api/cron/daily` |

Reglas que se derivan de esto:

- Next.js usa `basePath: '/app'`. Dentro del código las rutas se escriben sin el
  prefijo (`/login`, `/register`) y Next.js lo agrega; las URLs absolutas (correos,
  Better Auth, Google, Mercado Pago) salen siempre de `APP_URL`
  (`https://quina.andeva.tech/app`).
- Ninguna pantalla, correo o configuración debe apuntar a otro dominio o
  subdominio para la webapp.
- Como sitio y webapp comparten el mismo origen, comparten también la cookie de
  idioma `quina-lang` y la preferencia de tema guardada en `localStorage`
  (clave `theme`).

El detalle técnico de cómo el sitio reenvía `/app` a este proyecto está en la
sección 9.

---

## 1. Patrón arquitectónico: Clean Architecture y Puertos y Adaptadores

Para evitar el acoplamiento típico donde la lógica de cálculo financiero termina
mezclada dentro de Server Actions, controladores HTTP o consultas directas al
ORM, Quina implementa una arquitectura en capas concéntricas basada en la
**Regla de Dependencias**: las dependencias de código solo apuntan hacia adentro.

```
                ┌──────────────────────────────────────────────┐
                │          Frameworks & Drivers (Borde)        │
                │    Next.js App Router, Supabase, Vercel      │
                │  ┌────────────────────────────────────────┐  │
                │  │       Interface Adapters (Borde)       │  │
                │  │ Server Actions, Drizzle Repos, Resend  │  │
                │  │  ┌──────────────────────────────────┐  │  │
                │  │  │      Application (Use Cases)     │  │  │
                │  │  │  RegisterCreditSale, SettleCycle │  │  │
                │  │  │  ┌────────────────────────────┐  │  │  │
                │  │  │  │        Domain Core         │  │  │  │
                │  │  │  │ Money, FrenchAmortization, │  │  │  │
                │  │  │  │ CreditTerms, StockKardex   │  │  │  │
                │  │  │  └────────────────────────────┘  │  │  │
                │  │  └──────────────────────────────────┘  │  │
                │  └────────────────────────────────────────┘  │
                └──────────────────────────────────────────────┘
                    Flujo de dependencia: Siempre hacia adentro
```

### Capas del sistema

1. **Dominio (`src/core/domain`):**
   - El núcleo del negocio, libre de cualquier librería o framework externo
     (sin imports de Next.js, React o Drizzle).
   - Contiene las entidades de negocio, agregados, objetos de valor y las fórmulas
     matemáticas financieras (método francés, capitalización en período de gracia,
     interés diario compensatorio y cálculo de mora).
   - Define los **Puertos (Interfaces abstractas)** para repositorios y servicios
     externos.
2. **Aplicación (`src/core/application`):**
   - Orquesta el flujo de datos mediante **Casos de Uso (Use Cases)**.
   - Cada caso de uso representa una intención del usuario (por ejemplo:
     `RegisterCreditSaleUseCase`, `GenerateMonthlySettlementUseCase`,
     `ProcessPaymentUseCase`).
   - Interactúa exclusivamente con las interfaces de dominio, lo que permite
     ejecutar pruebas unitarias completas utilizando implementaciones en memoria
     (_In-Memory Adapters_) sin requerir una base de datos activa.
3. **Adaptadores de interfaz e infraestructura (`src/infrastructure`):**
   - **Adaptadores primarios (Driving):** Next.js Server Actions y Route Handlers
     que traducen entradas de usuario o webhooks a DTOs de aplicación.
   - **Adaptadores secundarios (Driven):** implementaciones concretas de los
     puertos: repositorios en Drizzle ORM sobre PostgreSQL, cliente de Resend,
     cliente de Supabase Storage, cliente de Mercado Pago, cliente de Groq y la
     configuración de Better Auth (autenticación y sesiones).
4. **Presentación e interfaz (`src/app`, `src/presentation`):**
   - `src/app` contiene solo las rutas de Next.js (páginas, layouts y Route
     Handlers), porque el App Router solo reconoce `app/` o `src/app/`.
   - `src/presentation` reúne las Server Actions, los componentes React, los
     hooks, la configuración de idiomas, la fuente y los estilos.

---

## 2. DDD Strategic Design y Análisis de Dominio

Aplicando los principios estratégicos de **Domain-Driven Design (DDD)** y
las directrices de **Domain Analysis**, se analizan las capacidades de negocio
de Quina para delimitar sus fronteras lingüísticas, clasificar sus subdominios
y prevenir problemas de acoplamiento prematuro o modelos monolíticos
desordenados (_Big Ball of Mud_).

### 2.1. Clasificación estratégica de subdominios

Cada capacidad del negocio se evalúa según su valor competitivo, complejidad
intrínseca y especificidad:

| Capacidad del negocio | Subdominio | Tipo | Justificación estratégica | Cohesión |
| :--- | :--- | :--- | :--- | :---: |
| **Gestión de Crédito y Cuentas Corrientes** | `Credit & Ledger` | **Core Domain** | **Ventaja competitiva exclusiva.** El corazón financiero de Quina: cálculo de amortización francesa, capitalización en período de gracia, intereses compensatorios diarios, recargo por mora y fechas de corte. Ningún software para bodegas en el Perú ofrece estas reglas formales. | 9.5 / 10 |
| **Catálogo e Inventario Valorizado** | `Catalog & Inventory` | **Supporting** | Esencial para la operación (bloqueo de venta sin stock, cálculo de costo promedio ponderado y registro de comprobantes de compras). Es específico del comercio pero no constituye la diferenciación única. | 8.5 / 10 |
| **Analítica de Cartera y Recomendaciones IA** | `Analytics & Insights` | **Supporting** | Consolida métricas de endeudamiento y genera sugerencias comerciales mediante Groq (Llama 3). Apoya directamente al Core Domain. | 8.0 / 10 |
| **Identidad, Tienda y Control de Acceso** | `Store & Identity` | **Generic** | Administración de tiendas (_multi-tenant_), cuentas de usuario, roles (RBAC) y consentimiento de la Ley N.° 29733. Problema común y estandarizado. | 8.5 / 10 |
| **Comunicaciones y Notificaciones** | `Notification & Messaging` | **Generic** | Envío de correos transaccionales por Resend (notificaciones de cargo de 48 h, cobro y mora). Capacidad genérica reemplazable. | 9.0 / 10 |
| **Facturación y Suscripciones SaaS** | `Billing & Subscription` | **Generic** | Gestión del cobro mensual/anual de los planes Quina Pro y Plus a través de Mercado Pago. Totalmente desacoplado de las finanzas de los vecinos. | 8.5 / 10 |

### 2.2. Catálogo de Bounded Contexts y fronteras lingüísticas

Un error crítico en arquitecturas monolíticas es forzar un único modelo global
para términos que significan cosas distintas según la perspectiva del negocio.
Quina define fronteras lingüísticas explícitas donde los términos son
completamente unívocos:

```
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│     Credit & Ledger Context     │       │   Catalog & Inventory Context   │
│         (Core Domain)           │◄──────│      (Supporting Domain)        │
│ Entidad: DebtorAccount          │  ACL  │ Entidad: ProductStock           │
│ Entidad: CreditCharge           │       │ Entidad: SaleDispatch           │
│ Operación: SettleInstallment    │       │ Operación: DeductKardex         │
└─────────────────────────────────┘       └─────────────────────────────────┘
                 ▲                                         ▲
                 │ Customer / Supplier                     │ Customer / Supplier
                 └──────────────────┬──────────────────────┘
                                    │ Shared Kernel (TenantContext / StoreId)
                    ┌───────────────┴───────────────┐
                    │   Store & Identity Context    │
                    │      (Generic Subdomain)      │
                    │ Entidad: Store (Tenant)       │
                    │ Entidad: User (Credentials)   │
                    │ Entidad: ConsentLog           │
                    └───────────────────────────────┘
```

#### Análisis de desplazamientos de significado (_Linguistic Boundary Shifts_)

Para garantizar alta cohesión y cero ambigüedad, los conceptos centrales cambian
de modelo e invariantes entre contextos:

- **Concepto "Cliente":**
  - En `Store & Identity Context`: es un **`User`** con credenciales de acceso,
    correo electrónico y registro de consentimiento legal (Ley N.° 29733).
  - En `Credit & Ledger Context`: es un **`DebtorAccount`** o sujeto de crédito,
    definido por su límite disponible, tasa compensatoria pactada, días de corte y
    pago, y saldo deudor. Carece de contraseña o datos de sesión.
  - En `Catalog & Inventory Context`: **no existe**. El inventario despacha ítems y
    registra salidas de almacén sin conocer la identidad financiera del comprador.
- **Concepto "Venta":**
  - En `Catalog & Inventory Context`: es un **`SaleDispatch`** que lista líneas de
    productos (`quantity`, `unit_cost_snapshot`), descuenta unidades y asienta un
    movimiento en el kardex valorizado.
  - En `Credit & Ledger Context`: es un **`CreditCharge`** o débito financiero que
    solo requiere el monto monetario total y la fecha de compra para alimentar el
    motor de amortización francesa o el cálculo de interés diario.
- **Concepto "Pago":**
  - En `Credit & Ledger Context`: es un **`DebtSettlement`** que cancela el capital
    de la cuota o saldo del mes y abona intereses moratorios acumulados.
  - En `Billing & Subscription Context`: es una **`SaaSSubscriptionCharge`**
    procesada mediante Mercado Pago para renovar la licencia del comercio.

### 2.3. Mapa de relaciones de contexto (_Context Mapping_)

La integración entre contextos se gobierna mediante patrones tácticos formales:

1. **`Catalog & Inventory` $\rightarrow$ `Credit & Ledger` (Anti-Corruption Layer - ACL):**
   - Cuando se confirma un despacho de venta al crédito en el mostrador, la capa
     de aplicación utiliza una capa anticorrupción que traduce los ítems
     vendidos a un comando financiero simple (`ChargeCustomerCreditCommand`). El
     motor de crédito nunca importa entidades de inventario ni de proveedores.
2. **`Store & Identity` $\rightarrow$ Todos los contextos (Shared Kernel ligero):**
   - Todos los contextos comparten exclusivamente el Value Object inmutable
     `StoreId` y el contrato `TenantContext`. Cada repositorio inyecta
     automáticamente el identificador de la tienda para aislamiento estricto.
3. **`Credit & Ledger` $\rightarrow$ `Notification & Messaging` (Domain Events):**
   - El motor financiero publica eventos de dominio en memoria
     (`CreditChargeCreatedEvent`, `CycleSettledEvent`, `LatePaymentDetectedEvent`).
     El adaptador de notificaciones los traduce en correos de Resend,
     manteniendo el núcleo financiero 100 % desacoplado de la infraestructura de
     correo.
   - Los cargos fiados **no** generan un correo por venta: se agrupan en un
     **resumen diario por vecino** que despacha el proceso programado (ver
     sección 11). Así un vecino recibe como máximo un aviso de cargos al día y el
     volumen cabe en la capa gratuita de Resend.
4. **`Credit & Ledger` $\rightarrow$ `Analytics & Insights` (Published Language):**
   - Las liquidaciones mensuales cerradas se publican como proyecciones
     financieras de solo lectura para alimentar el prompt de recomendaciones de IA
     en Groq.

### 2.4. Glosario de Lenguaje Ubicuo (_Ubiquitous Language_) y anti-términos

Para garantizar coherencia absoluta entre el código, los requerimientos de la
docente y el usuario bodeguero, se define el glosario canónico:

| Término canónico | Contexto | Definición precisa en el dominio | Término prohibido / Anti-término |
| :--- | :--- | :--- | :--- |
| **Fiado / Crédito barrial** | `Credit & Ledger` | Crédito de consumo a corto plazo otorgado por confianza mercantil entre el comercio y el vecino. | *Micropréstamo bancario*, *Crédito subprime* |
| **Fecha de corte** | `Credit & Ledger` | Día mensual en que se consolidan las compras del período para liquidar intereses y cuotas. | *Closing date contable*, *Facturación fiscal* |
| **Fecha de pago pactada** | `Credit & Ledger` | Día mensual acordado en que el vecino se compromete a cancelar la liquidación sin mora. | *Due date financiero corporativo* |
| **Período de gracia capitalizado** | `Credit & Ledger` | En ventas en cuotas, días entre la fecha de compra y la fecha de pago pactada del ciclo al que pertenece la compra; sus intereses se suman al capital antes de aplicar la cuota francesa. | *Días muertos*, *Carencia simple* |
| **Interés moratorio** | `Credit & Ledger` | Cargo compensatorio adicional por días de atraso sobre el saldo total impago posterior a la fecha pactada. | *Penalidad punitiva*, *Mora judicial* |
| **Conformidad de cargo** | `Credit & Ledger` | Mecanismo de aceptación de deuda: el resumen diario por correo informa los cargos del día y abre un plazo de 48 h para objeciones. Un cargo objetado lo confirma o lo anula el dueño (`credit_charge_voids`). | *Firma digital notarial*, *Pagaré legal* |
| **Resumen diario de cargos** | `Notification & Messaging` | Correo único por vecino y día con todas sus compras fiadas de ese día. | *Correo por venta* |
| **Kardex valorizado** | `Catalog & Inventory` | Registro cronológico e inmutable de entradas y salidas de stock evaluadas al costo promedio ponderado. | *Inventario simple*, *Stock en memoria* |

### 2.5. Evaluación de cohesión y prevención de anti-patrones

Siguiendo la métrica objetiva de cohesión de Domain Analysis:

$$
\text{Cohesión} = \frac{\text{Lingüística (3/3)} + \text{Uso (3/3)} + \text{Datos (2/2)} + \text{Cambio (2/2)}}{10} = \mathbf{1.0 \ (10/10 \ \text{en Core Domain})}
$$

- **Anti-patrón *Big Ball of Mud* evitado:** los agregados financieros no
  arrastran datos de stock ni facturas físicas de compra; cada contexto persiste y
  opera solo su información requerida.
- **Anti-patrón *Generic in Core* evitado:** las integraciones de infraestructura
  (Resend, Supabase Storage, Groq y Mercado Pago) se extrajeron a adaptadores
  secundarios, protegiendo las fórmulas financieras de cambios de proveedores
  cloud.
- **Anti-patrón *Mixed Responsibilities* evitado:** el cálculo del plan francés
  se ejecuta en un servicio de dominio puro (`FrenchAmortizationCalculator`),
  aislado de la persistencia y de la capa web.

---

## 3. Especificación del stack tecnológico

La implementación del monolito modular full-stack se apoya en un conjunto
coherente de herramientas en TypeScript:

| Capa                 | Tecnología                  | Versión / Detalle                | Justificación técnica                                                                   |
| :------------------- | :-------------------------- | :------------------------------- | :-------------------------------------------------------------------------------------- |
| **Framework base**   | Next.js                     | 16 (App Router)                  | Unifica cliente y servidor con Server Actions y soporte PWA sin backend separado.       |
| **Lenguaje**         | TypeScript                  | 6.x (Strict mode)                | Tipado estricto compartido desde el dominio hasta los componentes de React.             |
| **Gestor paquetes**  | pnpm                        | Estándar del workspace           | Resolución rápida, determinista y prevención de dependencias fantasma.                  |
| **Estilos UI**       | Tailwind CSS                | v4                               | Estilos utilitarios atómicos y diseño responsivo adaptado a pantallas móviles.          |
| **Componentes UI**   | shadcn/ui                   | Radix UI primitives              | Primitivas accesibles, ligeras y totalmente desacopladas de librerías de estilos pesadas.|
| **Iconografía**      | Lucide React                | `lucide-react`                   | Iconos limpios, optimizados por tree-shaking para despacho veloz.                      |
| **Skeletons UI**     | Boneyard                    | `boneyard-js`                    | Generación automática en desarrollo de pantallas esqueléticas pixel-perfect.            |
| **Notificaciones**   | Sileo                       | `sileo`                          | Toasts con física de resortes fluida para retroalimentación instantánea en mostrador.   |
| **Formularios**      | React Hook Form + Zod       | Estándar de tipado               | Validación estricta en dos niveles (cliente y servidor) con DTOs tipados.              |
| **ORM y Datos**      | Drizzle ORM                 | `drizzle-orm` + `postgres-js`    | Cero arranques en frío en Vercel, transacciones SQL ACID nativas y esquemas tipados.    |
| **Base de datos**    | Supabase PostgreSQL         | PostgreSQL 17 (Plan Free)        | Motor transaccional relacional con Row Level Security (RLS) para multi-tenancy.         |
| **Autenticación**    | Better Auth                 | `better-auth` + plugins          | Sesiones en base de datos, correo y contraseña (Argon2id), Google OAuth, OTP de 6 dígitos, enlaces mágicos, Turnstile y límite de tasa en un solo paquete. |
| **Idiomas**          | next-intl                   | `next-intl`                      | Interfaz y correos en castellano, inglés y quechua; lee la cookie `quina-lang` del sitio. |
| **Protección bots**  | Cloudflare Turnstile        | `@marsidev/react-turnstile`      | Captcha 100 % gratuito, no intrusivo y sin retos visuales para proteger el login y altas.|
| **Correos**          | Resend SDK                  | `resend` (Capa gratuita)         | Despacho asíncrono de notificaciones de cargo, recordatorios y alertas de mora.         |
| **Pagos SaaS**       | Mercado Pago SDK            | `mercadopago`                    | Suscripciones recurrentes en soles peruanos con tarjetas locales y webhooks seguros.    |
| **IA Financiera**    | Groq Cloud SDK              | `groq-sdk` (Llama 3 en free tier)| Inferencia ultrarrápida para recomendaciones comerciales con control de cuotas.         |

---

## 4. Decisiones de diseño y descarte de sobreingeniería

En consonancia con los principios de arquitectura limpia y desarrollo ágil, se
evaluaron y descartaron alternativas complejas:

### Decisiones del Plan 2 (tienda y vecinos)

Tomadas el 31 de octubre de 2026 al construir US01, US04, US05, US06 y la base de
US26. Resuelven huecos o contradicciones entre el enunciado y las historias:

- **Moneda:** las condiciones de fiado admiten soles y dólares, y los topes del
  BCRP se validan por moneda. Cómo se vende a una cuenta en dólares con precios
  en soles se decide en el Plan 3.
- **Un usuario, una tienda:** un correo que ya tiene cuenta no puede invitarse a
  otra tienda; se rechaza con un mensaje claro.
- **Empleado:** registra vecinos (datos y consentimiento) y ve el disponible.
  Solo el dueño pacta o cambia límite, tasas, corte, pago y estado de la cuenta.
- **Topes del BCRP:** se cargan como semilla con su circular y el Administrador
  agrega nuevas vigencias desde su panel. Sin tope vigente para la moneda y el
  tipo de tasa, las condiciones se rechazan (falla cerrado).
- **Tienda creada por el Administrador (US01.3):** nace en Casero, activa y sin
  prueba. La prueba de Bodega Pro es solo para el autoservicio (US24 y US25).
- **Suspender una tienda (US01.5):** `stores.is_active = false` y se borran las
  sesiones de sus usuarios en la misma transacción; la sesión de una tienda
  inactiva se rechaza. Reactivar es lo inverso. Ambas quedan en auditoría.
- **Estados del empleado:** *invitado* (sin contraseña), *activo* (con
  contraseña) y *desactivado* (`is_active = false`, sin sesiones). El límite de
  usuarios del plan cuenta al dueño y a las filas activas, invitados incluidos;
  la prueba cuenta como Bodega Pro. Cancelar una invitación borra al invitado,
  que nunca operó.
- **Vecino de contado:** un vecino puede existir sin cuenta de fiado. El límite
  de 15 de Casero cuenta solo cuentas `ACTIVE` (US26.3). Dar de baja a un vecino
  exige saldo cero y suspende su cuenta.
- **Consentimiento (Ley N.º 29733):** se captura en el mostrador, con la IP y el
  navegador del equipo de la tienda como evidencia. Al abrir o cambiar
  condiciones se guarda además un consentimiento `CREDIT_TERMS` con su resumen.
- **Política de datos por tienda (US04.2):** página pública
  `/app/privacy/customers/[storeId]`, con la tienda como titular del banco de
  datos y Quina como encargado. Es un borrador pendiente de revisión legal.
- **Documentos:** DNI de 8 dígitos, carné de extranjería de 9 a 12 caracteres y
  pasaporte de 6 a 12, en mayúsculas.
- **Fuera de alcance:** solo lectura al bajar de plan (US26.7) va al Plan 7; el
  límite de 50 productos y `sales.employee_id` (US05.6), al Plan 3; el bloqueo
  automático por mora, al Plan 4.

### Decisiones del Plan 3 (mostrador)

Tomadas el 31 de octubre de 2026 al construir US03, US07 y US08:

- **D1, stock sin compras:** el producto nace con un stock inicial opcional, que
  entra al kardex como `COUNT_ADJUSTMENT` con la nota "Stock inicial". Hasta que
  lleguen las compras (US15), el dueño corrige el stock con un conteo físico, que
  también es un `COUNT_ADJUSTMENT` y exige motivo.
- **D2, costo sin US16:** cada venta congela `current_average_cost` (0 mientras
  no haya compras) en `unit_cost_snapshot`, en el kardex y en `total_cost` y
  `profit_margin`. Cuando llegue US16, los números se vuelven reales sin tocar
  el mostrador.
- **D3, cuotas:** el fiado admite pago único (`SINGLE_PAYMENT_CREDIT`) y cuotas
  (`INSTALLMENTS_CREDIT`, método francés de US09). Las cuotas solo se ofrecen si
  todos los productos tienen `allows_installments` y si el número no supera
  `max_installment_months`. El límite consume el capital de la compra, sin
  intereses futuros (decisión financiera 1).
- **D4, cuentas en dólares:** el fiado a una cuenta en USD se bloquea con un
  aviso, porque el catálogo está en soles y no hay tipo de cambio.
- **D5, permisos:** el permiso `catalog.manage` (crear, editar, dar de baja y
  ajustar stock) es solo del dueño. El empleado ve el catálogo y el stock, pero no
  los costos. Ambos venden (`sales.create`).
- **D6, caja de hoy:** sin tabla propia. Es una tarjeta en Inicio, solo para el
  dueño, que suma las ventas al contado del día en Lima por medio de pago. El
  fiado no entra en la caja.
- **D7, tres toques:** vecino, producto y "Fiar S/ X". Escribir el nombre no
  cuenta como toque. En el celular, cobrar y fiar están en la barra inferior,
  sin abrir la hoja del carrito.
- **D8, ciclo:** el cargo busca su ciclo por (cuenta, año, mes) con `cycleFor`.
  Si no existe, lo abre `OPEN` con el número siguiente; si existe y ya no está
  `OPEN`, la venta se rechaza. Los totales del ciclo se calculan en el corte
  (Plan 4). La modalidad de la venta se traduce a la del cargo
  (`SINGLE_PAYMENT` o `INSTALLMENTS`, con cuotas, gracia y monto capitalizado).
- **D9, bloqueos del fiado:** vecino sin cuenta o inactivo, cuenta `SUSPENDED` o
  `BLOCKED`, algún ciclo `OVERDUE` (US08.8) y monto mayor que el disponible
  ("Excede el límite disponible por S/ X.XX").
- **D10, límite de productos:** los 50 de Casero cuentan productos y servicios
  activos; dar de baja libera cupo. Se valida con la suscripción bloqueada.
- **D11, imágenes:** bucket público `product-images`, ruta
  `{storeId}/{productId}-{uuid}.{ext}`, JPG, PNG o WEBP de hasta 2 MB, subidas
  desde el servidor. En local y en e2e se usa un adaptador de disco.
- **D12, cantidades:** enteras si la unidad no admite decimales; hasta 3
  decimales a granel. Cada subtotal es cantidad por precio, redondeado a céntimos.
- **D13, contado:** el vecino es opcional. Lo recibido y el vuelto solo aplican al
  efectivo; vacío vale como pago exacto. Yape, Plin y tarjeta no llevan vuelto.
- **D14, concurrencia:** todo ocurre en una transacción dentro de `withTenant`.
  Primero se bloquea la cuenta del vecino (serializa ciclo y disponible) y luego
  los productos, ordenados por id para evitar bloqueos cruzados. El kardex
  registra `SALE_EXIT` con cantidad negativa y la venta como referencia. El
  cajero (`sales.user_id_cashier`, US05.6) sale de la sesión, nunca del
  formulario.
- **Pendiente para el Plan 4:** en cuotas, la deuda sube el capital de la compra,
  pero el capital de las filas de `credit_installments` incluye la gracia
  capitalizada. Al pagar cada cuota se libera la parte proporcional del capital
  original.

### Decisiones del Plan 4 (corte y cobranza)

Tomadas el 31 de octubre de 2026 al construir US10, US11, US12 y US13:

- **P1, mora por línea:** cada cargo de pago único y cada cuota calcula su mora
  con su propia tasa moratoria congelada sobre su parte exigible; la mora del
  ciclo es la suma y `payment_allocations` la reparte línea por línea.
- **P2, anulación en el mismo ciclo:** un cargo observado se anula en su propio
  ciclo mientras no esté pagado (`credit_charge_voids.applied_cycle_id` es ese
  ciclo). Si ya estaba liquidado, se recalculan `adjustments_total` y
  `total_due`; la anulación cancela la línea entera, con su interés. Si el ciclo
  queda en 0, pasa a `PAID`.
- **P3, cuotas:** un cargo en cuotas se anula solo si ninguna cuota se liquidó;
  sus cuotas pasan a `VOIDED`. El ciclo de la compra (que puede haber cerrado en
  0 y estar `PAID`) no lo impide.
- **P4, observaciones sin portal:** el correo pide escribir a la tienda dentro de
  las 48 h. El dueño o el empleado registran la observación (`charges.object`);
  solo el dueño la confirma o la anula (`charges.resolve`). El portal llega en el
  Plan 5.
- **P5, correos en Casero:** el estado de cuenta y el comprobante salen siempre.
  El resumen de compras y los recordatorios salen con un botón en Cobranza
  (`notifications.send`, dueño y empleado) en Casero y solos en Pro y Plus. El
  aviso de mora es automático solo en Pro y Plus.
- **P6, conformidad:** no frena el corte. Un cargo sin notificar entra al ciclo y
  sigue `PENDING` hasta que pasan 48 h desde el resumen o el dueño lo resuelve.
- **P7, cambio de días:** `DAYS_LOCKED` si hay un ciclo `OPEN` con compras, un
  ciclo sin pagar o cuotas por vencer. Las tasas y el límite sí cambian.
- **P8, demo:** `pnpm demo:collections` carga vecinos y compras con fechas pasadas
  en una tienda existente y corre el proceso diario (sección 11.3).
- **D3, saldo:** el corte suma el interés de los cargos únicos y, por cuota,
  `cuota − capital liberado`; el capital liberado de la cuota *k* es
  `P × amortización_k / Σ amortizaciones` truncado, y la última absorbe el
  residuo. El pago resta capital e interés; la mora nunca entra al saldo. Al
  anular se resta el capital y el interés ya liquidado.
- **D6, varios ciclos vencidos:** se cobra siempre el más antiguo, completo y con
  el monto exacto; la pantalla ofrece cobrar el siguiente.
- **D7, recibo:** correlativo por tienda `R-000001`, serializado con
  `pg_advisory_xact_lock(hashtext('receipt:' || store_id))`.
- **D8, observación pendiente:** bloquea el cobro de su ciclo hasta que el dueño
  la resuelva.
- **D9 y D10, envíos:** cada correo se guarda `QUEUED` en la transacción del
  negocio y se envía después del commit, uno por uno (≤ 2 por segundo) y con la
  etiqueta `store_id`. Lo que quede en cola o falle se reintenta en el proceso
  siguiente durante 3 días. Un resumen de otro día que falló se reemplaza por el
  de hoy. El cobro nunca falla porque falle el correo.
- **D14, rebotes:** `/app/api/webhooks/resend` verifica la firma svix
  (`RESEND_WEBHOOK_SECRET`), entra con `withTenant` según la etiqueta
  `store_id`, marca `DELIVERED` o `BOUNCED` (una entrega no pisa un rebote) y
  llena `customers.email_bounced_at`.
- **D17, fecha simulada:** fuera de producción y con `ALLOW_SIMULATED_NOW=1`, el
  cron acepta la cabecera `x-quina-now`. Los envíos y avisos usan la hora del
  proceso, así las 48 h y los "Avisos de hoy" siguen la fecha simulada.

### Decisiones del Plan 5 (portal del vecino)

Tomadas el 1 de noviembre de 2026 al construir US14:

- **P1, RLS:** el portal no conoce la tienda de antemano. Dos funciones
  `SECURITY DEFINER` (`portal_customer_links` y `portal_emails_for_document`)
  devuelven solo ids, idiomas y correos; todo lo demás pasa por `withTenant` de
  la tienda del vínculo y filtra por su `customer_id`.
- **P2 y D1, acceso por correo:** el portal se abre por el **correo verificado**,
  no por el rol, y se recalcula en cada petición. Un dueño que también es vecino
  entra a `/portal`. `customers.user_id` no se usa. Si el dueño cambia el correo
  del vecino, el acceso viejo se corta solo.
- **D7, alta:** sin la cookie de consentimiento del comerciante, un correo que
  alguna tienda registró crea un `CUSTOMER` con el idioma de esa tienda y sin
  `ACCEPT_TERMS` (su consentimiento se tomó en la tienda). Otro correo se
  rechaza.
- **P3, datos de cobro:** el dueño carga Yape, Plin, banco, cuenta, CCI y un QR
  en `/settings` (permiso `store.payment_details`). El QR va al bucket privado
  `store-files` y se muestra con una URL firmada de 15 minutos.
- **P4 y D5, enlace mágico:** el resumen diario, el estado de cuenta, el
  recordatorio y el aviso de mora llevan "Ver mi estado de cuenta" (el
  comprobante no). El enlace dura 72 h, se guarda con hash y apunta a
  `/portal/enter`, que lo canjea por POST: los antivirus que abren los enlaces
  no lo gastan. Si en el equipo había otra sesión, se avisa y se cierra. Si el
  enlace no se pudo crear, el correo sale igual.
- **P5, D4 y D6, documento + código:** DNI, CE o pasaporte con Turnstile; como
  máximo un código por correo cada 60 s y la misma respuesta siempre. El código
  se compara con el hash de cada correo candidato y `signInEmailOTP` se llama una
  sola vez con el que coincide; si ninguno coincide, se suma un intento a todos.
  Así un error no gasta los 5 intentos de los otros correos.
- **P7 y D10, observar:** el vecino observa un cargo `PENDING` dentro de su
  plazo. Queda `OBJECTED` con auditoría `OBJECT_CHARGE` (`byCustomer`), igual
  que en el Plan 4, y sin correo al dueño.
- **D11, comprobantes:** son el detalle de cada compra del ciclo (productos e
  importes) más los recibos `R-000001` del vecino.
- **Contraseña:** opcional, desde `/portal/profile` con `PasswordPolicy`. El
  vecino que ya tiene una entra por `/login`.

### Por qué Drizzle ORM frente a Prisma
- **Sin binarios pesados en serverless:** Prisma requiere un motor en Rust
  (~40 MB) que penaliza los arranques en frío en funciones serverless de Vercel.
  Drizzle es 100 % TypeScript nativo y arranca en milisegundos.
- **Transacciones ACID complejas:** Quina ejecuta operaciones financieras
  atómicas críticas (ej: validar stock $\rightarrow$ restar inventario $\rightarrow$
  registrar kardex $\rightarrow$ validar límite $\rightarrow$ registrar venta al
  crédito). Drizzle soporta transacciones nativas de PostgreSQL con máxima
  claridad y seguridad.
- **Conexión limpia con Supabase:** Se conecta de forma directa al pool de
  conexiones transaccionales de Supavisor (puerto 6543) sin requerir servicios de
  pago como Prisma Accelerate.

### Por qué se descarta Redis en la versión V1
- **Consistencia financiera absoluta:** Cachear límites de crédito o saldos en
  Redis genera riesgo de lecturas sucias e invalidación de caché desfasada. La
  verdad financiera debe ser transaccional e inmediata en PostgreSQL.
- **Rendimiento demostrado:** Con índices relacionales adecuados en PostgreSQL
  (`store_id`, `customer_id`), las consultas de cartera toman menos de 5 ms.
- **Seguridad perimetral resuelta:** El límite de tasa de Better Auth se guarda en
  PostgreSQL (tabla `rate_limits`), el bloqueo de cuentas vive en `users` y
  Cloudflare Turnstile filtra bots en los formularios de acceso.
- **Simplicidad operativa:** Evita añadir otro servicio en la nube, costos
  adicionales y latencia entre Vercel y el proveedor de caché.

---

## 5. Estructura de directorios limpia (Clean Architecture en Next.js)

La estructura de carpetas implementa la separación estricta entre Dominio,
Aplicación, Infraestructura y Presentación dentro del App Router de Next.js:

```text
quina-webapp/
├── messages/                             # Textos de interfaz: es.json, en.json, qu.json (next-intl)
├── public/brand/                         # Isologos, isotipos, favicon e íconos de la PWA
├── src/
│   ├── app/                              # SOLO rutas de Next.js (bajo basePath /app)
│   │   ├── (auth)/login/                 # /app/login: acceso seguro
│   │   ├── (auth)/register/              # /app/register: registro autoservicio (US24)
│   │   ├── (dashboard)/                  # Vistas de mostrador del comerciante
│   │   │   ├── sales/                    # Despacho en 3 toques
│   │   │   ├── customers/                # Vecinos, consentimiento y condiciones de fiado (US04, US06)
│   │   │   ├── team/                     # Empleados e invitaciones (US05)
│   │   │   ├── settings/                 # Uso del plan y funciones bloqueadas (US26)
│   │   │   ├── profile/                  # Perfil, idioma y contraseña
│   │   │   ├── inventory/                # Catálogo, kardex y compras
│   │   │   ├── portfolio/                # Panel de cartera y cobranza
│   │   │   └── reports/                  # Reportes financieros e IA
│   │   ├── (platform)/platform/          # /app/platform: tiendas y topes del BCRP (US01)
│   │   ├── auth/accept-invite/           # Público: definir la contraseña con el enlace de cuenta
│   │   ├── privacy/customers/[storeId]/  # Público: política de datos de los vecinos de cada tienda
│   │   ├── (customer)/portal/            # /app/portal: consulta gratuita del vecino (US14)
│   │   │   ├── login/                    # Documento + código, Google
│   │   │   ├── enter/                    # Canje del enlace mágico por POST
│   │   │   ├── profile/                  # Idioma, contraseña opcional y salir
│   │   │   └── (account)/[storeId]/      # Cuenta, ciclos (cycles/) y recibos (payments/)
│   │   ├── api/auth/[...all]/            # Route Handler de Better Auth
│   │   ├── api/webhooks/                 # Mercado Pago y rebotes de Resend
│   │   ├── api/cron/daily/               # Proceso programado diario (Vercel Cron)
│   │   └── layout.tsx                    # Importa globals.css y la fuente
│   ├── core/                             # NÚCLEO PURO (Sin dependencias de frameworks)
│   │   ├── domain/                       # Capa 1: Dominio y Reglas de Negocio
│   │   │   ├── credit/                   # Entidades: Customer, CreditAccount, Installment
│   │   │   ├── finance/                  # Fórmulas: FrenchAmortization, InterestCalculator
│   │   │   ├── inventory/                # Entidades: Product, KardexMovement, CostCalculator
│   │   │   ├── identity/                 # Entidades: Store, User, Role
│   │   │   ├── shared/                   # Value Objects: Money, Result, DateRange
│   │   │   └── ports/                    # Puertos abstractos (Interfaces de salida)
│   │   │       ├── ICustomerRepository.ts
│   │   │       ├── ISaleRepository.ts
│   │   │       ├── IProductRepository.ts
│   │   │       ├── INotificationGateway.ts
│   │   │       ├── IStorageGateway.ts
│   │   │       └── IPaymentGateway.ts
│   │   └── application/                  # Capa 2: Casos de Uso (Orquestación de Dominio)
│   │       ├── credit/
│   │       │   ├── RegisterCreditSaleUseCase.ts
│   │       │   ├── GenerateSettlementUseCase.ts
│   │       │   └── ProcessDebtPaymentUseCase.ts
│   │       ├── inventory/
│   │       │   ├── RegisterPurchaseUseCase.ts
│   │       │   └── AdjustStockUseCase.ts
│   │       └── analytics/
│   │           └── GetPortfolioSummaryUseCase.ts
│   ├── infrastructure/                   # Capa 3: Adaptadores Secundarios (Infraestructura)
│   │   ├── db/                           # Persistencia con Drizzle ORM
│   │   │   ├── schema/                   # Tablas SQL tipadas en Drizzle
│   │   │   ├── repositories/             # DrizzleCustomerRepository, DrizzleSaleRepository
│   │   │   └── connection.ts             # Cliente y pool de Supabase Postgres
│   │   ├── email/                        # ResendNotificationAdapter (implementa puerto)
│   │   ├── storage/                      # SupabaseStorageAdapter (implementa puerto)
│   │   ├── payments/                     # MercadoPagoPaymentAdapter (implementa puerto)
│   │   ├── ai/                           # GroqAIRecommendationAdapter (implementa puerto)
│   │   └── auth/                         # Configuración de Better Auth y hooks de bloqueo
│   └── presentation/                     # Capa 4: Adaptadores Primarios y UI
│       ├── actions/                      # Server Actions (invocan casos de uso)
│       ├── components/                   # Componentes visuales
│       │   ├── ui/                       # shadcn/ui (Botones, diálogos, tablas)
│       │   ├── feedback/                 # Toasts Sileo y Skeletons Boneyard
│       │   └── forms/                    # Formularios con validación Zod
│       ├── hooks/                        # Custom hooks y UI optimista
│       ├── i18n/                         # Solo configuración de next-intl (los textos van en messages/)
│       ├── fonts/                        # Albert Sans variable (next/font/local)
│       └── styles/globals.css            # Tokens de Quina y configuración de Tailwind 4 (@theme)
├── tests/                                # unit/, fakes/ (repositorios en memoria) y e2e/
├── drizzle.config.ts                     # Configuración de migraciones Drizzle Kit
├── next.config.ts                        # basePath '/app' y configuración PWA
└── package.json                          # Dependencias gestionadas con pnpm
```

Tailwind CSS 4 no usa `tailwind.config.ts`: los tokens y las variantes se
declaran en CSS, con `@theme` y `@custom-variant` dentro de
`src/presentation/styles/globals.css`.

---

## 6. Estrategia de pruebas: In-Memory Adapters para validación formal

Uno de los mayores beneficios de aplicar Clean Architecture es que los casos de
uso de Quina se pueden probar en milisegundos mediante pruebas unitarias
rigurosas con repositorios en memoria, sin necesidad de conectarse a PostgreSQL
ni levantar contenedores Docker:

```typescript
// tests/unit/RegisterCreditSaleUseCase.spec.ts
import { RegisterCreditSaleUseCase } from "@/core/application/credit/RegisterCreditSaleUseCase";
import { InMemoryCustomerRepository } from "../fakes/InMemoryCustomerRepository";
import { InMemorySaleRepository } from "../fakes/InMemorySaleRepository";
import { Money } from "@/core/domain/shared/Money";

describe("RegisterCreditSaleUseCase", () => {
  it("debe rechazar una venta fiada si excede la línea de crédito disponible", async () => {
    const customerRepo = new InMemoryCustomerRepository();
    const saleRepo = new InMemorySaleRepository();
    const useCase = new RegisterCreditSaleUseCase(customerRepo, saleRepo);

    // Cliente con límite de S/ 100 y deuda actual de S/ 80
    await customerRepo.seedCustomer({
      id: "cust-1",
      creditLimit: Money.fromSoles(100),
      currentDebt: Money.fromSoles(80),
    });

    const result = await useCase.execute({
      customerId: "cust-1",
      amount: Money.fromSoles(30), // 80 + 30 = 110 (Supera el límite)
    });

    expect(result.isSuccess).toBe(false);
    expect(result.error).toContain("Excede el límite de crédito disponible");
  });
});
```

Esta separación garantiza el cumplimiento de los **dos juegos de datos de prueba
obligatorios** exigidos por la rúbrica del curso, permitiendo demostrar cálculos
financieros auditables de caja blanca y caja negra directamente en el código.

---

## 7. Arquitectura de seguridad, autenticación y flujos de acceso

Quina implementa una arquitectura de seguridad por capas que balancea una
protección estricta para las cuentas comerciales (dueños y cajeros) con una
experiencia sin fricción para los clientes vecinos (caseros deudores).

Toda la autenticación se construye con **Better Auth** sobre las tablas de
Drizzle: sesiones guardadas en PostgreSQL (cerrar sesión las invalida al
instante), correo y contraseña, Google OAuth y los plugins `emailOTP`,
`magicLink` y `captcha` (Cloudflare Turnstile). El DNS de `quina.andeva.tech`
apunta a Vercel con el proxy de Cloudflare apagado, así que el firewall y la
mitigación de DDoS en el borde los provee Vercel; de Cloudflare se usan el DNS y
Turnstile.

```
┌────────────────────────────────────────────────────────────────────────┐
│             Capa de Borde (Vercel + Cloudflare Turnstile)              │
│   Firewall y anti-DDoS de Vercel + Turnstile (captcha 100 % gratuito)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Capa de Autenticación (Better Auth)                  │
│                                                                        │
│   ┌───────────────────────────┐      ┌─────────────────────────────┐   │
│   │ Comerciante / Empleado    │      │ Cliente Vecino (Doña Rosa)  │   │
│   │ • Email + Argon2id hash   │      │ • Magic Link directo (1-clic│   │
│   │ • Google OAuth 2.0        │      │ • Continuar con Google      │   │
│   │ • Bloqueo tras 5 fallos   │      │ • DNI + OTP (6 dígitos)     │   │
│   │ • Reset con token (30 min)│      │ • Contraseña (Opcional)     │   │
│   └───────────────────────────┘      └─────────────────────────────┘   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  Base de Datos (Supabase PostgreSQL 17)                │
│  `users`, `sessions`, `accounts`, `verifications`, `rate_limits`      │
│    + Row Level Security (RLS) con `app.current_store_id`               │
└────────────────────────────────────────────────────────────────────────┘
```

### 7.1. Política de contraseñas seguras y algoritmo de hashing

Para las cuentas con acceso al mostrador y administración (`STORE_OWNER` y
`STORE_EMPLOYEE`):

- **Requisitos de complejidad:** longitud mínima de 8 caracteres, exigiendo al
  menos una mayúscula, un número y un símbolo. En el cliente se utiliza la
  librería `zxcvbn-ts` para evaluar la entropía y rechazar contraseñas comunes
  (como "123456" o "bodega2026").
- **Algoritmo de derivación de claves:** se utiliza **Argon2id** (ganador del
  *Password Hashing Competition* y recomendado por OWASP), configurado con
  memoria de 64 MB, 3 iteraciones y paralelismo de 4 hilos. Better Auth usa
  scrypt por defecto; Quina lo reemplaza con `@node-rs/argon2` mediante las
  funciones `password.hash` y `password.verify`. El hash vive en
  `accounts.password` (proveedor `credential`).
- **Protección contra fuga:** las contraseñas nunca se guardan en texto plano ni
  se retornan en consultas de API o DTOs de lectura.

### 7.2. Verificación de correo electrónico con código OTP de 6 dígitos

Para garantizar que el correo del comerciante o del cliente sea válido antes de
recibir notificaciones de deuda o acceso:

- **Generación aleatoria segura:** el servidor genera un número criptográfico
  pseudoaleatorio de 6 dígitos numéricos (`100000` a `999999`) usando
  `crypto.randomInt()`.
- **Almacenamiento seguro en base de datos:** el plugin `emailOTP` de Better
  Auth guarda el código en la tabla `verifications` con la opción
  `storeOTP: "hashed"`: nunca queda en texto plano.
- **Tiempo de vida (TTL):** el código expira automáticamente a los **15 minutos**
  de su emisión (`expiresIn: 900`).
- **Límite de reintentos y tasa (Rate limiting):**
  - Máximo **5 intentos erróneos** permitidos antes de invalidar el código
    (`allowedAttempts: 5`).
  - El botón de reenvío en la interfaz tiene un bloqueo de **60 segundos** entre
    solicitudes para evitar spam de correos.
- **Canal de despacho:** se envía una plantilla limpia en HTML a través del SDK
  de Resend en su capa gratuita.

### 7.3. Autenticación con Google (OAuth 2.0 federado)

La integración con Google OAuth 2.0 resuelve el acceso seguro e instantáneo sin
requerir memorizar contraseñas:

- **¿Requiere un servicio externo de pago? No.** Google Identity Services
  (Google Cloud OAuth 2.0) es **100 % gratuito y sin coste mensual** para
  autenticación de usuarios web estándar. Solo requiere crear un proyecto en
  Google Cloud Console, registrar la pantalla de consentimiento OAuth y generar
  un par de credenciales (`GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`).
- **Flujo de autorización:**
  1. El usuario hace clic en **"Continuar con Google"**.
  2. Next.js redirige al servidor de autorización de Google solicitando los
     ámbitos (`scopes`) mínimos: `openid`, `email` y `profile`.
  3. Google redirige a `/app/api/auth/callback/google` con un código de autorización.
  4. El servidor intercambia el código por tokens y obtiene el identificador
     único de usuario de Google (`sub`).
  5. Better Auth vincula la cuenta en la tabla `accounts` (`provider_id = 'google'`)
     si el correo ya existe, o crea el usuario con correo verificado. Los tokens
     de Google se guardan cifrados (`account.encryptOAuthTokens`).

### 7.4. Política anti-fuerza bruta y bloqueo temporal de cuentas (*Account Lockout*)

Para neutralizar ataques de diccionario y prueba automatizada de credenciales:

- **Monitoreo de intentos:** la tabla `users` mantiene el contador
  `failed_login_attempts SMALLINT`. Better Auth no trae este bloqueo: se
  implementa con sus *hooks* antes y después de `/sign-in/email`.
- **Regla de bloqueo:** tras **5 intentos fallidos consecutivos**, el sistema
  bloquea la cuenta fijando `locked_until = NOW() + INTERVAL '15 minutes'`.
- **Comportamiento en intento bloqueado:** cualquier intento de autenticación
  mientras `NOW() < locked_until` es rechazado inmediatamente con el mensaje:
  *"Cuenta temporalmente bloqueada por seguridad. Inténtalo de nuevo en 15 minutos o restablece tu contraseña."*
- **Reinicio automático:** un inicio de sesión exitoso reinicia el contador
  `failed_login_attempts` a `0` y limpia `locked_until`.
- **Notificación preventiva:** se despacha un correo de alerta por Resend
  notificando al usuario que se detectaron intentos sospechosos en su cuenta.

### 7.5. Protección perimetral contra bots: Cloudflare Turnstile

- **¿Es posible y gratuito? Sí, al 100 %.** Cloudflare Turnstile es una
  herramienta moderna de validación de visitantes completamente gratuita y sin
  límites de volumen para la mayoría de aplicaciones web.
- **Ventajas sobre reCAPTCHA v2 / v3:**
  - **Cero fricción:** no obliga al bodeguero Don Lucho ni a Doña Rosa a
    identificar semáforos, hidrantes o pasos peatonales en imágenes borrosas.
  - **Privacidad estricta:** no rastrea la navegación del usuario ni utiliza
    cookies para publicidad digital como las herramientas de Google.
  - **Modo interactivo y no interactivo:** se ejecuta de forma invisible en
    segundo plano; solo muestra una casilla de un clic si detecta anomalías en
    el navegador.
- **Validación dual (Cliente y Servidor):**
  - El componente React (`@marsidev/react-turnstile`) obtiene un token de desafío
    y lo envía en la cabecera `x-captcha-response`.
  - El plugin `captcha` de Better Auth (proveedor `cloudflare-turnstile`) valida
    el token contra la API de Cloudflare con la clave secreta del servidor antes
    de procesar el login, el registro o la recuperación de contraseña.

### 7.6. Recuperación de contraseña olvidada con enlace y token criptográfico

Cuando un usuario no recuerda su contraseña:

1. **Solicitud de rescate:** el usuario ingresa su correo en `/app/auth/forgot-password`.
2. **Mitigación de enumeración de usuarios:** el sistema siempre responde en
   pantalla: *"Si el correo ingresado se encuentra registrado, recibirás un enlace de recuperación en breve"*,
   impidiendo que atacantes descubran qué correos existen en Quina.
3. **Generación del token seguro:** Better Auth genera un token criptográfico de
   alta entropía y lo guarda en `verifications` con expiración de 30 minutos
   (`resetPasswordTokenExpiresIn: 1800`).
4. **Un solo uso:** al consumirse, el registro de `verifications` se elimina, de
   modo que el enlace no se puede reutilizar.
5. **Envío de correo por Resend:** se despacha un correo transaccional con el
   enlace de un solo uso:
   `https://quina.andeva.tech/app/auth/reset-password?token=<token_plano>`.
6. **Consumo y cambio de clave:** al abrir el enlace, Better Auth valida que el
   token exista y no haya expirado. El usuario ingresa su nueva contraseña
   segura, se cierran sus sesiones activas y un *hook* reinicia
   `failed_login_attempts` y `locked_until`.

### 7.7. Experiencia de usuario y accesibilidad para clientes vecinos (Doña Rosa)

Un dilema crítico de adopción en bodegas peruanas es que **si le exigimos a una
vecina de 58 años recordar una contraseña compleja de 12 caracteres con símbolos
para revisar su cuenta de fiados, abandonará el sistema y exigirá volver al
cuaderno de papel.**

Para resolver este desafío sin comprometer la seguridad, Quina diseña un modelo
de **acceso sin fricción (*Frictionless / Passwordless*)** con cuatro alternativas
pensadas para el vecino:

| Mecanismo de acceso | Experiencia del vecino (Doña Rosa) | Seguridad técnica |
| :--- | :--- | :--- |
| **1. Magic Link directo en notificaciones (1 clic)** | Cuando Doña Rosa recibe su resumen diario, el estado de cuenta, el recordatorio o el aviso de mora, el correo trae el botón *"Ver mi estado de cuenta"*. Lo toca, toca otra vez el botón de la página y entra sin ninguna clave. | Plugin `magicLink` de Better Auth: un solo uso, 72 horas, guardado con hash en `verifications`. El correo apunta a `/portal/enter`, que canjea el token por POST (decisión D5 del Plan 5). El alta solo se permite a correos que alguna tienda registró (D7). |
| **2. Continuar con Google (1 toque)** | El 95 % de celulares Android en el Perú tienen cuenta Gmail configurada. Al ingresar a `quina.andeva.tech`, Doña Rosa toca el botón de Google y su teléfono valida su identidad al instante. | Google OAuth 2.0 estándar vinculado al correo del cliente registrado en la tienda. |
| **3. Acceso por DNI + Código OTP (Sin contraseña)** | Si Doña Rosa entra desde otro teléfono, ingresa su número de DNI. El sistema le envía un código de 6 números a su correo. Lo copia, lo pega y entra. | El servidor busca los correos registrados para ese DNI, CE o pasaporte con `portal_emails_for_document` (puede estar en varias tiendas) y envía un código a cada correo distinto con el inicio de sesión por OTP del plugin `emailOTP`: 6 dígitos, 15 minutos, 5 intentos, Turnstile y un código por correo cada 60 s. La respuesta en pantalla es siempre la misma, sin revelar tiendas ni correos, y la sesión solo ve las tiendas que tienen el correo validado. |
| **4. Contraseña personalizada (Opcional)** | Si el cliente desea fijar una contraseña permanente para ingresar tradicionalmente con correo y clave, puede configurarla en su perfil cuando lo desee. | Almacenamiento seguro bajo Argon2id, totalmente voluntario para el vecino. |

### 7.8. Enlaces de cuenta: dueño creado por el Administrador, empleados y primer Administrador

Quien no se registra solo (el dueño de una tienda creada por el Administrador, un
empleado invitado o el primer Administrador de Plataforma) recibe un **enlace de
cuenta** para crear su contraseña:

- El usuario se inserta con Drizzle como *invitado*, sin contraseña. No se usa
  `signUpEmail`, cuyo hook fuerza el rol `PENDING_OWNER`.
- El token es aleatorio, de un solo uso y vale **72 horas**. En `verifications` se
  guarda solo su hash SHA-256, con `identifier = account-setup:<userId>`.
- La ruta pública `/app/auth/accept-invite?token=…` canjea el token: primero lo
  borra (reclamo atómico, para que dos envíos no lo usen dos veces), valida la
  contraseña con la política de la sección 7.1 y crea la cuenta `credential` con
  el `$context` de Better Auth (`password.hash` e `internalAdapter.linkAccount`).
  Marca `email_verified = true` y deja auditoría `SET_PASSWORD`.
- El dueño puede reenviar o cancelar la invitación de un empleado desde
  `/app/team`, y el Administrador, reenviar el enlace al dueño desde la ficha de la
  tienda.
- El primer Administrador se crea con `pnpm db:admin`, que lee `ADMIN_EMAIL` y
  `ADMIN_NAME` e imprime el enlace.

---

## 8. Persistencia relacional y esquema PostgreSQL

La persistencia del sistema está gobernada por un esquema relacional normalizado
en PostgreSQL 16 sobre Supabase, estructurado en torno a los Bounded Contexts de
la aplicación.

El detalle técnico exhaustivo, que incluye el diccionario de datos completo de
las **35 tablas**, los tipos de datos numéricos exactos, las restricciones de
integridad referencial, los índices compuestos de alto rendimiento, las
políticas de Row Level Security (RLS), los roles de base de datos y los esquemas
en Drizzle ORM, se encuentra documentado en:

👉 **[Especificación completa del esquema de base de datos PostgreSQL](quina-database-schema.md)**

---

## 9. Integración con el sitio público (`quina.andeva.tech`)

El sitio público (repositorio `quina-website`, Astro) y la webapp (repositorio
`quina-webapp`, Next.js) son proyectos separados en Vercel que se sirven bajo el
mismo dominio: el sitio en la raíz y la webapp en **`/app`**.

- **`basePath: '/app'`** en `next.config.ts`: todas las rutas, los recursos
  estáticos y los Route Handlers de la webapp viven bajo `/app`.
- **Rewrite desde el sitio:** el `vercel.json` del sitio reenvía `/app` y
  `/app/:path*` al despliegue de la webapp. Para el navegador todo es
  `quina.andeva.tech`, así que las cookies de sesión y la cookie de idioma se
  comparten sin configuración extra.
- **Rutas que el sitio ya enlaza:** `/app/register` (botones "Empieza gratis"),
  `/app/login` (botón "Ingresar") y la raíz `/app` (portal). El sitio redirige
  además `/login` → `/app/login`.
- **URLs absolutas:** los enlaces de los correos usan
  `https://quina.andeva.tech/app` (`APP_URL`); Better Auth recibe solo el origen en `baseURL` y la ruta en `basePath: "/app/api/auth"`. La URI de redirección autorizada en Google
  Cloud es `https://quina.andeva.tech/app/api/auth/callback/google`.
- **Redirecciones de Server Actions:** Next 16 agrega `basePath` al `redirect` de
  una acción solo cuando llega por `fetch`. Si el formulario se envía antes de
  cargar JavaScript, el 303 saldría de `/app`. Por eso las acciones usan
  `actionRedirect` (`src/presentation/lib/action-redirect.ts`), que completa la
  ruta en ese caso. Los formularios de búsqueda usan `next/form` con
  `action=""`, que se queda en la misma ruta con o sin JavaScript.

**Variables de entorno de la webapp:**

| Variable | Uso |
| :--- | :--- |
| `APP_URL` | URL pública de la webapp (`https://quina.andeva.tech/app`). |
| `DATABASE_URL` | Conexión de la aplicación con el rol `quina_app` por Supavisor (puerto 6543). |
| `DATABASE_MIGRATION_URL` | Conexión directa con el rol `postgres` (puerto 5432), solo para Drizzle Kit. |
| `DATABASE_PLATFORM_URL` | Conexión con el rol `quina_platform`, usada solo para escribir `credit_rate_caps`. |
| `ADMIN_EMAIL`, `ADMIN_NAME` | Correo y nombre del primer Administrador de Plataforma, para `pnpm db:admin`. |
| `BETTER_AUTH_SECRET` | Secreto para firmar sesiones y cifrar tokens de OAuth. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Credenciales de Google OAuth 2.0. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Claves de Cloudflare Turnstile. |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Envío de correos y webhook de rebotes. |
| `MP_TRANSPORT` | Pasarela de suscripción: `mercadopago` (SDK oficial) o `local` (pasarela simulada en desarrollo y pruebas). |
| `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | Mercado Pago: suscripciones y validación HMAC de webhooks (`/app/api/webhooks/mercadopago`). |
| `GROQ_API_KEY` | Recomendaciones con IA. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Solo Supabase Storage desde el servidor (comprobantes y QR de cobro). |
| `QUINA_APP_DB_PASSWORD`, `QUINA_PLATFORM_DB_PASSWORD` | Contraseñas que `pnpm db:roles` asigna a los roles `quina_app` y `quina_platform`. |
| `EMAIL_TRANSPORT` | Transporte de correo: `resend` (envía de verdad) u `outbox` (guarda los correos en la base, para desarrollo y pruebas). |
| `EMAIL_FROM` | Remitente de los correos (`Quina <hola@andeva.tech>`). |
| `DATABASE_TEST_URL` | Pruebas de integración: conexión del propietario, que migra y limpia la base de prueba. |
| `DATABASE_TEST_APP_URL` | Pruebas de integración: conexión como `quina_app`, para comprobar RLS. |
| `DATABASE_TEST_PLATFORM_URL` | Pruebas de integración: conexión como `quina_platform`. |
| `CRON_SECRET` | Protege el proceso programado diario. |
| `ALLOW_SIMULATED_NOW` | Solo fuera de producción: con `1`, el cron acepta la cabecera `x-quina-now` para simular la fecha (pruebas y demo). |
| `DEMO_STORE_ID`, `DEMO_CONFIRM`, `DEMO_EMAIL` | Solo para `pnpm demo:collections` (sección 11.3). |

---

## 10. Idiomas: castellano, inglés y quechua

El sitio público ofrece castellano, inglés y quechua, y guarda la elección en la
cookie `quina-lang`. La webapp continúa esa elección:

- **Librería:** `next-intl`, con un archivo de mensajes por idioma
  (`messages/es.json`, `messages/en.json`, `messages/qu.json`) en la raíz del
  repositorio. La configuración de `next-intl` vive en `src/presentation/i18n/`.
  Ningún texto de interfaz se escribe suelto en los componentes.
- **Sin idioma en la URL:** igual que la cookie compartida, el idioma no forma
  parte de la ruta (`/app/sales`, no `/app/es/sales`; las rutas van en inglés, como en la sección 5).
- **Orden de resolución:** `users.preferred_locale` (si hay sesión) → cookie
  `quina-lang` → cabecera `Accept-Language` → castellano. Al registrarse, el
  idioma de la cookie se guarda en `users.preferred_locale`.
- **Correos a vecinos:** se redactan en `customers.preferred_locale` o, si no
  tiene, en `stores.default_locale`.
- **Formatos:** montos y fechas siempre con formato peruano (`es-PE`, `S/`),
  sea cual sea el idioma de la interfaz.
- **Quechua:** los textos en quechua son un borrador pendiente de revisión por
  un traductor nativo, igual que en el sitio.

---

## 11. Procesos programados y correos

### 11.1. Proceso diario único

Las tareas automáticas corren en **un solo proceso diario**
(`/app/api/cron/daily`), compatible con el plan Hobby de Vercel (Cron una vez al
día). Se agenda a las 11:00 UTC (06:00 en Lima), exige la cabecera con
`CRON_SECRET` y cada paso es **idempotente**: si se repite, no duplica cargos,
cortes ni correos.

El proceso corre con la conexión de la aplicación (`quina_app`, sin `BYPASSRLS`):
lista las tiendas activas (`stores` no tiene RLS) y ejecuta cada paso dentro de
`withTenant(storeId, ...)`, una tienda a la vez.

El orden quedó fijado en el Plan 4 (D1b): los pasos de datos de todas las
tiendas van primero y los envíos al final, cortados antes del límite de 60 s de
la función (`maxDuration`); lo que no salga, sale al día siguiente.

| Orden | Paso | Qué hace |
| :---: | :--- | :--- |
| 1 | Conformidad tácita | Los cargos `PENDING` cuyo `consent_deadline` ya pasó quedan `ACCEPTED`. |
| 2 | Cortes | Liquida, del más antiguo al más nuevo, todo ciclo `OPEN` cuyo corte ya pasó (las compras hasta las 23:59:59, hora de Lima, del día de corte entran al ciclo), así un día sin cron se recupera al siguiente. Crea el ciclo si solo vencen cuotas, calcula intereses, descuenta los cargos anulados y pasa el ciclo a `BILLED` (o a `PAID` si queda en 0). Pone en cola el estado de cuenta. |
| 3 | Mora | Pasa a `OVERDUE` los ciclos `BILLED` vencidos y sus cuotas, y pone en cola el aviso de mora. Con un ciclo `OVERDUE`, el vecino no puede comprar al crédito hasta pagarlo. |
| 4 | Resumen diario de cargos | Agrupa por vecino los cargos sin notificar de días anteriores en **un correo por vecino** (`CHARGE_DIGEST`). Al enviarlo marca `notified_at` y fija `consent_deadline` 48 h después. |
| 5 | Recordatorios | `PAYMENT_REMINDER` a los ciclos todavía `BILLED` que vencen entre hoy y dentro de 3 días. El índice único de `notification_logs` impide duplicados. |
| 6 | Suscripciones | Al terminar la prueba Pro de 14 días, los 5 días hábiles de gracia tras un pago rechazado o el periodo pagado con renovación cancelada, la tienda pasa al Plan Casero. Si al pasar a Casero el uso supera los límites del plan, la tienda entra en modo solo lectura hasta que el dueño pague o ajuste su uso (US26 crit. 7). También envía el aviso único 3 días antes de que termine la prueba Pro (US25 crit. 3). |
| 7 | Envíos | Manda lo que quedó en cola (y reintenta lo fallido de los últimos 3 días), uno por uno. |

Los pasos 4 y 5 y el aviso de mora son automáticos solo en **Bodega Pro** y
**Negocio Plus**. En el **Plan Casero** el resumen y los recordatorios salen con
los botones de Cobranza (decisión P5), y el plazo de 48 h de conformidad cuenta
desde ese envío. Los cortes, la mora, el estado de cuenta y el comprobante de
pago corren en todos los planes.

Fuera de producción (`VERCEL_ENV` distinto de `production`) y con
`ALLOW_SIMULATED_NOW=1`, la cabecera `x-quina-now` simula la fecha:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" -H "x-quina-now: 2026-10-21T11:00:00Z" \
  http://localhost:3000/app/api/cron/daily
```

### 11.2. Presupuesto de correos (Resend, capa gratuita)

La capa gratuita de Resend permite **100 correos al día y 3,000 al mes**, con el
dominio `andeva.tech` ya verificado. Para un producto académico con pocas tiendas
alcanza gracias al resumen diario: cada vecino recibe como máximo un aviso de
cargos al día, en lugar de uno por compra.

- **Prioridad:** los correos de autenticación (OTP, recuperación, bloqueo) se
  envían siempre al momento. Los resúmenes diarios van al final del proceso.
- **Si se agota la cuota:** los resúmenes que no salieron conservan
  `notified_at` vacío y se envían al día siguiente; el plazo de 48 h cuenta desde
  el envío real, nunca desde la compra.
- **Rebotes:** el webhook de Resend (`/app/api/webhooks/resend`, eventos
  `email.delivered` y `email.bounced`) marca el envío como `BOUNCED` en
  `notification_logs` y llena `customers.email_bounced_at`, lo que muestra una
  alerta en la ficha del vecino.

### 11.3. Datos de demostración (`pnpm demo:collections`)

Para mostrar el corte, la mora y el cobro sin esperar un mes (decisión P8):

```bash
DEMO_STORE_ID=<id de la tienda> DEMO_CONFIRM=<host de DATABASE_URL> pnpm demo:collections
```

Crea en esa tienda tres productos y cuatro vecinos con compras de fechas
pasadas: Rosa con un ciclo vencido (se cobra con mora), Juan con un pago en 2
días, Carmen con un ciclo abierto (para observar un cargo) y Pedro con una
licuadora en 3 cuotas. Luego corre el proceso diario de hoy. `DEMO_EMAIL`
(opcional, `nombre@dominio`) envía los correos a `nombre+alias@dominio`; sin él
van a `example.test`. Se niega a correr con `VERCEL_ENV` o `NODE_ENV` en
`production` y sin `DEMO_CONFIRM` igual al host de la base. Corre con Vitest
(`vitest.demo.config.ts`) solo para resolver los alias `@/`; no es una prueba.
