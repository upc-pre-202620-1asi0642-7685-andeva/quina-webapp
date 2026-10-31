import type { Rate } from '@/core/domain/finance/rate';
import { Money } from '@/core/domain/shared/money';

/**
 * Interés por días (enunciado, puntos 5 y 6): base · ((1 + i_d)^días − 1),
 * redondeado a céntimos. Sirve para el interés compensatorio de un cargo de
 * pago único y para el interés moratorio de un ciclo vencido. Con 0 días o
 * menos no hay interés.
 */
export function interestForDays(base: Money, rate: Rate, days: number): Money {
  if (days <= 0) return Money.zero(base.currency);
  return base.times(rate.compoundFactor(days).minus(1));
}
