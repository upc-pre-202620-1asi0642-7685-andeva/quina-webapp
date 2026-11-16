import { days30360 } from '../finance/day-count';
import { BusinessDate } from '../shared/business-date';

/**
 * Puntaje interno de pago del vecino (US19, decisión del Plan 8): base 100,
 * −3 por cada día de mora y +5 por cada ciclo pagado a tiempo en los últimos
 * 6 meses, recortado a 0–100. Los días de mora se cuentan igual que la mora
 * cobrada: base 30/360 desde la fecha de pago (`quotePayment`).
 */
const BASE = 100;
const PENALTY_PER_DAY = 3;
const ON_TIME_BONUS = 5;
const WINDOW_MONTHS = 6;

export type ScoreBand = 'GREEN' | 'YELLOW' | 'RED';

/** Un ciclo liquidado: vence en `paymentDueDate` y se pagó el día `paidOn` (null si no). */
export type ScoredCycle = {
  cutOffDate: BusinessDate;
  paymentDueDate: BusinessDate;
  paidOn: BusinessDate | null;
};

export type CreditScore = { score: number; band: ScoreBand; hasHistory: boolean };
export type CreditScoreBreakdown = CreditScore & {
  onTimeCycles: number;
  lateCycles: number;
  daysLate: number;
};

export function scoreBand(score: number): ScoreBand {
  return score >= 70 ? 'GREEN' : score >= 40 ? 'YELLOW' : 'RED';
}

/** Desglose del puntaje al día `asOf`: un pago posterior a ese día aún no cuenta. */
export function creditScoreBreakdown(
  cycles: readonly ScoredCycle[],
  asOf: BusinessDate,
): CreditScoreBreakdown {
  const windowStart = BusinessDate.addCalendarMonths(asOf, -WINDOW_MONTHS);
  let daysLate = 0;
  let onTimeCycles = 0;
  let lateCycles = 0;
  let counted = 0;
  for (const cycle of cycles) {
    const due = cycle.paymentDueDate;
    if (BusinessDate.compare(due, windowStart) <= 0 || BusinessDate.compare(due, asOf) > 0) {
      continue;
    }
    const paid =
      cycle.paidOn && BusinessDate.compare(cycle.paidOn, asOf) <= 0 ? cycle.paidOn : null;
    if (paid) {
      const late = Math.max(0, days30360(due, paid));
      counted += 1;
      if (late === 0) onTimeCycles += 1;
      else {
        lateCycles += 1;
        daysLate += late;
      }
    } else if (BusinessDate.compare(due, asOf) < 0) {
      // Vencido y sin pagar a esa fecha: la mora sigue sumando
      counted += 1;
      lateCycles += 1;
      daysLate += Math.max(0, days30360(due, asOf));
    }
    // Vence hoy y aún no se paga: todavía no es puntual ni moroso
  }
  const raw = BASE - PENALTY_PER_DAY * daysLate + ON_TIME_BONUS * onTimeCycles;
  const score = Math.min(100, Math.max(0, raw));
  return {
    score,
    band: scoreBand(score),
    hasHistory: counted > 0,
    onTimeCycles,
    lateCycles,
    daysLate,
  };
}

/** Puntaje como se veía el día `asOf`: un pago posterior a ese día aún no cuenta. */
export function creditScore(cycles: readonly ScoredCycle[], asOf: BusinessDate): CreditScore {
  const { score, band, hasHistory } = creditScoreBreakdown(cycles, asOf);
  return { score, band, hasHistory };
}

/**
 * US19 crit. 4: sugiere bajar el límite si el vecino quedó en Rojo al cierre de
 * sus dos últimos cortes (hasta `today`).
 */
export function suggestsLowerLimit(cycles: readonly ScoredCycle[], today: BusinessDate): boolean {
  const cutOffs = cycles
    .map((c) => c.cutOffDate)
    .filter((d) => BusinessDate.compare(d, today) <= 0)
    .sort(BusinessDate.compare)
    .slice(-2);
  return cutOffs.length === 2 && cutOffs.every((d) => creditScore(cycles, d).band === 'RED');
}
