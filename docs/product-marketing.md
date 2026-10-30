# Product Marketing Context

**Document version:** v1  
**Last updated:** 2026-10-06

## Product Overview
**One-liner:** Quina convierte el fiado tradicional en crédito con reglas claras: calcula con rigor lo que cada vecino debe, pacta condiciones justas y le cobra por ti sin incomodidad.  
**What it does:** Quina es una aplicación web progresiva (PWA) multi-tienda que digitaliza y profesionaliza la cuenta corriente de los pequeños comercios de barrio. Permite registrar ventas al contado y al crédito, calcular intereses compensatorios y moratorios según métodos financieros formales, emitir liquidaciones en fechas de corte y controlar el inventario valorizado con kardex.  
**Product category:** Software de gestión comercial y crédito para microcomercios (Micro-retail Credit & Ledger Management).  
**Product type:** B2B SaaS Multi-tenant (Webapp / PWA).  
**Business model:** Freemium B2B con suscripción recurrente. Gratuito para siempre para los vecinos/clientes; Plan Casero gratuito para comercios hasta 15 clientes con crédito, Plan Bodega Pro a S/ 29 / mes (o S/ 279 / año) para créditos ilimitados, hasta 3 usuarios, avisos automáticos e IA; y Plan Negocio Plus a S/ 69 / mes (o S/ 660 / año) para usuarios y comprobantes ilimitados y más consultas de IA. Cada tienda nueva empieza con 14 días de prueba de Bodega Pro, sin tarjeta.

## Target Audience
**Target companies:** Micro y pequeños comercios de barrio en zonas urbanas y periurbanas del Perú: bodegas, boticas y farmacias independientes, carnicerías, panaderías, licorerías, bazares y peluquerías con ventas al crédito a vecinos habituales.  
**Decision-makers:** Propietarios y administradores del comercio (usualmente microempresarios familiares).  
**Primary use case:** Reemplazar el cuaderno de papel para llevar el control exacto de las cuentas fiadas, automatizar el cálculo de intereses y fechas de pago, y enviar estados de cuenta y recordatorios sin confrontaciones personales.  
**Jobs to be done:**
- Digitalizar las deudas de los vecinos sin perder la velocidad del despacho diario.
- Cobrar las deudas a tiempo sin la incomodidad ni la vergüenza ("roche") de pedir dinero en persona.
- Saber exactamente cuánto dinero propio está "en la calle" y qué clientes representan un riesgo de impago.
- Conocer la ganancia real del negocio controlando las compras a proveedores y el costo de ventas.  
**Use cases:**
- Registro veloz de una compra al crédito a un vecino en el mostrador durante la hora punta.
- Cierre de ciclo mensual: generación automática de liquidaciones de deuda con compras desglosadas e intereses calculados.
- Notificación automática por correo previo al vencimiento y aviso de interés moratorio en caso de retraso.
- Consulta instantánea por parte del vecino de su saldo y cronograma de cuotas desde su teléfono sin costo alguno.

## Personas
| Persona | Cares about | Challenge | Value we promise |
| :--- | :--- | :--- | :--- |
| **Don Lucho (Dueño de Bodega / Decisor)** | Recuperar su capital a tiempo, no perder clientes por discusiones, mantener surtido su negocio. | Le da "roche" cobrar en persona; olvida anotar ventas en horas punta; las hojas de su cuaderno se manchan o se pierden. | Quina cobra por ti de forma profesional; calcula intereses exactos y te dice a quién seguir fiando y a quién no. |
| **Brayan (Ayudante / Cajero del negocio)** | Atender rápido, no equivocarse en vueltos ni en precios, saber a quién tiene permiso de fiar. | No sabe cuánto límite le queda a un vecino; le da miedo fiar de más sin autorización del dueño. | Sistema rápido con validación automática de límite de crédito y stock disponible antes de confirmar. |
| **Doña Rosa (Vecina / Cliente del crédito)** | Que respeten lo que consumió, flexibilidad para pagar a fin de mes o en cuotas, cuentas claras. | Siente desconfianza cuando el bodeguero le cobra un monto global sin detalle; a veces no recuerda qué sacó. | Estado de cuenta transparente, gratuito y desglosado con notificación de cada compra y plazo para reclamos. |

