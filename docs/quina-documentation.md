# Quina - Documentación técnica

Este documento es la fuente de la verdad sobre qué es Quina y qué hace. Sirve
como punto de entrada a la documentación técnica del producto: describe el
sistema a alto nivel y enlaza con los documentos específicos de cada área a
medida que se crean.

---

## Descripción general

Quina es una aplicación web progresiva (PWA) multi-tienda (_multi-tenant_) de
gestión comercial y de crédito para pequeños comercios de barrio, como bodegas,
boticas, panaderías, carnicerías, licorerías, peluquerías y spas. Reemplaza el
cuaderno de fiados con el que el dueño del negocio controla las deudas de sus
clientes vecinos y está diseñada desde su punto de vista.

La plataforma funciona de forma genérica para cualquier giro de negocio y
permite que muchas tiendas operen simultáneamente con sus datos aislados entre
sí. Distingue tres tipos de usuario, todos con acceso autenticado:

- **Administrador de la plataforma:** da de alta y de baja a las tiendas.
- **Usuarios del negocio:** el dueño y sus empleados, con permisos por rol.
- **Cliente:** el vecino que compra al crédito y consulta su estado de cuenta.

Por cada cliente, Quina registra las condiciones de crédito pactadas: tasa de
interés nominal o efectiva, tasa moratoria, moneda, límite de crédito, plazo
máximo, fecha de corte y fecha de pago. Con esos datos, el sistema calcula los
intereses y las cuotas de cada compra, genera la liquidación en cada fecha de
corte y deja registro auditable de todas las operaciones.

Además del crédito, Quina ayuda a administrar el negocio con un inventario
valorizado, el registro de compras a proveedores, reportes del periodo y
recomendaciones generadas por inteligencia artificial.

---

## Características

Las características de Quina se dividen en dos grupos. El _core business_
reúne lo que el enunciado del curso exige y lo que define al producto: el
control del crédito. Las características complementarias agregan valor
comercial y convierten a Quina en una herramienta de gestión del negocio.

### Core business

Estas características son obligatorias. Sin ellas, Quina no cumple su
propósito de reemplazar el cuaderno de fiados.

#### Gestión de tiendas

El administrador de la plataforma da de alta y de baja a las tiendas, con sus
credenciales y datos del negocio. Cada tienda opera de forma independiente y
solo accede a su propia información.

#### Autenticación segura y control de accesos

El acceso al sistema combina alta seguridad para la gestión comercial con una
experiencia sin fricción para los clientes vecinos:

- **Contraseñas seguras y hashing:** almacenamiento mediante Argon2id (o
  bcrypt) con políticas de complejidad que impiden contraseñas débiles.
- **Verificación de correo con OTP:** código numérico de 6 dígitos con 15
  minutos de expiración para validar cuentas y correos antes de operar.
- **Acceso con Google (OAuth 2.0):** inicio de sesión rápido en un toque
  utilizando Google Cloud Identity sin costes para el proyecto.
- **Protección perimetral con Turnstile:** captcha 100 % gratuito de Cloudflare
  que bloquea bots sin retos molestos de imágenes.
- **Bloqueo anti-fuerza bruta:** bloqueo temporal automático de la cuenta por 15
  minutos tras 5 intentos fallidos consecutivos.
- **Recuperación con token de un solo uso:** enlace temporal firmado enviado por
  correo con expiración de 30 minutos para restablecer credenciales.
- **Acceso sin contraseñas obligatorias para vecinos:** los clientes consultan
  su cuenta mediante enlaces directos (_Magic Links_) en los correos de compra,
  con su cuenta de Google o con DNI y código OTP, evitando que abandonen el
  sistema por olvidar contraseñas complejas.

#### Catálogo de productos y servicios

El dueño registra los productos y servicios que vende con proveedor, marca,
descripción, unidad de medida e imagen. Cada ítem tiene un precio al contado y
un precio de lista al crédito, e indica si se puede vender en cuotas.

- El dueño fija y modifica los precios de venta cuando lo desea.
- Cada cambio de precio queda en un historial con autor y fecha.
- Al vender, siempre se aplica el precio vigente del catálogo.
- Las ventas registradas conservan el precio con el que se hicieron.

#### Gestión de clientes y condiciones de crédito

