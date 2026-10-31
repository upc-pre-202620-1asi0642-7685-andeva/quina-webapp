# Plan 1 (Motor financiero) — Implementation Plan

> Ejecutar con TDD tarea por tarea.

## Context

El Plan 0 (Fundaciones) está cerrado: release 0.2.0 en `develop` (esquema de 35 tablas, RLS, Better Auth, registro y pantallas de acceso, CI). Según `docs/instructions.md`, el **Plan 1 es el motor financiero en TypeScript puro, sin interfaz ni base de datos**, con los 2 juegos de datos del enunciado. Cubre **US09** completa y los **cálculos** de **US10** (liquidación en el corte) y **US13** (pago y mora). Es el núcleo diferenciador de Quina y lo que más pesa en la rúbrica (Marco conceptual, Datos de prueba y Algoritmo).

Hoy no hay nada financiero en el código. Se reutiliza:
- `Result`, `ok` y `err` de `src/core/domain/shared/result.ts`.
- El estilo de objeto-módulo puro de `account-lockout.ts` y `tax-id.ts`.
- Las pruebas en `tests/unit/**/*.spec.ts` (Vitest, alias `@/`).
- La regla de ESLint que ya prohíbe infraestructura en `src/core` (`eslint.config.mjs:19-45`).

Este plan no tiene interfaz, así que las skills de diseño entran desde el Plan 2.

## Decisiones del usuario (2026-10-31)
1. Aritmética con `decimal.js`, permitido solo en `src/core/domain/shared/money.ts` y `src/core/domain/finance/**`.
2. Juegos de datos con S/ 120.00 en 3 cuotas, corte el día 20 y pago el día 26:
   - **Juego 1:** compensatoria TEA 20 % y moratoria TEA 15 %.
   - **Juego 2:** compensatoria TNA 24 % capitalizable mensualmente y moratoria TNA 15 % capitalizable diariamente.
3. La mora de un ciclo se reparte en `payment_allocations` de forma proporcional al exigible de cada cargo o cuota. La última línea absorbe el céntimo de redondeo y la mora total manda.
4. Fecha de pago del ciclo: la primera fecha con el día de pago pactado **estrictamente posterior** al corte. Con corte 25 y pago 5, el pago cae el 5 del mes siguiente; si el día de pago es igual al de corte, también pasa al mes siguiente.
5. Las anulaciones de cargos en cuotas ya liquidadas y las anulaciones mayores que lo exigible se definen en el Plan 4. El motor recibe la anulación ya desglosada en capital e interés y devuelve `ADJUSTMENTS_EXCEED_DUE` si el total queda negativo.
6. La revisión externa la hizo un subagente crítico, porque este entorno no tiene acceso a Gemini. Se incorporaron sus 19 observaciones; las que exigían una regla nueva se convirtieron en las decisiones 3 a 5.

## Reglas financieras (enunciado §4–6, US06, US09, US10, US13)

