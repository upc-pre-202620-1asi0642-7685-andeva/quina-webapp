import { describe, expect, it } from 'vitest';
import {
  creditScore,
  scoreBand,
  suggestsLowerLimit,
  type ScoredCycle,
} from '@/core/domain/credit/credit-score';
import { BusinessDate } from '@/core/domain/shared/business-date';

const d = BusinessDate.parse;
const cycle = (cutOff: string, due: string, paidOn: string | null): ScoredCycle => ({
  cutOffDate: d(cutOff),
  paymentDueDate: d(due),
  paidOn: paidOn ? d(paidOn) : null,
});

describe('creditScore (US19 crit. 2 y 3)', () => {
  it('sin historial queda en 100, Verde', () => {
    expect(creditScore([], d('2026-11-13'))).toEqual({
      score: 100,
      band: 'GREEN',
      hasHistory: false,
    });
  });

  it('descuenta 3 puntos por día de mora de un ciclo pagado tarde', () => {
    const cycles = [cycle('2026-09-20', '2026-09-26', '2026-10-06')];
    // 26/09 → 06/10 son 10 días en base 30/360
    expect(creditScore(cycles, d('2026-11-13'))).toMatchObject({ score: 70, band: 'GREEN' });
  });

  it('premia con 5 puntos cada ciclo pagado a tiempo, hasta 100', () => {
    const cycles = [
      cycle('2026-08-20', '2026-08-26', '2026-09-05'), // 9 días tarde: −27
      cycle('2026-09-20', '2026-09-26', '2026-09-25'), // a tiempo: +5
      cycle('2026-10-20', '2026-10-26', '2026-10-26'), // el mismo día: +5
    ];
    expect(creditScore(cycles, d('2026-11-13')).score).toBe(83);
  });

  it('un ciclo vencido sin pagar sigue sumando mora hasta hoy', () => {
    const cycles = [cycle('2026-09-20', '2026-09-26', null)];
    // 26/09 → 13/11: 47 días → 100 − 141 → recortado a 0
    expect(creditScore(cycles, d('2026-11-13'))).toMatchObject({ score: 0, band: 'RED' });
  });

  it('solo cuenta los vencimientos de los últimos 6 meses', () => {
    const cycles = [cycle('2026-04-20', '2026-04-26', null)];
    expect(creditScore(cycles, d('2026-11-13'))).toEqual({
      score: 100,
      band: 'GREEN',
      hasHistory: false,
    });
  });

  it('un pago posterior a la fecha evaluada todavía no cuenta', () => {
    const cycles = [cycle('2026-09-20', '2026-09-26', '2026-11-01')];
    // Al 06/10 el ciclo seguía vencido: 10 días
    expect(creditScore(cycles, d('2026-10-06')).score).toBe(70);
  });

  it('las bandas cortan en 70 y 40', () => {
    expect([scoreBand(70), scoreBand(69), scoreBand(40), scoreBand(39)]).toEqual([
      'GREEN',
      'YELLOW',
      'YELLOW',
      'RED',
    ]);
  });
});

describe('suggestsLowerLimit (US19 crit. 4)', () => {
  it('sugiere bajar el límite tras dos cortes seguidos en Rojo', () => {
    const cycles = [
      cycle('2026-08-20', '2026-08-26', null),
      cycle('2026-09-20', '2026-09-26', null),
      cycle('2026-10-20', '2026-10-26', null),
    ];
    // Al 20/09 ya van 24 días de mora (Rojo); al 20/10, más todavía
    expect(suggestsLowerLimit(cycles, d('2026-11-13'))).toBe(true);
  });

  it('un solo corte en Rojo todavía no basta', () => {
    const cycles = [
      cycle('2026-09-20', '2026-09-26', '2026-09-26'),
      cycle('2026-10-20', '2026-10-26', null),
    ];
    // Al 20/09 no había vencimientos; al 20/10 el ciclo de septiembre estaba pagado
    expect(suggestsLowerLimit(cycles, d('2026-11-13'))).toBe(false);
  });
});
