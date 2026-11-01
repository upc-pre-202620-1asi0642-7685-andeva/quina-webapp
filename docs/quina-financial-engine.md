# Quina - Motor financiero

Este documento describe el motor financiero de Quina: las reglas que aplica,
sus fórmulas, sus algoritmos y los dos juegos de datos de prueba que exige el
enunciado del curso. Es la base de las secciones del informe técnico
_Análisis de datos_, _Marco conceptual (fórmulas)_, _Diseño de datos de prueba_
y _Algoritmo_.

El motor está escrito en TypeScript puro, en `src/core/domain`, y no depende de
Next.js, React ni de la base de datos. Los montos nunca usan el tipo `number` de
JavaScript: el motor calcula con `decimal.js` a 34 dígitos significativos.

| Archivo | Responsabilidad |
| :--- | :--- |
| `shared/money.ts` | Objeto de valor `Money`: céntimos exactos, redondeo y reparto proporcional. |
| `shared/business-date.ts` | Día calendario de Lima y los instantes de inicio y fin de cada día. |
| `finance/day-count.ts` | Días en base comercial 30/360. |
| `finance/rate.ts` | Tasas nominales y efectivas: TEA, tasa diaria y tasa mensual. |
| `finance/interest.ts` | Interés por días (compensatorio y moratorio). |
| `finance/french-schedule.ts` | Cronograma francés vencido ordinario con gracia capitalizada. |
| `credit/credit-terms.ts` | Condiciones de crédito pactadas con cada vecino. |
| `credit/billing-cycle.ts` | Ciclo al que pertenece una compra: corte y fecha de pago. |
| `credit/installment-plan.ts` | Cronograma de una compra en cuotas (gracia según el ciclo). |
| `credit/cycle-settlement.ts` | Liquidación de un ciclo en su fecha de corte. |
| `credit/debt-payment.ts` | Mora, monto a pagar, validación del pago y su desglose. |

---

## 1. Reglas que aplica

Las reglas salen del enunciado (puntos 4 a 6) y de las historias US06, US09,
US10 y US13.

- **Año comercial:** 360 días y meses de 30 días.
- **Tasas:** la compensatoria y la moratoria pueden ser nominales o efectivas,
  con periodo anual, mensual o diario. Una tasa nominal indica su
  capitalización.
- **Ciclo:** una compra hecha hasta las 23:59:59 (hora de Lima) del día de corte
  entra al ciclo que cierra ese día. Una compra posterior pasa al ciclo
  siguiente.
- **Pago único:** cada compra paga interés compensatorio por los días entre la
  compra y la fecha de pago de su ciclo.
- **Cuotas:** los días entre la compra y la fecha de pago de su ciclo son un
  periodo de gracia total. La deuda se capitaliza por ese periodo y luego se
  calcula la cuota fija con el método francés vencido ordinario. La primera
  cuota vence un mes después de la fecha de pago del ciclo.
- **Mora:** si el vecino paga después de la fecha pactada, paga interés
  moratorio por los días de atraso. Cada línea exigible del ciclo (cargo de pago
  único o cuota) lo calcula sobre su parte con su propia tasa moratoria
  congelada, y la mora del ciclo es la suma (Plan 4, decisión P1). Durante la
  mora no corre interés compensatorio y las cuotas futuras no entran en la base.
- **Pagos:** solo se pagan ciclos liquidados (`BILLED`) o vencidos
  (`OVERDUE`), completos y por el monto exacto. Con varios ciclos por pagar, se
  paga primero el más antiguo.

### 1.1. Reglas acordadas con el usuario (31 de octubre de 2026)

La documentación no definía estos casos, así que se acordaron antes de
programar:

1. **Fecha de pago anterior o igual al corte.** La fecha de pago de un ciclo es
   la primera fecha con el día de pago pactado **estrictamente posterior** al
   corte. Con corte el 20 y pago el 26, el pago cae el mismo mes. Con corte el 25
   y pago el 5, o con pago igual al corte, cae el mes siguiente.
2. **Reparto de la mora.** Cada fila de `payment_allocations` se liga a un cargo
   o a una cuota. Desde el Plan 4 (P1) no hay prorrateo: cada línea paga su
   propia mora, calculada con su tasa, y la suma de las filas es la mora total.