| Concepto | Regla |
|---|---|
| Días | Base comercial 30/360: `360·(Y2−Y1) + 30·(M2−M1) + (D2−D1)`. El día 31 y el último día de febrero cuentan como 30, según la lectura literal de la documentación (30E/360 ISDA). Así, del 20/02 al 28/02 de un año no bisiesto hay 10 días. |
| Zona horaria | Los instantes llegan en UTC. El día de negocio es el de Lima, que tiene UTC−5 fijo sin horario de verano, así que basta restar 5 horas y no hace falta ICU. El corte y el pago se expresan como instantes de las 23:59:59.999 de Lima (`TIMESTAMPTZ` del esquema). |
| Tasa → TEA | Las tasas llegan como fracción en texto (`'0.2000'`, `NUMERIC(7,4)`). Días por periodo: ANNUAL 360, MONTHLY 30, DAILY 1. Tasa efectiva con periodo P: `(1+r)^(360/días P) − 1`. Tasa nominal con periodo P y capitalización C: `m = días P / días C` (es un error que C sea mayor que P) y `TEA = (1 + r/m)^(360/días C) − 1`. |
| Derivadas | `i_d = (1+TEA)^(1/360) − 1` y `TEM = (1+TEA)^(30/360) − 1`. Las comparaciones en las pruebas se hacen a 20 decimales. |
| Ciclo | Una compra cuyo día de Lima es menor o igual que el día de corte entra al ciclo de ese mes; si es posterior, al del mes siguiente. El ciclo cubre desde el corte anterior (exclusivo) hasta el corte (inclusivo). |
| Pago único | `interés = round(P · ((1+i_d)^días(compra, pago) − 1))`. |
| Cuotas | `gracia = días(compra, pago del ciclo)`, `S_cap = round(P · (1+i_d)^gracia)` y `R = round(S_cap · i(1+i)^n/((1+i)^n − 1))` con `i = TEM`, **calculada sobre el `S_cap` ya redondeado**. Con tasa 0, `R = round(S/n)`. Para k < n: `interés_k = round(saldo·TEM)` y `amortización_k = R − interés_k`. **La última cuota amortiza el saldo exacto**, así que puede diferir de R (por ejemplo, 41.47 frente a 41.46); el criterio 5 de US09 lo permite. La cuota k vence el día de pago, k meses después del pago del ciclo. `n` va de 1 a 24 y no puede superar `max_installment_months`. |
| Totales del ciclo | `purchasesTotal` es el capital de los cargos de pago único. `compensatoryInterestTotal` es **solo** el interés de esos cargos. `installmentsTotal` son las cuotas completas que vencen en el ciclo. `adjustmentsTotal` son las anulaciones. `totalDue` es la suma de los tres primeros menos los ajustes. `openingBalance` es 0 porque los ciclos vencidos se pagan por separado. |
| Mora | `días_mora = max(0, días30/360(pago pactado, día de Lima del pago real))` y `mora = round(totalDue · ((1+i_d,mor)^días − 1))`. No corre interés compensatorio durante la mora. |
| Pago | Solo se pagan ciclos `BILLED` u `OVERDUE`, por el monto exacto: sin pagos parciales y sin recalcular si se paga a tiempo. El más antiguo se paga primero. El desglose cumple `principal_paid` = capital de los cargos + amortización de las cuotas, `compensatory_interest_paid` = interés de los cargos + interés de las cuotas, y `amount_paid = principal + compensatoria + moratoria` (restricción del esquema). |

## Estructura de archivos (§5 de la documentación de la webapp: fórmulas en `finance/` y entidades de crédito en `credit/`)

```
src/core/domain/shared/money.ts             Money (PEN|USD), texto de entrada y salida, ROUND_HALF_UP
src/core/domain/shared/business-date.ts     BusinessDate {y,m,d}: fromInstant (Lima), endOfDayInstant, addMonths, isLastDayOfFeb
src/core/domain/finance/day-count.ts        days30360(a, b)
src/core/domain/finance/rate.ts             Rate: parse, toTEA, compoundFactor(days), monthlyRate, annuityFactor(n)  (tipo opaco)
src/core/domain/finance/french-schedule.ts  FrenchAmortizationCalculator.schedule
src/core/domain/finance/interest.ts         singlePaymentInterest, moratoryInterest
src/core/domain/credit/credit-terms.ts      CreditTerms (snapshot: compensatoria, moratoria, corte, pago, maxMonths)
src/core/domain/credit/billing-cycle.ts     cycleFor(instant, terms) -> {periodYear, periodMonth, cutOff, paymentDue, previousCutOff} (BusinessDate + instantes)
src/core/domain/credit/cycle-settlement.ts  settleCycle -> líneas ordenadas por fecha + totales
src/core/domain/credit/debt-payment.ts      quotePayment, validatePaymentAmount, oldestPayableCycle, allocatePayment
tests/unit/finance/fixtures/datasets.ts     Juegos 1 y 2 (entradas + esperados)
tests/unit/finance/*.spec.ts, tests/unit/credit/*.spec.ts, tests/unit/finance/datasets.spec.ts
scripts/finance-oracle.py                   Oráculo independiente (Python decimal, prec 40)
docs/quina-financial-engine.md              Datos E/I/S, fórmulas, pseudocódigo, juegos, matriz de criterios
```

Interfaces (puras y síncronas; los errores salen con `Result`):
- `Rate.parse({type, value, period, capitalization})` devuelve `Result<Rate, 'NOMINAL_NEEDS_CAPITALIZATION' | 'EFFECTIVE_HAS_CAPITALIZATION' | 'CAPITALIZATION_LONGER_THAN_PERIOD' | 'NEGATIVE_RATE'>`. Quien lo llama nunca importa `Decimal`.
- `FrenchAmortizationCalculator.schedule({principal, purchaseInstant, terms, installments})` devuelve `{graceDays, capitalizedAmount, installmentAmount, rows[{number, dueDate, initialBalance, installment, interest, principal, finalBalance}]}`. Los nombres de los campos siguen `credit_charges` y `credit_installments`.
- `settleCycle({cycle, singleCharges, dueInstallments, voids: {principal, interest}[]})` devuelve un error `CHARGE_OUTSIDE_CYCLE` si una compra cae antes del corte anterior o después del corte, y `ADJUSTMENTS_EXCEED_DUE` si el total queda negativo.
- `quotePayment(cycle, paymentInstant)` devuelve `{daysLate, moratoryInterest, amountDue}`, o `CYCLE_NOT_BILLED` o `CYCLE_ALREADY_PAID`. `validatePaymentAmount` devuelve `PARTIAL_PAYMENT_NOT_ALLOWED`. `allocatePayment` devuelve las filas `{target: charge|installment, type, amount}` y los totales del desglose.

