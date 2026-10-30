# Quina - Priorización de características

Este documento identifica la propuesta de valor real de Quina: qué
características importan más al dueño del negocio y cuáles diferencian a Quina
de la competencia. Sirve de base para el posicionamiento del producto, el
modelo de precios y el orden de desarrollo.

Para la descripción de cada característica, revisa la
[documentación técnica de Quina](quina-documentation.md).

---

## Objetivo y métricas de éxito

Quina busca que el dueño de un comercio de barrio deje el cuaderno de fiados y
cobre más, con menos esfuerzo y menos conflictos con sus clientes. El análisis
mide cada característica contra estas métricas:

- **Adopción:** el dueño registra sus fiados en Quina y no en el cuaderno.
- **Recuperación de deuda:** baja el porcentaje de deuda vencida (morosidad).
- **Retención:** el negocio sigue usando Quina mes a mes.
- **Cumplimiento académico:** la característica satisface la rúbrica del curso.

---

## Panorama competitivo

En el Perú ya existen aplicaciones que digitalizan el cuaderno de fiados. Esto
confirma que el problema es real, pero también obliga a Quina a diferenciarse.

| Competidor                    | Enfoque                                        | Qué hace bien                                  | Dónde se queda corto                                    |
| :---------------------------- | :--------------------------------------------- | :--------------------------------------------- | :------------------------------------------------------ |
| **Treinta**                   | Gestión integral (POS, inventario, fiados)     | Inventario, ventas, estadísticas, freemium     | El fiado es un saldo pendiente, sin intereses ni ciclos |
| **Rapinota**                  | Ventas y fiados para emprendedores peruanos    | Funciona sin internet, Yape/Plin, cierre de caja | Sin condiciones de crédito ni cálculo financiero       |
| **Clarito**                   | Fiado como forma de pago ligada al cliente     | Simplicidad                                    | Solo registra saldos                                    |
| **Bogero**                    | Fiados con alertas, inventario y vendedores    | Integral, alertas de vencimiento               | Sin intereses pactados ni liquidación por ciclo         |
| **Libretas de deudas**        | Registro de deudas y pagos                     | Estados de cuenta en PDF por WhatsApp          | Sin inventario, sin multi-tienda, sin reglas de crédito |
| **CobrApp**                   | Cobranza de préstamos y rutas                  | Calcula intereses automáticamente              | Orientada a prestamistas, no a comercios con catálogo   |
| **Cuaderno de papel**         | El método actual                               | Gratis, rápido, sin aprendizaje                | Se pierde, genera disputas, no calcula nada             |

<!-- prettier-ignore -->
> [!NOTE]
> La información de competidores proviene de una búsqueda pública realizada el
> 6 de octubre de 2026 y debe verificarse antes de citarla en el informe.

### Hallazgo principal

Los competidores tratan el fiado como un **saldo pendiente**: anotan cuánto
debe el cliente y recuerdan cobrarlo. Ninguno de los comercios analizados
trata el fiado como un **crédito con reglas**: condiciones pactadas, intereses
calculados con método financiero, ciclos de corte y pago, liquidación formal e
intereses moratorios separados. Ese espacio vacío es la propuesta de valor de
Quina.

---

## Método de evaluación

Cada característica se evalúa con el método **ICE** y se clasifica con el
**modelo de Kano**.

- **Impacto (1-5):** cuánto mejora la adopción, la recuperación de deuda o la
  retención.
- **Confianza (1-5):** qué tan seguros estamos de que el usuario la valora.
- **Facilidad (1-5):** 5 es poco esfuerzo; 1 es mucho esfuerzo o riesgo
  técnico.
- **Puntaje ICE:** Impacto × Confianza × Facilidad (máximo 125).
- **Diferenciación:** qué tan única es frente a la competencia (alta, media o
  baja).
- **Kano:** _básica_ (si falta, el usuario rechaza el producto), _de
  desempeño_ (más es mejor) o _atractiva_ (sorprende y diferencia).

Las características básicas de plataforma, como la gestión de tiendas, la
autenticación y el catálogo, son obligatorias y no compiten en la
priorización.

---

## Evaluación

| Característica                                 | I | C | F | ICE | Diferenciación | Kano       |
| :--------------------------------------------- | :-: | :-: | :-: | --: | :------------- | :--------- |
| Condiciones de crédito por cliente y límite     | 5 | 5 | 4 | 100 | Alta           | Atractiva  |
| Liquidación automática en la fecha de corte     | 5 | 5 | 3 |  75 | Alta           | Atractiva  |
| Notificaciones por correo (cobro y mora)        | 4 | 4 | 4 |  64 | Baja           | Desempeño  |
| Panel de cartera                                | 4 | 4 | 4 |  64 | Media          | Desempeño  |
| Registro rápido de venta al crédito             | 5 | 4 | 3 |  60 | Baja           | Básica     |
| Motor financiero (intereses, cuotas, mora)      | 5 | 5 | 2 |  50 | Alta           | Atractiva  |
| Conformidad liviana de cargos                   | 4 | 3 | 4 |  48 | Alta           | Atractiva  |
| Reportes por rango de fechas                    | 4 | 4 | 3 |  48 | Media          | Desempeño  |
| Estado de cuenta para el cliente                | 4 | 4 | 3 |  48 | Media          | Desempeño  |
| Usuarios y roles por tienda (RBAC)              | 3 | 5 | 3 |  45 | Baja           | Desempeño  |
| Auditoría y trazabilidad                        | 2 | 5 | 4 |  40 | Media          | Básica     |
| Compras a proveedores con comprobantes          | 3 | 4 | 3 |  36 | Media          | Desempeño  |
| Puntaje interno del cliente                     | 3 | 3 | 3 |  27 | Alta           | Atractiva  |
| Historial de precios                            | 1 | 5 | 5 |  25 | Baja           | Básica     |
| Inventario valorizado con kardex                | 3 | 4 | 2 |  24 | Baja           | Desempeño  |
| PWA instalable y tolerante a mala conexión      | 4 | 3 | 2 |  24 | Media          | Desempeño  |
| Recomendaciones con IA                          | 3 | 2 | 3 |  18 | Media          | Atractiva  |
| Asistente tributario informativo                | 2 | 2 | 4 |  16 | Alta           | Atractiva  |