3. **Anulaciones.** Se anula un cargo de pago único en su propio ciclo mientras
   no esté pagado: el motor recibe el id del cargo y agrega una línea de
   anulación igual a su línea de compra, con capital e interés, así el cargo
   anulado nunca se cobra ni deja saldo negativo (`VOID_OUTSIDE_CYCLE` si el
   cargo no es del ciclo; `ADJUSTMENTS_EXCEED_DUE` queda como invariante). Un
   cargo en cuotas se anula solo si ninguna cuota se liquidó.

### 1.2. Reglas del Plan 4 (corte y cobranza)

- **Tasa moratoria por línea (P1):** si el dueño cambió la tasa a mitad del
  ciclo, cada cargo usa la que congeló.
- **Saldo de la cuenta (D3):** el corte suma el interés de los cargos únicos y,
  por cuota, `cuota − capital liberado`. El capital liberado de la cuota *k* es
  $P \times amortización_k / S_{cap}$ truncado a céntimos y la última absorbe el
  residuo, así la suma es el capital original $P$. El pago resta capital e
  interés; la mora nunca entra al saldo.

---

## 2. Análisis de datos

### 2.1. Datos de entrada

| Nombre | Descripción | Tipo y formato | Restricciones |
| :--- | :--- | :--- | :--- |
| `currency` | Moneda del crédito | Texto | `PEN` o `USD` |
| `compensatory.type` | Tipo de tasa compensatoria | Texto | `EFFECTIVE` o `NOMINAL` |
| `compensatory.value` | Valor de la tasa como fracción | Decimal en texto, `NUMERIC(7,4)` | ≥ 0 (0 para clientes de confianza) |
| `compensatory.period` | Periodo de la tasa | Texto | `ANNUAL`, `MONTHLY` o `DAILY` |
| `compensatory.capitalization` | Capitalización de una tasa nominal | Texto o nulo | Obligatoria si es nominal, nula si es efectiva, y no mayor que el periodo |
| `moratory.*` | Tasa moratoria (mismos campos) | Igual que la compensatoria | Igual que la compensatoria |
| `cutOffDay` | Día de corte de cada mes | Entero | 1 a 28 |
| `paymentDueDay` | Día de pago de cada mes | Entero | 1 a 28 |
| `maxInstallmentMonths` | Plazo máximo en cuotas | Entero | 1 a 24 |
| `principal` | Importe de la compra a precio de crédito | Decimal en texto, `NUMERIC(12,2)` | > 0 |
| `purchaseInstant` | Fecha y hora de la compra | Instante UTC, `TIMESTAMPTZ` | — |
| `installments` | Número de cuotas | Entero | 1 a `maxInstallmentMonths` |
| `paymentInstant` | Fecha y hora del pago | Instante UTC, `TIMESTAMPTZ` | — |
| `amount` | Monto que entrega el vecino | Decimal en texto | Igual al monto a pagar |

### 2.2. Datos intermedios

| Nombre | Descripción | Tipo y formato |
| :--- | :--- | :--- |
| `TEA` | Tasa efectiva anual equivalente | Decimal de 34 dígitos |
| `i_d` | Tasa efectiva diaria | Decimal de 34 dígitos |
| `TEM` | Tasa efectiva mensual del método francés | Decimal de 34 dígitos |
| `cutOffDate`, `paymentDueDate` | Corte y pago del ciclo de la compra | Fecha de Lima (`AAAA-MM-DD`) e instante de las 23:59:59.999 |
| `days` | Días 30/360 entre la compra y la fecha de pago | Entero ≥ 0 |
| `graceDays` | Días de gracia total de una compra en cuotas | Entero ≥ 0 |
| `daysLate` | Días 30/360 de atraso | Entero ≥ 0 |

### 2.3. Datos de salida