## Problems & Pain Points
**Core problem:** Los comerciantes de barrio fían para no perder clientes frente a supermercados o cadenas, pero gestionan ese crédito en cuadernos de papel desordenados, sufriendo pérdidas de capital por deudas olvidadas, discusiones sobre montos y morosidad sin compensación.  
**Why alternatives fall short:**
- *El cuaderno de papel:* Se pierde, se moja, no calcula intereses ni fechas de corte, permite tachones y genera la eterna disputa: "yo no saqué ese producto".
- *Apps de saldos (Treinta, Clarito, Rapinota):* Solo anotan saldos estáticos tipo calculadora; no manejan condiciones financieras formales (tasas nominales/efectivas, método francés, días de mora, gracia capitalizada ni límites automáticos).
- *Hojas de cálculo (Excel):* Complejas de usar en un mostrador desde un celular, propensas a errores humanos y sin acceso para el cliente.  
**What it costs them:** Entre el 5 % y 15 % de los ingresos mensuales quedan atrapados en cuentas por cobrar vencidas; pérdidas directas de mercadería por fiados nunca cobrados; horas semanales perdidas sumando boletas y calculando al ojo.  
**Emotional tension:** Estrés financiero por falta de liquidez para recomprar a proveedores; vergüenza e incomodidad social por tener que cobrarle al vecino de toda la vida; frustración ante acusaciones de cobros injustos.

## Competitive Landscape
**Direct:** Treinta, Rapinota, Bogero, Clarito — Se quedan cortos porque tratan el fiado como un simple saldo pendiente ("debe S/ 50"), sin cálculo de intereses, sin ciclos de facturación formal, sin cronogramas de cuotas bajo método financiero y con precios elevados en sus planes pro corporativos.  
**Secondary:** CobrApp / Apps de prestamistas — Calculan intereses pero están diseñadas para cobradores de ruta o préstamos directos de dinero, careciendo de catálogo comercial, control de stock y venta de productos.  
**Indirect:** El cuaderno de notas físico escolar y la memoria del comerciante — Es gratis e instantáneo, pero carece de seguridad, cálculos y respaldo legal.

## Differentiation
**Key differentiators:**
- **Motor financiero riguroso:** Primer software barrial que implementa el Método Francés vencido con capitalización en período de gracia, intereses compensatorios diarios y desglose formal de mora.
- **Ciclos formales de crédito:** Fechas de corte y pago pactadas con liquidación automática consolidada por ciclo.
- **Conformidad liviana de cargos:** Notificación por correo con 48 horas para observaciones, creando respaldo probatorio sin fricción.
- **Cobranza desatendida:** Quina asume el rol del cobrador imparcial mediante recordatorios por correo, protegiendo la relación vecinal del comerciante. Los avisos son automáticos en Bodega Pro y Negocio Plus; en el Plan Casero el dueño los envía con un botón.
- **Inventario valorizado enlazado:** Control estricto que prohíbe ventas sin stock y calcula el costo promedio ponderado para mostrar la ganancia real.  
**How we do it differently:** No somos una libreta de notas digital ni un ERP corporativo complejo: somos un gestor de crédito estructurado adaptado al mostrador del casero.  
**Why that's better:** El comerciante gana legitimidad al cobrar intereses respaldados por fórmulas matemáticas y recupera su dinero más rápido sin deteriorar la relación humana con su comunidad.  
**Why customers choose us:** Porque elimina las disputas de cobranza, ordena su flujo de caja y cuesta menos de un sol al día en su versión Pro.

## Objections
| Objection | Response |
| :--- | :--- |
| *"No tengo tiempo para escribir en una computadora mientras atiendo."* | Quina es una PWA optimizada para celular: registrar un fiado toma 3 toques en la pantalla, igual de rápido que buscar un lapicero. |
| *"A mis vecinos no les gusta que les cobre intereses."* | Puedes configurar la tasa en 0 % para clientes de confianza y cobrar solo el monto exacto, o activar únicamente intereses si incurren en días de mora. |
| *"No quiero pagar otra aplicación mensual."* | El Plan Casero es gratuito hasta 15 clientes. Cuando pasas al Plan Pro de S/ 29/mes, una sola deuda de S/ 30 que recuperes ya pagó todo el mes. |
| *"¿Qué pasa si mi cliente no tiene internet?"* | El cliente recibe el detalle por correo y tú puedes mostrarle su estado de cuenta en pantalla o imprimirlo si es necesario. |

**Anti-persona:** Grandes cadenas de retail o minimarkets franquiciados (Tambo, Mass, Oxxo) que operan con ERPs corporativos y no otorgan crédito personal; y redes de prestamistas informales ("gota a gota") que operan al margen de la ley.