---

## Top 5 recomendado

Estas cinco características forman la propuesta de valor de Quina. Agrupan
funcionalidades relacionadas porque el usuario las percibe como un solo
beneficio.

### 1. Crédito con reglas claras

**Incluye:** condiciones de crédito por cliente, límite y motor financiero.

Es el corazón del producto y su principal diferenciador. Cada vecino tiene
condiciones pactadas, y Quina calcula exactamente lo que debe, con intereses
compensatorios y moratorios transparentes. Ningún competidor analizado lo
hace para comercios con catálogo. Además, es lo que más pesa en la rúbrica
del curso.

- **Trade-off:** el motor financiero es lo más difícil de construir y probar.
  Por eso exige los dos juegos de datos de prueba del informe.

### 2. Estado de cuenta automático en cada corte

**Incluye:** liquidación en la fecha de corte y estado de cuenta para el
cliente.

Elimina la discusión del "¿cuánto te debo?". En cada corte, el cliente recibe
un detalle ordenado de sus compras, intereses y cuotas. Convierte una
conversación incómoda en un documento claro.

- **Trade-off:** depende del motor financiero; se construye inmediatamente
  después.

### 3. Cobranza sin incomodidad

**Incluye:** notificaciones por correo y conformidad liviana de cargos.

Al casero le incomoda cobrar a sus vecinos. Quina recuerda los pagos y avisa
la mora por él. La conformidad liviana suma algo que ningún competidor ofrece:
el cliente recibe cada día un resumen de sus cargos y, si no los objeta en
48 horas, los acepta. Así
desaparece el "yo no saqué eso".

- **Trade-off:** el correo tiene menos alcance que WhatsApp en este público.
  Se elige por costo y simplicidad, y WhatsApp queda para el _roadmap_.

### 4. Fiar en segundos sin pasarse del límite

**Incluye:** registro rápido de venta al crédito y validación de límite y
stock.

Es una característica básica: si registrar un fiado toma más tiempo que
anotarlo en el cuaderno, el dueño abandona Quina. No diferencia, pero sin ella
no hay adopción. La validación automática del límite protege al dueño de fiar
de más.

- **Trade-off:** obliga a invertir en diseño de interfaz y experiencia móvil
  desde el inicio.

### 5. Saber cuánto me deben y a quién no fiar

**Incluye:** panel de cartera y puntaje interno del cliente.

Responde las dos preguntas que el cuaderno no puede responder: cuánto dinero
está en la calle y quién paga mal. El puntaje es un diferenciador atractivo
con un costo moderado si se basa en reglas simples, como puntualidad y días
de mora.

- **Trade-off:** el puntaje necesita historial; durante los primeros meses
  tendrá poca información.

---

## Características despriorizadas

Estas características se mantienen en el alcance, pero no forman parte de la
propuesta de valor principal. Se construyen después del top 5 o en una versión
reducida.

| Característica               | Decisión                       | Razón                                                                                          |
| :--------------------------- | :----------------------------- | :--------------------------------------------------------------------------------------------- |
| Inventario valorizado        | Mantener, sin protagonismo     | Es paridad con Treinta y Bogero; no diferencia. Su valor real es alimentar el margen de los reportes. |
| Compras con comprobantes     | Mantener                       | Complementa el inventario y aporta orden, pero no atrae por sí sola.                          |
| PWA tolerante a mala conexión | Reducir el alcance            | Instalable sí. Registrar operaciones financieras sin conexión arriesga inconsistencias en límites y stock; conviene permitir solo consulta. |
| Recomendaciones con IA       | Posponer al final              | Confianza baja: su valor depende de tener datos suficientes y de la calidad del modelo.       |
| Asistente tributario         | Posponer al final              | Impacto bajo y riesgo de que el usuario lo tome como asesoría oficial.                        |
| Historial de precios         | Implementar como parte del catálogo | Es poco esfuerzo y suma trazabilidad, pero el usuario no lo percibe como beneficio.      |

---

## Riesgos y supuestos por validar

Estos supuestos afectan la propuesta de valor y conviene validarlos con
dueños de negocios reales antes de cerrar el posicionamiento.

- **Cobrar intereses a los vecinos:** muchos caseros fían sin interés por
  confianza. Recomendamos permitir una tasa de 0 % para que el interés sea una
  opción y no una barrera. El motor financiero sigue funcionando igual.
- **Topes legales de tasas:** el Banco Central de Reserva del Perú (BCRP)
  establece tasas máximas para operaciones fuera del sistema financiero.
  Validar las tasas pactadas contra esos topes reforzaría la propuesta de
  "crédito con reglas claras" y el marco legal del informe.
- **Correo como canal:** hay que confirmar que los clientes de barrio revisan
  su correo. Si no, la cobranza pierde fuerza.
- **Disposición a pagar:** el modelo de precios debe validar cuánto pagaría un
  comercio de barrio por el producto.

---

## Propuesta de valor resultante

> **Quina convierte el fiado en crédito con reglas claras: cada vecino tiene
> sus condiciones pactadas, Quina calcula lo que debe y le cobra por ti.**

Frente a la competencia, Quina no es otra libreta digital de deudas. Es un
gestor de crédito para el comercio de barrio.