| Nombre | Descripción | Tipo y formato | Columna |
| :--- | :--- | :--- | :--- |
| `capitalizedAmount` | Capital tras capitalizar la gracia | Decimal, 2 decimales | `credit_charges.capitalized_amount` |
| `installmentAmount` | Cuota fija R | Decimal, 2 decimales | — |
| Filas del cronograma | Número, vencimiento, saldo inicial, cuota, interés, amortización y saldo final | Decimales, 2 decimales | `credit_installments` |
| `interest` de un cargo | Interés compensatorio de un cargo de pago único | Decimal, 2 decimales | `credit_charges.compensatory_interest` |
| Totales del ciclo | Compras, interés compensatorio, cuotas, ajustes y total exigible | Decimales, 2 decimales | `settlement_cycles.*_total`, `total_due` |
| `moratoryInterest` | Interés moratorio del pago | Decimal, 2 decimales | `debt_payments.moratory_interest_paid` |
| Desglose del pago | Capital, interés compensatorio, moratorio y total | Decimales, 2 decimales | `debt_payments`, `payment_allocations` |

---

## 3. Marco conceptual: fórmulas

### 3.1. Días en base comercial 30/360

$$
días = 360\,(A_2 - A_1) + 30\,(M_2 - M_1) + (D_2 - D_1)
$$

El día 31 y el último día de febrero cuentan como 30 (“febrero se completa
hasta 30”). Por eso, del 20 al 28 de febrero de un año no bisiesto hay 10 días.
En un año bisiesto el 28 de febrero cuenta como 28 y el 29 como 30.

### 3.2. Conversión de tasas

Días de cada periodo: anual 360, mensual 30 y diario 1.

- Tasa efectiva $r$ de periodo $P$: $TEA = (1 + r)^{360/P} - 1$.
- Tasa nominal $r$ de periodo $P$ capitalizable cada $C$: $m = P / C$ y
  $TEA = (1 + r/m)^{360/C} - 1$. Para una TNA capitalizable mensualmente,
  $m = 12$ y $TEA = (1 + TNA/12)^{12} - 1$.
- Tasa diaria: $i_d = (1 + TEA)^{1/360} - 1$.
- Tasa mensual: $TEM = (1 + TEA)^{30/360} - 1$.

### 3.3. Interés por días (compensatorio y moratorio)

$$
I = B \times \left[(1 + i_d)^{días} - 1\right]
$$

- **Compensatorio:** $B$ es el importe de la compra y $días$ va de la compra a
  la fecha de pago de su ciclo.
- **Moratorio:** se calcula por línea: $B$ es lo exigible de cada cargo o
  cuota, $i_d$ sale de su tasa moratoria congelada y $días$ va de la fecha de
  pago pactada a la fecha real de pago. La mora del ciclo es la suma.

### 3.4. Método francés vencido ordinario con gracia total

$$
S_{cap} = P \times (1 + i_d)^{gracia}
\qquad
R = S_{cap} \times \frac{i\,(1+i)^n}{(1+i)^n - 1},\; i = TEM
$$

Para cada cuota $k$:

$$
I_k = S_{k-1} \times i \qquad A_k = R - I_k \qquad S_k = S_{k-1} - A_k
$$

Con tasa 0 no hay intereses y $R = S_{cap} / n$.

### 3.5. Liquidación y pago

$$
total\_exigible = \sum compras + \sum I_{compensatorio} + \sum cuotas\ del\ mes - \sum anulaciones
$$

$$
monto\ a\ pagar = total\_exigible + I_{moratorio}
$$

$$
amount\_paid = principal\_paid + compensatory\_interest\_paid + moratory\_interest\_paid
$$

### 3.6. Redondeo

El motor calcula con 34 dígitos y redondea a céntimos, mitad hacia arriba, solo
cuando produce un monto que se guarda: el interés de cada cargo, $S_{cap}$, la
cuota $R$ (calculada sobre $S_{cap}$ ya redondeado), el interés de cada fila y
la mora. La amortización de cada fila es $R - I_k$, salvo la última, que
amortiza el saldo exacto. Así, la suma de las amortizaciones es exactamente
$S_{cap}$ (US09, criterio 5) y la última cuota puede diferir de $R$ en unos
céntimos.

---

## 4. Algoritmos (pseudocódigo)

### 4.1. Ciclo de una compra

