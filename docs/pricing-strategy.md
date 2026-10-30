# Quina - Estrategia de monetización y precios (Pricing)

Este documento define la estrategia de monetización, el empaquetado de
funcionalidades (*packaging*) y la estructura de precios de **Quina** como
producto SaaS para el mercado peruano. Se fundamenta en los principios de
*Value-Based Pricing*, la economía real del comercio barrial en el Perú y los
aprendizajes de competidores del sector.

---

## 1. Principio fundamental: ¿A quién se le cobra?

### Los clientes finales (vecinos): Acceso 100 % gratuito
- **Decisión:** El cliente/vecino **nunca paga nada** por consultar su estado
  de cuenta, recibir avisos por correo o verificar sus cuotas.
- **Justificación económica:** Cobrarle al vecino crearía fricción inmediata y
  destruiría la adopción. El cliente exigiría que le sigan anotando en papel o
  se iría a comprar a otra bodega. El acceso libre incentiva al vecino a
  aceptar la formalización de su crédito.

### Los negocios (dueños de comercios): Modelo B2B SaaS
- **Decisión:** Quina monetiza cobrando **exclusivamente al dueño del negocio**.
- **Justificación de valor:** El comerciante es quien captura el retorno directo
  de inversión (ROI):
  1. **Recupera dinero perdido:** Evita deudas olvidadas, borrones en el
     cuaderno y disputas de cobro.
  2. **Cobra intereses legítimos:** Aplica intereses compensatorios y
     moratorios calculados con rigor que antes no cobraba.
  3. **Ahorra tiempo:** Automatiza el cálculo de liquidaciones y el envío de
     recordatorios de pago.
  4. **Controla su patrimonio:** Evita quiebres de stock y conoce su margen
     real con costo promedio ponderado.

---

## 2. Modelo de monetización: Freemium B2B con suscripción recurrente

El modelo adoptado es **Freemium con suscripción mensual y anual**. 

### Por qué no comisión por transacción
Cobrar un porcentaje sobre cada fiado o pago generaría rechazo en los bodegueros,
quienes perciben que la plataforma "se lleva parte de su margen de ganancia". La
suscripción fija brinda predictibilidad de costos.

### Por qué no 100 % gratis
Una aplicación gratuita indefinida sin ingresos no es sostenible en el mundo real
(costos de servidores, almacenamiento en Supabase, cuotas de API de IA en Groq,
envío de correos y soporte).

### Métrica de valor (*Value Metric*)
La métrica clave que escala con el valor entregado al negocio es el **número de
clientes con crédito activo** y la **profundidad operativa** (múltiples
usuarios, almacenamiento de comprobantes y recomendaciones con IA).

---

## 3. Estructura de planes y tiers (Good-Better-Best)

| Característica / Límite | Plan Casero (Gratis) | Plan Bodega Pro (S/ 29 / mes) | Plan Negocio Plus (S/ 69 / mes) |
| :--- | :--- | :--- | :--- |
| **Enfoque** | Probar sin riesgo y adoptar | El estándar para bodegas activas | Negocios consolidados o de mayor volumen |
| **Precio mensual** | **S/ 0** (Gratis para siempre) | **S/ 29 / mes** | **S/ 69 / mes** |
| **Precio anual (20 % dto.)** | — | **S/ 279 / año** (~S/ 23.25/mes) | **S/ 660 / año** (~S/ 55.00/mes) |
| **Clientes con crédito activo** | Hasta 15 clientes | **Ilimitados** | **Ilimitados** |
| **Usuarios por tienda (RBAC)** | 1 usuario (Solo dueño) | Hasta 3 usuarios (Dueño + empleados) | Usuarios ilimitados |
| **Catálogo de productos** | Hasta 50 productos | **Ilimitado** | **Ilimitado** |
| **Motor financiero y créditos** | Completo (Francés, fin de mes, mora) | Completo (Francés, fin de mes, mora) | Completo (Francés, fin de mes, mora) |
| **Inventario y Kardex** | Básico (Solo stock actual) | **Kardex completo + Costo promedio** | Kardex completo + Costo promedio |
| **Comprobantes de compra** | No incluye | **Hasta 50 comprobantes/mes** (Supabase) | **Comprobantes ilimitados** |
| **Notificaciones por correo** | Manuales desde la app | **Automáticas** (cargos, cobro, mora) | **Automáticas prioritarias** |
| **Panel de cartera y reportes** | Vista básica | **Avanzado + Exportación Excel/PDF** | **Multi-reporte avanzado** |
| **Asistente de IA (Groq)** | No incluye | **20 consultas/mes** | **100 consultas/mes** |
| **Asistente tributario** | Informativo estándar | Informativo configurable | Informativo configurable |

---

## 4. Justificación del punto de precio (*Price Point*)

### La regla del orden de magnitud (~$10 / mes para micro-SaaS)
Un precio de **S/ 29 al mes** equivale aproximadamente a **$7.80 USD al mes**:
- Se sitúa en el umbral psicológico accesible para una microempresa peruana.
- A diferencia de herramientas corporativas como Treinta Pro ($34.99/mes = ~S/ 130/mes),
  que resultan prohibitivas para una bodega de barrio, S/ 29 representa menos de
  **S/ 1 sol al día**.

### Demostración del retorno de inversión (ROI para el casero)
El discurso de venta y la justificación económica para el comerciante son
inmediatos:
- Una sola deuda de S/ 30 olvidada en una hoja manchada del cuaderno que Quina
  logre recordar y cobrar **ya paga la mensualidad completa del sistema**.
- El cobro ordenado de intereses moratorios y compensatorios genera ingresos
  adicionales legítimos que antes se perdían por falta de cálculo.
- El control de mermas y costo promedio evita pérdidas invisibles de mercadería.

---

## 5. Estrategia de adopción y conversión

```
[ Cuaderno de papel ] 
        │
        ▼ (Sin fricción ni tarjeta)
[ Plan Casero Gratis ] ──► Digitaliza sus primeros 15 clientes
        │
        ▼ (Llega al límite de 15 clientes o necesita agregar a su empleado)
[ Plan Bodega Pro ] ─────► S/ 29/mes (ROI inmediato con cobro automatizado)
```

1. **Onboarding sin tarjeta de crédito:** El comerciante crea su cuenta en menos de
   2 minutos y puede registrar sus primeras ventas de inmediato.
2. **Activación de la necesidad:** Al llegar al cliente 16, o al querer dar acceso
   a su ayudante/cajero, Quina le muestra el valor acumulado que ha protegido
   (ej. *"Quina te ha ayudado a controlar S/ 1,450 en créditos este mes. Pasa a Pro
   para añadir más clientes"*).
3. **Periodo de prueba Pro (14 días gratis):** Al registrarse, cada nueva tienda
   recibe 14 días de prueba de las funciones Pro para experimentar las
   notificaciones automáticas y el inventario con kardex.
