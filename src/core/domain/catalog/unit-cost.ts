import { Dec } from '@/core/domain/shared/decimal';
import { Money } from '@/core/domain/shared/money';
import { err, ok, type Result } from '@/core/domain/shared/result';
import { Quantity } from './quantity';

export type UnitCostError = 'UNIT_COST_INVALID' | 'UNIT_COST_NOT_POSITIVE';

/** Hasta 8 enteros y 4 decimales: lo que cabe en `NUMERIC(12, 4)`. */
const UNIT_COST = /^\d{1,8}(\.\d{1,4})?$/;

export const UnitCost = {
  /** Costo unitario de compra como texto con 4 decimales (`> 0`). */
  parse(raw: string): Result<string, UnitCostError> {
    const clean = raw
      .trim()
      .replace(/[\s,]/g, '')
      .replace(/^S\/\.?/i, '');
    if (!UNIT_COST.test(clean)) return err('UNIT_COST_INVALID');
    const value = new Dec(clean);
    if (value.isZero()) return err('UNIT_COST_NOT_POSITIVE');
    return ok(value.toFixed(4));
  },

  /**
   * Costo promedio ponderado tras una entrada por compra (US16 crit. 1):
   * `(stock_actual × costo_actual + cantidad_compra × costo_compra) / (stock_actual + cantidad_compra)`
   * redondeado a 4 decimales (`ROUND_HALF_UP`). Si no había stock, toma el costo de la compra.
   */
  weightedAverage(
    currentStock: string,
    currentAverageCost: string,
    addedQuantity: string,
    purchaseUnitCost: string,
  ): string {
    const stock = new Dec(currentStock);
    const added = new Dec(addedQuantity);
    if (stock.lte(0)) return new Dec(purchaseUnitCost).toFixed(4);
    const totalValue = stock.times(currentAverageCost).plus(added.times(purchaseUnitCost));
    return totalValue.div(stock.plus(added)).toFixed(4);
  },

  /**
   * Valor monetario total del almacén (US16 crit. 6): suma `stock × avg_cost`
   * redondeado a céntimos por cada producto físico activo, consistente con `inventory_movements.total_cost`.
   */
  inventoryValuation(
    items: Iterable<{
      isService: boolean;
      isActive?: boolean;
      currentStock: string;
      currentAverageCost: string;
    }>,
  ): Money {
    let total = Money.zero('PEN');
    for (const item of items) {
      if (item.isService || item.isActive === false) continue;
      const lineValue = Quantity.valuedAt(item.currentStock, item.currentAverageCost);
      total = total.plus(Money.of(lineValue, 'PEN'));
    }
    return total;
  },
};