## Tareas

### Task 0: Oráculo y fixtures (antes del TDD)
- `scripts/finance-oracle.py` (`python3 -I`) calcula todos los esperados y `tests/unit/finance/fixtures/datasets.ts` los copia:
  - **Juego 1** (compra del 15/09): gracia 11, `S_cap` 120.67, `R` 41.46. Filas: (120.67, 41.46, 1.85, 39.61, 81.06), (81.06, 41.46, 1.24, 40.22, 40.84) y (40.84, 41.47, 0.63, 40.84, 0.00), con vencimientos 26/10, 26/11 y 26/12.
  - **Juego 2** (compra del 22/09, TNA 24 % m=12, TEM 0.02): gracia 34, `S_cap` 122.72, `R` 42.55. Filas: (122.72, 42.55, 2.45, 40.10, 82.62), (82.62, 42.55, 1.65, 40.90, 41.72) y (41.72, 42.55, 0.83, 41.72, 0.00), con vencimientos 26/11, 26/12 y 26/01.
  - **Control** (TEA 20 %, gracia 34): `S_cap` 122.08, `R` 41.95 y última cuota 41.94.
  - **Ciclo de pago único** (corte 20/09, pago 26/09): compras del 03/09 por S/ 25.50 (23 días), del 15/09 por S/ 40.00 (11 días) y del 20/09 a las 22:30 de Lima por S/ 10.00 (6 días). La compra del 21/09 a las 00:10 de Lima queda fuera. Juego 1: intereses 0.30 / 0.22 / 0.03 y total 76.05. Juego 2: intereses 0.39 / 0.29 / 0.04 y total 76.22.
  - **Mora** (pago el 06/10, 10 días): en el juego 1, TEA 15 % da 0.30 y un total a pagar de 76.35. En el juego 2, TNA 15 % capitalizable diariamente (TEA 0.161797…, `i_d` = 0.15/360) da 0.32 y un total de 76.54.
- Commit `test(finance): add independent oracle and datasets` (`Refs: US09, US10, US13`).

### Task 1: `decimal.js` y `Money`
- Ejecutar `pnpm add decimal.js` y ampliar la regla de ESLint para que `decimal.js` solo se importe en `shared/money.ts` y `finance/**`.
- Pruebas: `0.1 + 0.2` da exacto; `2.675` redondea a 2.68 y `0.005` a 0.01; sumar PEN con USD da error; la salida siempre lleva 2 decimales.
- Commit `feat(finance): add money value object` (`Refs: US09`).

### Task 2: `BusinessDate` y `days30360`
- Pruebas:
  - 15/09→26/09 = 11, 22/09→26/10 = 34, 15/01→31/01 = 15 y 26/12→26/01 = 30.
  - Febrero no bisiesto: 20/02→28/02 = 10. Febrero bisiesto: 28/02→29/02 = 2.
  - En Lima, `2026-09-21T04:59:59Z` es el 20/09 y `05:00:00Z` es el 21/09.
- Commit `feat(finance): add 30/360 day count and lima business date`.

### Task 3: `Rate`
- Pruebas:
  - TEA 20 % da `i_d` 0.000506577… y TEM 0.0153094705….
  - TNA 24 % con m = 12 da TEA 0.2682417945… y TEM 0.02.
  - TNA 15 % con capitalización diaria da `i_d` 0.15/360.
  - TEM 2 % efectiva da `TEA = 1.02^12 − 1`.
  - Son errores: una tasa nominal sin capitalización, una efectiva con capitalización, una capitalización mayor que el periodo y una tasa negativa.
  - Una tasa 0 da factores iguales a 1.
- Commit `feat(finance): add nominal and effective rate conversion` (`Refs: US06, US09`).