El dueño da de alta y de baja a sus clientes con sus datos generales y sus
condiciones de crédito:

- Tasa de interés compensatoria, nominal o efectiva.
- Tasa de interés moratoria, nominal o efectiva.
- Moneda del crédito: soles (PEN) o dólares (USD).
- Límite máximo de crédito.
- Número máximo de meses para pagar en cuotas.
- Fecha de corte mensual y fecha de pago mensual.

Al registrarse, el cliente acepta la Política de Privacidad y da su
consentimiento para el tratamiento de sus datos personales, según la Ley
N.° 29733, Ley de Protección de Datos Personales.

#### Registro de ventas

Cada venta se registra en una de tres modalidades:

| Modalidad          | Descripción                                                                                                   |
| :----------------- | :------------------------------------------------------------------------------------------------------------ |
| **Contado**        | El cliente paga en el momento. No genera deuda.                                                               |
| **Pago único**     | El cliente paga toda la deuda del ciclo en la fecha de pago, con interés compensatorio por días transcurridos. |
| **Cuotas mensuales** | La compra se divide en cuotas con el método francés vencido ordinario.                                        |

#### Motor financiero

El motor financiero aplica las reglas de cálculo que exige el enunciado:

- **Año comercial:** meses de 30 días. Los días entre dos fechas se cuentan en
  base comercial 30/360: el día 31 cuenta como 30 y febrero se completa hasta 30.
- **Tasas nominales y efectivas:** el sistema convierte entre ambas según lo
  pactado con cada cliente. Una tasa nominal se convierte de forma compuesta con
  su capitalización pactada ($TEA = (1 + TNA/m)^m - 1$); desde la TEA se obtienen
  la tasa mensual del método francés ($TEM = (1+TEA)^{30/360} - 1$) y la tasa
  diaria de los intereses por días ($i_d = (1+TEA)^{1/360} - 1$).
- **Pago único:** las compras hechas antes de la fecha y hora de corte pagan
  interés compensatorio por los días entre la compra y la fecha de pago. Las
  compras posteriores al corte pasan al ciclo siguiente.
- **Cuotas con método francés vencido ordinario:** los días entre la compra y
  la fecha de pago pactada del ciclo al que pertenece la compra se tratan como
  periodo de gracia total. La deuda se capitaliza por ese periodo antes de
  calcular la cuota fija, y la primera cuota vence un mes después de esa fecha
  de pago.
- **Interés moratorio:** si el cliente paga después de la fecha pactada, se
  cobra interés moratorio con la tasa moratoria pactada, por los días de atraso,
  sobre el total exigible del ciclo vencido. Durante la mora no corre interés
  compensatorio, y las cuotas futuras que aún no vencen no entran en la base.

Las fórmulas, su desarrollo y los dos juegos de datos de prueba están en el
[documento del motor financiero](quina-financial-engine.md).

#### Reglas de crédito

El sistema aplica estas restricciones en cada operación:

- No permite compras que superen el límite de crédito disponible del cliente.
  La deuda que consume el límite es el capital de los cargos de pago único sin
  pagar, el capital pendiente de las cuotas (sin intereses futuros) y los
  intereses ya liquidados sin pagar.
- No permite nuevas compras al crédito mientras el cliente tenga un ciclo
  vencido; el fiado se reabre al pagarlo.
- No permite pagos parciales de la deuda en la fecha de pago.
- No permite ventas de productos sin stock suficiente.

#### Liquidación en la fecha de corte

En cada fecha de corte, Quina genera el listado de lo que cada cliente debe
pagar en su fecha de pago. La liquidación incluye:

- Las compras del ciclo ordenadas por fecha.
- Los intereses compensatorios acumulados por cada compra.
- Las cuotas que vencen en el periodo.
- Los cargos anulados que se descuentan en el periodo.
- Un concepto separado de intereses moratorios, cuando hay atraso.

Si en un periodo vence una cuota aunque el cliente no haya comprado nada, el
corte genera igual su liquidación.

#### Registro de pagos

El dueño registra los pagos de los clientes. Cada pago cancela el total de un
ciclo ya liquidado: no se paga un ciclo abierto ni una parte de uno. Si el
cliente paga antes de su fecha de pago, paga el monto liquidado en el corte, sin
recalcular. Si el pago llega después de la fecha pactada, el sistema calcula y
agrega los intereses moratorios correspondientes. Con varios ciclos vencidos, se
pagan uno por uno, empezando por el más antiguo.

