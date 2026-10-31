import { Money as MoneyValue, type Currency } from '@/core/domain/shared/money';
import { cn } from '@/presentation/lib/utils';

const SYMBOL: Record<Currency, string> = { PEN: 'S/', USD: 'US$' };

/** `S/ 1,234.50` con separador de miles peruano, sin pasar por `number`. */
export function formatMoney(amount: string, currency: Currency): string {
  const [integer = '0', decimals = '00'] = MoneyValue.of(amount, currency).toFixed2().split('.');
  const negative = integer.startsWith('-');
  const digits = negative ? integer.slice(1) : integer;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${SYMBOL[currency]} ${grouped}.${decimals}`;
}

/** Único componente de montos (DESIGN.md §7.3): `tabular-nums` y 2 decimales. */
export function Money({
  amount,
  currency,
  className,
}: {
  amount: string;
  currency: Currency;
  className?: string;
}) {
  return <span className={cn('tabular-nums', className)}>{formatMoney(amount, currency)}</span>;
}