```text
FUNCIÓN cicloDe(instanteCompra, díaCorte, díaPago)
  díaLima ← fecha de Lima de instanteCompra (UTC − 5 horas)
  SI díaLima.día ≤ díaCorte ENTONCES
    corte ← (díaLima.año, díaLima.mes, díaCorte)
  SINO
    corte ← (díaLima.año, díaLima.mes, díaCorte) + 1 mes
  FIN SI
  pago ← (corte.año, corte.mes, díaPago)
  SI díaPago ≤ díaCorte ENTONCES pago ← pago + 1 mes
  RETORNAR corte, pago
FIN FUNCIÓN
```

### 4.2. Capitalización de la gracia y método francés

```text
FUNCIÓN cronograma(P, tasa, instanteCompra, n, condiciones)
  SI n < 1 O n > 24 O n > condiciones.plazoMáximo ENTONCES error
  corte, pago ← cicloDe(instanteCompra, condiciones.corte, condiciones.pago)
  gracia ← días30360(fecha de Lima de instanteCompra, pago)
  Scap ← redondear(P × (1 + i_d)^gracia)
  i ← TEM
  SI i = 0 ENTONCES R ← redondear(Scap / n)
  SINO R ← redondear(Scap × i(1+i)^n / ((1+i)^n − 1))
  saldo ← Scap
  PARA k DESDE 1 HASTA n
    interés ← redondear(saldo × i)
    SI k = n ENTONCES amortización ← saldo SINO amortización ← R − interés
    registrar fila (k, pago + k meses, saldo, amortización + interés, interés, amortización, saldo − amortización)
    saldo ← saldo − amortización
  FIN PARA
FIN FUNCIÓN
```

### 4.3. Liquidación en la fecha de corte

```text
FUNCIÓN liquidar(ciclo, cargosÚnicos, cuotasDelMes, anulaciones)
  SI algún cargo no cae entre el corte anterior (exclusivo) y el corte ENTONCES error
  SI alguna cuota no vence en ciclo.pago ENTONCES error
  ORDENAR cargosÚnicos por fecha de compra
  PARA cada cargo
    días ← días30360(fecha de Lima del cargo, ciclo.pago)
    interés ← redondear(capital × ((1 + i_d)^días − 1))   // i_d de la tasa congelada del cargo
  FIN PARA
  PARA cada cargo anulado: agregar línea de anulación igual a su línea de compra
  total ← Σ capital + Σ interés + Σ cuotas − Σ anulaciones
  SI total < 0 ENTONCES error (invariante: solo se anulan cargos del ciclo)
  RETORNAR líneas y totales
FIN FUNCIÓN
```

### 4.4. Interés moratorio y pago

```text
FUNCIÓN cotizarPago(ciclo, instantePago)
  SI ciclo.estado = OPEN ENTONCES error "ciclo no liquidado"
  SI ciclo.estado = PAID ENTONCES error "ciclo ya pagado"
  díasMora ← máximo(0, días30360(ciclo.pago, fecha de Lima de instantePago))
  PARA cada línea exigible (cargo no anulado o cuota)
    moraLínea ← redondear(exigibleLínea × ((1 + i_d,mor de la línea)^díasMora − 1))
  FIN PARA
  mora ← Σ moraLínea
  RETORNAR díasMora, mora, moraLínea por línea, ciclo.totalExigible + mora
FIN FUNCIÓN

FUNCIÓN registrarPago(cotización, monto)
  SI monto < cotización.montoAPagar ENTONCES error "no se aceptan pagos parciales"
  SI monto > cotización.montoAPagar ENTONCES error "el monto excede la deuda"
  repartir capital e interés compensatorio por cargo y por cuota
  cada línea registra su propia mora (sin prorrateo)
FIN FUNCIÓN
```

---

## 5. Diseño de datos de prueba

Los dos juegos comparten las condiciones de crédito: S/ 120.00 en 3 cuotas,
corte el día 20, pago el día 26 y un plazo máximo de 6 meses. El juego 1 usa
tasas efectivas y el juego 2 tasas nominales, así ambos tipos quedan cubiertos
(enunciado, punto 6).