#### Auditoría y trazabilidad

Quina registra todas las operaciones en la base de datos: quién las hizo,
cuándo y sobre qué registro. Los movimientos financieros y de inventario no se
editan ni se borran; los errores se corrigen con movimientos de ajuste.

### Características complementarias

Estas características no son obligatorias en el enunciado, pero aumentan el
valor de Quina como producto real para el mercado.

#### Inventario valorizado

Quina controla el stock de cada producto con un kardex: un historial inmutable
de todos sus movimientos. Los servicios no manejan stock.

| Movimiento          | Origen                                               | Efecto  |
| :------------------ | :--------------------------------------------------- | :------ |
| Entrada por compra  | Compra registrada a un proveedor.                    | + stock |
| Salida por venta    | Automática al registrar una venta.                   | − stock |
| Merma               | Producto vencido, dañado o perdido, con su motivo.   | − stock |
| Ajuste por conteo   | Diferencia entre el conteo físico y el sistema.      | ± stock |
| Devolución          | Producto devuelto por un cliente.                    | + stock |

- Las cantidades admiten decimales para productos que se venden por peso o
  volumen, como kilos o litros.
- El costo de cada producto se calcula con el método de costo promedio
  ponderado, que se actualiza con cada compra.
- Cada venta guarda el costo vigente del producto para calcular el margen
  real.
- El sistema alerta cuando el stock de un producto baja de su mínimo.

#### Compras a proveedores

El dueño registra las compras que hace a sus proveedores con los productos,
cantidades y costos unitarios. Cada compra puede incluir los datos del
comprobante del proveedor (factura, boleta o guía, con serie y número) y una o
varias imágenes o archivos PDF del documento.

Los comprobantes se guardan en un almacenamiento privado. Cada tienda solo
accede a sus propios archivos, mediante enlaces temporales.

#### Usuarios y roles por tienda

Cada tienda puede tener varios usuarios, como el dueño y sus empleados. Los
permisos se asignan por rol (RBAC), y cada operación registra qué usuario la
realizó.

#### Notificaciones por correo

Quina envía correos a los clientes en estos casos:

- Cuando se registra un cargo a su cuenta.
- Antes de su fecha de pago, como recordatorio.
- Cuando entra en mora.

#### Conformidad liviana de cargos

Cada cargo se notifica al cliente por correo. Si el cliente no lo objeta
dentro del plazo definido, el cargo queda aceptado automáticamente. Así, el
dueño cuenta con un respaldo de la deuda sin que el cliente tenga que hacer
nada. Si el cliente lo objeta, el cargo sigue en su ciclo hasta que el dueño lo
confirma o lo anula; la anulación es un movimiento de ajuste que devuelve el
stock y descuenta el monto.

#### Puntaje interno del cliente

Quina calcula un puntaje para cada cliente según su historial de pagos
puntuales y moras. El puntaje ayuda al dueño a decidir si aumenta o reduce el
límite de crédito.

#### Panel de cartera

El panel muestra el estado del crédito del negocio de un vistazo: deuda total
por cobrar, morosidad, clientes en riesgo y proyección de cobros del mes.

#### Reportes por rango de fechas

El dueño genera reportes del periodo que elija, con la siguiente información:

- Ventas al contado y al crédito.
- Intereses compensatorios y moratorios cobrados.
- Costo de ventas y margen bruto.
- Compras a proveedores y mermas valorizadas.
- Valor del inventario al cierre del periodo.
- Productos más vendidos y productos con stock bajo.

#### Recomendaciones con inteligencia artificial

A partir de los reportes, Quina genera recomendaciones para el negocio con un
modelo de lenguaje. Cada tienda tiene una cuota de consultas para mantener el
servicio dentro de los límites del proveedor de IA.

#### Asistente tributario informativo

Quina suma las ventas del mes y avisa cuando se acercan al tope de la
categoría del régimen tributario del negocio, como el Nuevo RUS. Los montos de
cada categoría son configurables porque la SUNAT puede actualizarlos.

