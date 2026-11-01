import { BusinessDate } from '@/core/domain/shared/business-date';

type CycleDays = { cutOffDay: number; paymentDueDay: number };

/** Ciclo mensual de una cuenta: lo que se liquida en un corte y se paga en una fecha. */
export type BillingCycle = {
  readonly periodYear: number;
  readonly periodMonth: number;
  /** Corte anterior (exclusivo): las compras de ese día pertenecen al ciclo previo. */
  readonly previousCutOffDate: BusinessDate;
  readonly cutOffDate: BusinessDate;
  readonly paymentDueDate: BusinessDate;
  /** 23:59:59.999 de Lima del día de corte, en UTC (`settlement_cycles.cut_off_date`). */
  readonly cutOffInstant: Date;
  /** 23:59:59.999 de Lima del día de pago, en UTC (`settlement_cycles.payment_due_date`). */
  readonly paymentDueInstant: Date;
};

/**
 * Ciclo cuyo corte cae en el año y mes indicados. La fecha de pago es la
 * primera con el día pactado estrictamente posterior al corte: con corte 20 y
 * pago 26 cae el mismo mes; con corte 25 y pago 5 (o pago igual al corte), al
 * mes siguiente.
 */
export function cycleClosingIn(year: number, month: number, days: CycleDays): BillingCycle {
  const cutOffDate = BusinessDate.of(year, month, days.cutOffDay);
  const sameMonthDue = BusinessDate.of(year, month, days.paymentDueDay);
  const paymentDueDate =
    days.paymentDueDay > days.cutOffDay ? sameMonthDue : BusinessDate.addMonths(sameMonthDue, 1);
  return Object.freeze({
    periodYear: year,
    periodMonth: month,
    previousCutOffDate: BusinessDate.addMonths(cutOffDate, -1),
    cutOffDate,
    paymentDueDate,
    cutOffInstant: BusinessDate.endInstant(cutOffDate),
    paymentDueInstant: BusinessDate.endInstant(paymentDueDate),
  });
}

/**
 * Ciclo al que pertenece una compra: si su día en Lima es igual o anterior al
 * día de corte (hasta las 23:59:59), el que cierra ese mes; si no, el del mes
 * siguiente (enunciado, punto 5; US10 crit. 1 y 5).
 */
export function cycleFor(purchaseInstant: Date, days: CycleDays): BillingCycle {
  const day = BusinessDate.fromInstant(purchaseInstant);
  const closing =
    day.day <= days.cutOffDay
      ? BusinessDate.of(day.year, day.month, days.cutOffDay)
      : BusinessDate.addMonths(BusinessDate.of(day.year, day.month, days.cutOffDay), 1);
  return cycleClosingIn(closing.year, closing.month, days);
}

/** ¿El día de Lima de este instante cae dentro del ciclo? */
export function cycleContains(cycle: BillingCycle, instant: Date): boolean {
  const day = BusinessDate.fromInstant(instant);
  return (
    BusinessDate.compare(day, cycle.previousCutOffDate) > 0 &&
    BusinessDate.compare(day, cycle.cutOffDate) <= 0
  );
}

/**
 * Último ciclo cuyo corte ya pasó al empezar el día `today` de Lima. El
 * proceso diario corre de madrugada: el corte del 20 se liquida el 21, porque
 * las compras hasta las 23:59:59 del 20 entran a ese ciclo (US10 crit. 1).
 */
export function lastClosedCycle(today: BusinessDate, days: CycleDays): BillingCycle {
  const thisMonth = BusinessDate.of(today.year, today.month, days.cutOffDay);
  const closing =
    BusinessDate.compare(thisMonth, today) < 0 ? thisMonth : BusinessDate.addMonths(thisMonth, -1);
  return cycleClosingIn(closing.year, closing.month, days);
}

/**
 * Ciclo cuya fecha de pago es `paymentDate`: ahí vence la cuota francesa con
 * ese vencimiento (US10 crit. 3). Devuelve null si no es un día de pago.
 */
export function cycleWithPaymentOn(
  paymentDate: BusinessDate,
  days: CycleDays,
): BillingCycle | null {
  for (const offset of [0, -1]) {
    const month = BusinessDate.addMonths(
      BusinessDate.of(paymentDate.year, paymentDate.month, 1),
      offset,
    );
    const cycle = cycleClosingIn(month.year, month.month, days);
    if (BusinessDate.compare(cycle.paymentDueDate, paymentDate) === 0) return cycle;
  }
  return null;
}