Los resultados esperados los calcula `scripts/finance-oracle.py` con el módulo
`decimal` de Python (precisión 40), sin compartir código con el motor. El
script escribe `tests/unit/finance/fixtures/datasets.json` y
`pnpm test:oracle` comprueba que ese archivo esté al día.

### 5.1. Juego 1: compra antes del corte, tasas efectivas

- **Tasa compensatoria:** TEA 20 %, de la que salen $i_d = 0.000506577$ y
  $TEM = 0.015309470$.
- **Tasa moratoria:** TEA 15 %.

**Compra en cuotas el 15 de setiembre (ejemplo del enunciado, punto 4).** La
compra entra al ciclo que cierra el 20 de setiembre y se paga el 26 de
setiembre. Tiene 11 días de gracia, $S_{cap}$ = S/ 120.67 y $R$ = S/ 41.46.

| Cuota | Vence | Saldo inicial | Cuota | Interés | Amortización | Saldo final |
| :-: | :-: | --: | --: | --: | --: | --: |
| 1 | 26/10/2026 | 120.67 | 41.46 | 1.85 | 39.61 | 81.06 |
| 2 | 26/11/2026 | 81.06 | 41.46 | 1.24 | 40.22 | 40.84 |
| 3 | 26/12/2026 | 40.84 | 41.47 | 0.63 | 40.84 | 0.00 |

**Ciclo de pago único con corte el 20/09/2026 y pago el 26/09/2026.**

| Compra (hora de Lima) | Importe | Días | Interés |
| :-- | --: | --: | --: |
| 03/09/2026 09:00 | 25.50 | 23 | 0.30 |
| 15/09/2026 15:00 | 40.00 | 11 | 0.22 |
| 20/09/2026 22:30 | 10.00 | 6 | 0.03 |
| **Total exigible** | | | **76.05** |

La compra del 21/09/2026 a las 00:10 entra al ciclo que cierra el 20/10/2026.

**Pago el 06/10/2026, con 10 días de mora.** Interés moratorio de S/ 0.30, así
que el vecino paga S/ 76.35. El desglose es capital S/ 75.50, interés
compensatorio S/ 0.55 y moratorio S/ 0.30. La mora se reparte entre los tres
cargos como 0.10, 0.15 y 0.05.

### 5.2. Juego 2: compra después del corte, tasas nominales

- **Tasa compensatoria:** TNA 24 % capitalizable mensualmente, que equivale a
  TEA 26.8242 % y da $TEM = 0.02$.
- **Tasa moratoria:** TNA 15 % capitalizable diariamente, de la que sale
  $i_d = 0.15 / 360$.

**Compra en cuotas el 22 de setiembre (ejemplo de US09).** La compra entra al
ciclo que cierra el 20 de octubre y se paga el 26 de octubre. Tiene 34 días de
gracia (8 de setiembre más 26 de octubre), $S_{cap}$ = S/ 122.72 y
$R$ = S/ 42.55.

| Cuota | Vence | Saldo inicial | Cuota | Interés | Amortización | Saldo final |
| :-: | :-: | --: | --: | --: | --: | --: |
| 1 | 26/11/2026 | 122.72 | 42.55 | 2.45 | 40.10 | 82.62 |
| 2 | 26/12/2026 | 82.62 | 42.55 | 1.65 | 40.90 | 41.72 |
| 3 | 26/01/2027 | 41.72 | 42.55 | 0.83 | 41.72 | 0.00 |

**Ciclo de pago único con las mismas compras que el juego 1.**

| Compra (hora de Lima) | Importe | Días | Interés |
| :-- | --: | --: | --: |
| 03/09/2026 09:00 | 25.50 | 23 | 0.39 |
| 15/09/2026 15:00 | 40.00 | 11 | 0.29 |
| 20/09/2026 22:30 | 10.00 | 6 | 0.04 |
| **Total exigible** | | | **76.22** |

**Pago el 06/10/2026, con 10 días de mora.** Interés moratorio de S/ 0.32, así
que el vecino paga S/ 76.54. El desglose es capital S/ 75.50, interés
compensatorio S/ 0.72 y moratorio S/ 0.32.

### 5.3. Caso de control