<!-- prettier-ignore -->
> [!IMPORTANT]
> El asistente tributario es solo informativo. Quina no calcula impuestos
> oficiales, no presenta declaraciones ni emite comprobantes electrónicos.

#### Aplicación instalable y registro rápido

Quina se instala en el celular como PWA, sin pasar por una tienda de
aplicaciones, y tolera conexiones inestables. Registrar una venta toma pocos
toques, para que sea tan rápido como anotarla en el cuaderno.

---

## Fuera de alcance

Quina no incluye estas funcionalidades:

- Registro de otros gastos del negocio, como alquiler, servicios o sueldos.
- Cálculo oficial o declaración de impuestos a la renta o a las ventas.
- Emisión de comprobantes electrónicos ante la SUNAT.
- Pagos parciales de la deuda en la fecha de pago.
- Aplicación móvil nativa.

---

## Servicios externos e infraestructura cloud

Para hacer viable la operación de Quina como producto real sin incurrir en
costos fijos de infraestructura durante la fase de desarrollo, validación y
demostración académica, la plataforma se apoya en un ecosistema de servicios en
la nube que ofrecen capas gratuitas robustas (_free tiers_).

Todos los servicios seleccionados garantizan alta disponibilidad, seguridad
empresarial y aislamiento multi-inquilino (_multi-tenant_).

### Dominio, DNS y seguridad perimetral

La plataforma se despliega públicamente bajo el subdominio oficial
`quina.andeva.tech`, configurado sobre el dominio raíz `andeva.tech`.

- **Cloudflare (Capa gratuita):**
  - **Gestión de DNS:** resolución rápida de registros CNAME hacia el hosting.
  - **Seguridad perimetral:** cortafuegos WAF, mitigación de ataques DDoS y
    certificados SSL/TLS automáticos de extremo a extremo.
  - **Caché y optimización:** compresión de recursos estáticos en la red perimetral
    para acelerar la carga en redes móviles lentas.
  - **Cloudflare Turnstile (100 % gratuito e ilimitado):** verificación de
    visitantes sin retos visuales para proteger el login, registro de clientes y
    recuperación de contraseñas contra ataques de bots.

### Identidad federada y autenticación

El inicio de sesión de comerciantes y clientes se apoya en infraestructura
gratuita de autenticación federada.

- **Google Cloud Identity / OAuth 2.0 (Capa gratuita sin coste mensual):**
  - **Acceso en un toque:** permite a dueños de negocios y clientes vecinos
    autenticarse instantáneamente con su cuenta de Google/Gmail configurada en
    su celular Android.
  - **Viabilidad del proyecto:** Google Cloud no cobra tarifas mensuales ni por
    volumen de autenticaciones web estándar para OAuth 2.0 Client IDs.

### Despliegue y computación de la aplicación

La aplicación web progresiva y sus rutas de servidor se ejecutan de manera
unificada en una plataforma de despliegue continuo.

- **Vercel (Plan Hobby / Capa gratuita):**
  - **Hosting de la webapp:** despliegue de la aplicación en Next.js con soporte
    nativo para renderizado en servidor (SSR) y acciones de servidor (_Server
    Actions_).
  - **Integración continua:** despliegues automáticos por cada confirmación
    (_push_) en el repositorio de Git con vistas previas por rama.
  - **Red de distribución de contenido (CDN):** entrega optimizada de activos
    estáticos con baja latencia para usuarios en el Perú.

### Base de datos y almacenamiento de archivos

Los datos relacionales del sistema y los archivos adjuntos se gestionan en una
plataforma de base de datos como servicio (BaaS).

- **Supabase (Plan Free / Capa gratuita):**
  - **PostgreSQL gestionado:** base de datos relacional transaccional (hasta 500 MB
    en capa gratuita), con soporte de seguridad a nivel de fila (_Row Level
    Security - RLS_) para aislar los datos de cada tienda de forma estricta.
  - **Supabase Storage (hasta 1 GB gratuito):**
    - _Bucket privado:_ almacenamiento de facturas y boletas adjuntas de
      proveedores, accesibles únicamente por el dueño del comercio mediante
      enlaces firmados temporales (_signed URLs_).
    - _Bucket público:_ almacenamiento de imágenes de productos y logos de
      tiendas.

### Correos transaccionales y notificaciones