## Switching Dynamics
**Push:** Hojas del cuaderno arrancadas o perdidas; clientes que niegan compras fiadas; vergüenza de cobrar en persona; falta de dinero en caja para pagar al proveedor de cerveza o abarrotes.  
**Pull:** Cobranza automática y respetuosa; cuentas claras y transparentes para todos; cálculo automático de intereses; reporte de ganancias en un clic.  
**Habit:** La inmediatez física de abrir el cuaderno y garabatear con lápiz en el mostrador.  
**Anxiety:** Miedo a que la tecnología falle o sea lenta en horas punta; temor a que los clientes se ofendan si se les digitaliza la deuda; preocupación por el costo recurrente del software.

## Customer Language
**How they describe the problem:**
- *"Se me traspapeló la cuenta de la vecina."*
- *"Me da un roche tremendo ir a tocarle la puerta para cobrarle los 80 soles que me debe del mes pasado."*
- *"Tengo como dos mil soles en la calle y no tengo para pagarle al camión de la distribuidora."*
- *"El cliente me dice que él no llevó ese aceite y terminamos peleando."*  
**How they describe us:**
- *"Es como tener un administrador que hace las cuentas y le avisa al casero sin que yo tenga que pelear."*
- *"Mi cuaderno digital que calcula solito y no se borra."*  
**Words to use:** Casero, vecina, fiado, cuenta corriente, fecha de corte, fecha de pago pactada, respaldo, transparencia, ordenar el negocio, plata en la calle.  
**Words to avoid:** Cartera morosa incobrable, scoring de riesgo crediticio algorítmico, buró de crédito, microfinanzas subprime, penalidad punitiva (usar siempre términos cercanos y respetuosos).  
**Glossary:**
| Term | Meaning |
| :--- | :--- |
| **Fiado** | Crédito informal de corto plazo otorgado por confianza en el comercio barrial. |
| **Plata en la calle** | Monto total acumulado de deudas pendientes de cobro otorgadas a clientes. |
| **Casero / Casera** | Término peruano afectuoso para el cliente o comerciante habitual del barrio. |
| **Fecha de corte** | Día mensual en que se cierra el ciclo de compras para emitir la liquidación. |
| **Fecha de pago** | Día acordado en que el cliente se compromete a cancelar la totalidad de su deuda. |

## Brand Voice
**Tone:** Empático, formal pero cercano, respetuoso, transparente y alentador.  
**Style:** Directo, sin jerga financiera incomprensible; lenguaje sencillo y visual adaptado a la cotidianidad del comerciante peruano.  
**Personality:** Confiable como un buen socio, justo como un árbitro neutral, trabajador como el bodeguero peruano.

## Proof Points
**Metrics:** Más de 530,000 bodegas en el Perú donde más del 60 % otorga fiado para sostener sus ventas; recuperación estimada de hasta un 95 % de las cuentas por cobrar al digitalizar el crédito con fechas de corte.  
**Customers:** Dirigido a bodegas familiares, boticas independientes y comercios de barrio.  
**Testimonials:**
> *"Antes me daba vergüenza cobrarle a Don Mario y terminaba perdiendo plata. Ahora Quina le manda su estado de cuenta a fin de mes y él mismo viene a pagar puntual con su Yape."* — Bodega ficticia de validación.  
**Value themes:**
| Theme | Proof |
| :--- | :--- |
| Cero disputas con vecinos | Conformidad de cargo por correo y desglose transparente de compras por fecha. |
| Recuperación de liquidez | Recordatorios automáticos previos a la fecha de pago y cálculo de mora disuasoria. |
| Control del negocio | Kardex integrado que prohíbe ventas sin stock y calcula margen con costo promedio. |

## Goals
**Business goal:** Convertir a Quina en la herramienta estándar de crédito barrial en el Perú, alcanzando una tasa de retención superior al 85 % en comercios activos.  
**Conversion action:** Registro gratis y sin tarjeta (empieza con 14 días de prueba de Bodega Pro y luego sigue en el Plan Casero si no se suscribe) y activación del primer cliente con línea de crédito configurada en menos de 5 minutos.  
**Current metrics:** Fase de diseño y validación académica (Prototipo V1 para el curso SI642).

## Changelog
*Newest first. One line per revision: what changed and why.*
- v1 (2026-10-06) — Contexto inicial de marketing de producto creado a partir del enunciado del curso, decisiones técnicas de Quina y priorización de características con foco en el mercado bodeguero peruano.
