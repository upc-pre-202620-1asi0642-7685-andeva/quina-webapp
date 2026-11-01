import { Money } from '@/core/domain/shared/money';
import { err, ok, type Result } from '@/core/domain/shared/result';

export type ProductPricesError =
  'CASH_PRICE_INVALID' | 'CREDIT_PRICE_INVALID' | 'CREDIT_BELOW_CASH';

export type ProductPrices = { readonly cash: Money; readonly credit: Money };

/** Hasta 10 enteros y 2 decimales: lo que cabe en `NUMERIC(12, 2)`. */
const AMOUNT = /^\d{1,10}(\.\d{1,2})?$/;

function price(raw: string): Money | null {
  const clean = raw.replace(/[\s,]/g, '').replace(/^S\/\.?/i, '');
  if (!AMOUNT.test(clean)) return null;
  const amount = Money.of(clean, 'PEN');
  return amount.isPositive() ? amount : null;
}

export const ProductPrices = {
  /**
   * Precio al contado y al crédito del catálogo, en soles (US03 crit. 1 y 6):
   * los dos mayores que cero y el de crédito nunca menor que el de contado.
   */
  parse(cashRaw: string, creditRaw: string): Result<ProductPrices, ProductPricesError> {
    const cash = price(cashRaw);
    if (!cash) return err('CASH_PRICE_INVALID');
    const credit = price(creditRaw);
    if (!credit) return err('CREDIT_PRICE_INVALID');
    if (credit.compare(cash) < 0) return err('CREDIT_BELOW_CASH');
    return ok(Object.freeze({ cash, credit }));
  },

  /** ¿Cambió alguno de los dos precios? Solo entonces va al historial (US03 crit. 4). */
  changed(before: ProductPrices, after: ProductPrices): boolean {
    return !before.cash.equals(after.cash) || !before.credit.equals(after.credit);
  },
};