Las comunicaciones por correo electrónico entre el sistema, los comerciantes y los
vecinos clientes se gestionan mediante una API especializada en entregabilidad.

- **Resend (Capa gratuita):**
  - **Capacidad:** hasta 3,000 correos electrónicos al mes (100 por día), volumen
    suficiente para pruebas de campo y evaluación académica.
  - **Casos de uso:**
    - Resumen diario de cargos por vecino: un solo correo con las compras
      fiadas del día anterior (conformidad liviana de 48 horas).
    - Recordatorios automáticos de liquidación antes de la fecha de pago pactada.
    - Avisos de incurrimiento en mora y desglose de intereses moratorios.
    - Confirmación y verificación de cuentas de usuario.

### Pasarela de pagos para suscripciones del negocio

La monetización B2B de los planes de suscripción (Plan Bodega Pro y Plan Negocio
Plus) se procesa a través de una pasarela con soporte nativo para el mercado
peruano.

- **Mercado Pago (Sin costo fijo mensual / Comisión por cobro exitoso):**
  - **Suscripciones recurrentes:** débito automático mensual y anual en soles
    (PEN) para los comerciantes suscritos a planes de pago.
  - **Métodos locales:** aceptación de tarjetas de crédito, débito, transferencias y
    billeteras digitales locales (Yape / Plin vía pasarela).
  - **Webhooks de facturación:** sincronización automática del estado de la
    suscripción para activar o suspender funciones Pro en la base de datos de
    Quina.

### Motor de recomendaciones con inteligencia artificial

El análisis financiero periódico y la generación de recomendaciones comerciales
para los dueños de negocios se alimentan de una API de inferencia de modelos de
lenguaje de alto rendimiento.

- **Groq Cloud API (Capa gratuita para desarrolladores):**
  - **Inferencia ultrarrápida:** ejecución de modelos abiertos avanzados (como
    Llama 3) con límites generosos de solicitudes por minuto en su capa gratuita.
  - **Control de costos y cuotas:** asignación de una cuota mensual máxima de
    consultas por tienda (20 en Plan Pro, 100 en Plan Plus) para garantizar que el
    consumo nunca supere los límites gratuitos de la plataforma.

---

## Marco legal y teórico

Quina opera bajo el marco normativo peruano aplicable al crédito mercantil
y a la protección al consumidor, y adopta estándares formales de ingeniería de
software para asegurar la calidad y mantenibilidad del producto.

### Marco normativo peruano

El diseño de la plataforma se alinea con la legislación nacional vigente:

- **Ley N.° 29733 (Ley de Protección de Datos Personales) y D.S. 003-2013-JUS:**
  regula el consentimiento informado previo de los vecinos al registrarse,
  garantizando el tratamiento confidencial y la seguridad de sus datos
  personales.
- **Ley N.° 31143 (Ley contra la Usura) y disposiciones del BCRP:** establece
  los topes máximos de tasas de interés compensatorias y moratorias para créditos
  fuera del sistema financiero, impidiendo cobros abusivos en el crédito barrial.
- **Ley N.° 29571 (Código de Protección y Defensa del Consumidor):** exige
  transparencia en las condiciones pactadas, liquidaciones desglosadas por compra
  y la prohibición expresa de cargos o penalidades no informados previamente.
- **Régimen del Nuevo RUS (Decreto Legislativo N.° 937):** sirve de base
  normativa para el asistente tributario informativo, monitoreando los topes
  mensuales de ingresos de los pequeños comercios.

### Marco teórico y metodológico de ingeniería

El ciclo de desarrollo y la arquitectura siguen estándares reconocidos de la
industria:

- **Metodología de gestión del proyecto:** marco ágil **Scrum** para entregas
  iterativas e incrementales por sprints de trabajo.
- **Ciclo de vida del software:** estándar **ISO/IEC/IEEE 12207** para la
  definición estructurada de procesos de desarrollo, pruebas y mantenimiento.
- **Modelo de calidad de software:** estándar **ISO/IEC 25010** con énfasis en
  usabilidad rápida en mostrador, seguridad de la información y fiabilidad
  financiera.
- **Seguridad en aplicaciones web:** directrices de **OWASP Top 10** aplicadas
  a la autenticación, autorización basada en roles (RBAC) y sanitización de datos.
