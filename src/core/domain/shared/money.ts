import { Dec } from '@/core/domain/shared/decimal';

export type Currency = 'PEN' | 'USD';

const AMOUNT = /^-?\d+(\.\d+)?$/;

/**
 * Monto en céntimos exactos. Entra y sale como texto (las columnas `NUMERIC`
 * llegan como texto) y nunca pasa por `number`. Toda operación que produce un
 * monto lo redondea a 2 decimales, mitad hacia arriba.
 */
export class Money {
  private constructor(
    private readonly value: Dec,
    readonly currency: Currency,
  ) {}

  static of(amount: string, currency: Currency): Money {
    if (!AMOUNT.test(amount)) throw new RangeError(`Monto inválido: "${amount}"`);
    return new Money(new Dec(amount).toDecimalPlaces(2), currency);
  }

  static zero(currency: Currency): Money {
    return new Money(new Dec(0), currency);
  }

  /** Redondea un valor decimal del motor a céntimos. */
  static fromDecimal(value: Dec, currency: Currency): Money {
    return new Money(value.toDecimalPlaces(2), currency);
  }

  static sum(items: readonly Money[], currency: Currency): Money {
    return items.reduce((total, item) => total.plus(item), Money.zero(currency));
  }

  plus(other: Money): Money {
    return new Money(this.value.plus(this.same(other).value), this.currency);
  }

  minus(other: Money): Money {
    return new Money(this.value.minus(this.same(other).value), this.currency);
  }

  /** Multiplica por un factor del motor y redondea a céntimos. */
  times(factor: Dec): Money {
    return Money.fromDecimal(this.value.times(factor), this.currency);
  }

  /** Divide entre un entero y redondea a céntimos. */
  dividedBy(divisor: number): Money {
    return Money.fromDecimal(this.value.dividedBy(divisor), this.currency);
  }

  /**
   * Reparte este monto en proporción a `weights`: cada parte se trunca a
   * céntimos y la última absorbe el residuo, así la suma es exacta.
   */
  allocate(weights: readonly Money[]): Money[] {
    const total = weights.reduce((acc, w) => acc.plus(this.same(w).value), new Dec(0));
    if (weights.length === 0 || total.isZero()) throw new RangeError('Pesos vacíos o en cero');
    const shares = weights
      .slice(0, -1)
      .map(
        (w) =>
          new Money(
            this.value.times(w.value).dividedBy(total).toDecimalPlaces(2, Dec.ROUND_DOWN),
            this.currency,
          ),
      );
    const assigned = Money.sum(shares, this.currency);
    return [...shares, this.minus(assigned)];
  }

  decimal(): Dec {
    return this.value;
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative() && !this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.greaterThan(0);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  compare(other: Money): -1 | 0 | 1 {
    return this.value.comparedTo(this.same(other).value) as -1 | 0 | 1;
  }

  /** Texto con 2 decimales, listo para una columna `NUMERIC(12, 2)`. */
  toFixed2(): string {
    return this.value.toFixed(2);
  }

  toString(): string {
    return `${this.currency} ${this.toFixed2()}`;
  }

  private same(other: Money): Money {
    if (other.currency !== this.currency) {
      throw new TypeError(`No se mezclan monedas: ${this.currency} y ${other.currency}`);
    }
    return other;
  }
}