Con la tasa del juego 1 y la fecha de compra del juego 2 (TEA 20 %, 34 días de
gracia) resultan $S_{cap}$ = S/ 122.08, $R$ = S/ 41.95 y una última cuota de
S/ 41.94. Este caso aísla el efecto de la gracia del efecto de la tasa.

---

## 6. Plan de pruebas

| Técnica | Qué prueba | Dónde |
| :--- | :--- | :--- |
| Caja blanca | Cada fórmula y cada rama: 30/360, conversión de tasas, ciclos, cronograma, liquidación, mora, validaciones y errores | `tests/unit/finance/*.spec.ts`, `tests/unit/credit/*.spec.ts` |
| Propiedades | 200 cronogramas generados con semilla fija: saldo final 0.00, sin saldos negativos, Σ amortizaciones = $S_{cap}$ y última cuota a no más de 0.01 × n de $R$ | `tests/unit/finance/french-schedule.spec.ts` |
| Caja negra | Los dos juegos de datos de punta a punta, comparados con el oráculo independiente | `tests/unit/finance/datasets.spec.ts` |
| Oráculo | Los resultados esperados se regeneran en Python y CI comprueba que coinciden | `scripts/finance-oracle.py`, `pnpm test:oracle` |

Comandos: `pnpm test` (Vitest) y `pnpm test:oracle`.

### 6.1. Criterios de aceptación cubiertos

| Historia | Criterio | Prueba |
| :--- | :--- | :--- |
| US06 | 1. Tasa nominal o efectiva y su periodo | `rate.spec.ts` |
| US06 | 4. Días de corte y pago entre 1 y 28 | `billing-cycle.spec.ts` (CreditTerms) |
| US06 | 5. Tasa compensatoria de 0 % | `rate.spec.ts`, `french-schedule.spec.ts` |
| US09 | 1. Días de gracia en 30/360 según el ciclo | `day-count.spec.ts`, `french-schedule.spec.ts` |
| US09 | 2. Capitalización con $i_d$, conversión de nominal a TEA y TEM | `rate.spec.ts`, `french-schedule.spec.ts` |
| US09 | 3. Cuota del método francés | `french-schedule.spec.ts` |
| US09 | 4. Tabla de amortización completa | `french-schedule.spec.ts` (fila por fila) |
| US09 | 5. Σ amortizaciones = capital capitalizado | `french-schedule.spec.ts` (juegos y propiedades) |
| US09 | 7. Ejemplos de 11 y 34 días | `french-schedule.spec.ts`, `datasets.spec.ts` |
| US10 | 1. Compras hasta las 23:59:59 de Lima del corte | `billing-cycle.spec.ts`, `cycle-settlement.spec.ts` |
| US10 | 2. Interés por días hasta la fecha de pago | `cycle-settlement.spec.ts` |
| US10 | 3. Cuotas del mes | `cycle-settlement.spec.ts` |
| US10 | 4. Compras por fecha, intereses, cuotas, anulaciones y total | `cycle-settlement.spec.ts` |
| US10 | 5. Compras posteriores al corte pasan al ciclo siguiente | `billing-cycle.spec.ts`, `cycle-settlement.spec.ts` |
| US10 | 7. Ciclo solo con una cuota que vence | `cycle-settlement.spec.ts` |
| US13 | 1. A tiempo, sin recalcular | `debt-payment.spec.ts` |
| US13 | 2. Días de mora en 30/360 | `debt-payment.spec.ts` |
| US13 | 3. Mora sobre el total exigible del ciclo | `debt-payment.spec.ts`, `datasets.spec.ts` |
| US13 | 4. Sin pagos parciales ni ciclos abiertos | `debt-payment.spec.ts` |
| US13 | 5. Desglose de capital e intereses | `debt-payment.spec.ts` |
| US13 | 7. Detalle por cargo y cuota | `debt-payment.spec.ts` |
| US13 | 8. El ciclo más antiguo primero | `debt-payment.spec.ts` |

Los criterios que dependen de la base de datos, las pantallas o los correos (por
ejemplo, US09 criterio 6, US10 criterio 6 y US13 criterio 6) se prueban en los
planes que construyen esas partes.