- **Estándar de base de datos relacional:** estándar **ANSI/ISO SQL** sobre motor
  PostgreSQL con propiedades transaccionales ACID y aislamiento por tienda
  mediante políticas RLS.

---

## Algoritmos y flujos de información

La lógica financiera y los procesos operativos de Quina se modelan mediante
algoritmos deterministas y diagramas de actividades que garantizan cálculos
precisos y auditables.

### Algoritmos del motor financiero

El motor matemático central está documentado en pseudocódigo en el
[documento del motor financiero](quina-financial-engine.md), sección 4:

- **Algoritmo de capitalización por período de gracia:** capitaliza los
  intereses compensatorios generados entre la fecha de compra y la fecha de pago
  pactada del ciclo de la compra antes de calcular las cuotas.
- **Algoritmo del método francés vencido simple ordinario:** calcula la cuota
  mensual constante considerando año comercial de 360 días y meses de 30 días.
- **Algoritmo de liquidación a fecha de corte:** calcula los intereses
  compensatorios acumulados por compras a fin de mes según los días transcurridos.
- **Algoritmo de cálculo de intereses moratorios:** aplica la tasa moratoria
  pactada sobre el saldo total impago por los días de retraso transcurridos.

### Flujos de procesos y diagramas de actividades

Los procesos principales del sistema se modelan mediante diagramas de
actividades:

- **Flujo de despacho rápido al crédito:** validación instantánea de límite de
  crédito disponible y stock antes de registrar la venta.
- **Flujo de corte y liquidación mensual:** consolidación de compras, cálculo
  automático de intereses y emisión de estados de cuenta por correo.
- **Flujo de pago y cancelación de deuda:** liquidación total de la deuda y
  cálculo condicional de mora si el pago supera la fecha pactada.

---

## Próximos pasos y documentación especializada

Este documento enlaza con la documentación técnica y estratégica de cada área a
medida que se desarrolla:

- **Estrategia y producto:**
  - [Priorización de características y propuesta de valor](feature-prioritization.md):
    evaluación ICE, modelo Kano, panorama competitivo en el Perú y Top 5 de
    propuesta de valor.
  - [Estrategia de monetización y precios (Pricing)](pricing-strategy.md):
    modelo B2B Freemium (Plan Casero gratis, Plan Bodega Pro a S/ 29/mes),
    métrica de valor y justificación de ROI para el comerciante.
  - [Contexto de Product Marketing](product-marketing.md):
    público objetivo, personas, dolores del bodeguero, diferenciación,
    dinámicas de cambio y lenguaje del cliente.
  - [Historias de Usuario para SCRUM](quina-user-stories.md):
    27 historias bajo el marco de las 3 C's e INVEST, cubriendo el 100 % de las
    características del producto en 5 Sprints con trazabilidad académica.
- **Técnica e ingeniería:**
  - [Arquitectura y stack tecnológico de la Webapp](quina-webapp-documentation.md):
    especificación full-stack en Next.js, componentes con Boneyard y Sileo,
    Drizzle ORM, descarte de sobreingeniería y estructura del proyecto.
  - Arquitectura y stack tecnológico del Website (repositorio `quina-website`):
    especificación técnica en Astro 5, islas React, Tailwind CSS v4, animaciones GSAP/Lenis,
    cumplimiento legal y Libro de Reclamaciones.
  - [Sistema visual de la webapp (DESIGN.md)](DESIGN.md):
    tokens de color y tema oscuro compartidos con el sitio, tipografía Albert Sans,
    componentes, estados del crédito y accesibilidad.
  - Marco legal y normativo detallado (referencias jurídicas y citas).
  - Arquitectura de sistemas y diagramas C4 (Structurizr DSL).
  - [Esquema de base de datos relacional PostgreSQL](quina-database-schema.md):
    modelo ER, diccionario de datos de 35 tablas, script DDL, tipos numéricos, roles y políticas RLS.
  - Motor financiero y algoritmos (fórmulas en LaTeX, pseudocódigo y casos de prueba).
  - Seguridad, autenticación y protección de datos personales.
  - Diseño de la interfaz y flujos de usuario (wireframes).

Para consultar los requisitos del curso, revisa el
[enunciado del trabajo final](project-statement.md).