### Task 4: `CreditTerms` y `cycleFor`
- Pruebas con corte 20 y pago 26:
  - Una compra del 15/09 cae en el ciclo con corte el 20/09 y pago el 26/09.
  - Una compra del 20/09 a las 23:59:59 de Lima entra en ese mismo ciclo; una del 21/09 a las 00:00 de Lima pasa al ciclo con corte el 20/10 y pago el 26/10.
- Pruebas de la decisión 4: corte 25 y pago 5 dan pago el 05/10; si pago = corte, el pago cae al mes siguiente; un corte en diciembre lleva el ciclo a enero del año siguiente.
- Son errores los días de corte o de pago fuera de 1 a 28.
- Commit `feat(credit): assign purchases to billing cycles` (`Refs: US10`).

### Task 5: Cronograma francés (US09, criterios 1–5 y 7)
- Usar los fixtures de los juegos 1 y 2 y del control. Probar también tasa 0, n = 1, n mayor que el máximo y n = 25 (ambos son errores).
- Propiedades con 200 combinaciones generadas por semilla: el saldo final es 0.00, ningún saldo es negativo, la suma de las amortizaciones es exactamente `S_cap` y `|última cuota − R| ≤ 0.01·n`.
- Commit `feat(finance): french amortization with capitalized grace period` (`Refs: US09`).

### Task 6: Liquidación del ciclo (cálculo de US10, criterios 1–5 y 7)
- Pruebas: el ciclo de pago único con sus fixtures; las líneas salen ordenadas por fecha; un ciclo sin compras pero con una cuota vencida se liquida igual; una cuota más un cargo suman el total esperado sin contar dos veces el interés; una anulación descuenta su capital y su interés; las compras antes del corte anterior o después del corte dan `CHARGE_OUTSIDE_CYCLE`; si el total queda negativo, `ADJUSTMENTS_EXCEED_DUE`.
- Commit `feat(credit): settle cycle with compensatory interest` (`Refs: US10`).

### Task 7: Mora y pago (cálculo de US13, criterios 1–5, 7 y 8)
- Pruebas:
  - Pagar el 26/09 a las 23:30 de Lima da 0 días y no se recalcula nada; pagar el 27/09 a las 00:10 da 1 día.
  - Las moras de los fixtures de los juegos 1 y 2.
  - Pagar antes del vencimiento da 0 días.
  - Un ciclo `OPEN` da `CYCLE_NOT_BILLED`; uno `PAID` da `CYCLE_ALREADY_PAID`; un monto distinto da `PARTIAL_PAYMENT_NOT_ALLOWED`.
  - `oldestPayableCycle` elige el ciclo más antiguo.
  - `allocatePayment` cumple la decisión 3 (la suma de la mora repartida es igual a la mora total) y la igualdad `amount_paid = principal + compensatoria + moratoria`, y cada cuota del mes aparece como capital más interés.
- Commit `feat(credit): moratory interest and full payment quote` (`Refs: US13`).

### Task 8: Recorrido completo y documento
- `datasets.spec.ts` recorre cada juego de punta a punta: compra, cronograma, liquidación y pago con mora.
- `docs/quina-financial-engine.md` cubre:
  - Datos de entrada, intermedios y de salida con tipos y formatos (rúbrica a).
  - Las fórmulas (c).
  - Los 2 juegos de datos con sus tablas (d).
  - El pseudocódigo de los 4 algoritmos.
  - Los efectos de 30/360 en febrero.
  - El plan de pruebas (caja blanca con las unitarias y las propiedades; caja negra con los juegos de datos).
  - La matriz de criterios de aceptación contra pruebas.
  - Las decisiones 3 a 5 marcadas como reglas acordadas con el usuario.
- Enlazar el documento desde `docs/quina-documentation.md` y actualizar `AGENTS.md` §4 si hace falta.
- Commit `docs(finance): document formulas and test datasets` (`Refs: US09, US10, US13`).

## Verificación
- `pnpm format && pnpm check && pnpm lint && pnpm test` en verde.
- `python3 -I scripts/finance-oracle.py --check` coincide con los fixtures.
- Ningún monto usa `number` y `src/core` no importa infraestructura (regla de ESLint).
- Cada criterio de US09 (1–5 y 7) y los criterios de cálculo de US10 y US13 tienen una prueba nombrada en la matriz. El 6 de US09 (grabado y visible) queda para los Planes 3 y 5.
- CI en verde. El trabajo va en la rama de la sesión `claude/quina-analysis-phase-1-plan-4esrmc`, con Conventional Commits y push al terminar.
