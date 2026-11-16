'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  MinusIcon,
  PackageIcon,
  PackagePlusIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  ShoppingBasketIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { sileo } from 'sileo';
import { Quantity } from '@/core/domain/catalog/quantity';
import {
  CASH_PAYMENT_METHODS,
  settleCashPayment,
  type CashPaymentMethod,
} from '@/core/domain/sales/cash-payment';
import {
  availableCredit,
  settleCreditSale,
  type CreditAccountSnapshot,
  type CreditPlan,
} from '@/core/domain/sales/credit-sale';
import {
  priceSale,
  type CartLine,
  type SaleModality,
  type SaleProduct,
} from '@/core/domain/sales/sale-pricing';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Dec } from '@/core/domain/shared/decimal';
import { Money as MoneyValue } from '@/core/domain/shared/money';
import type { ProductListItem } from '@/infrastructure/db/queries/catalog';
import type { CounterCustomer, TodayCounterSummary } from '@/infrastructure/db/queries/sales';
import {
  registerCashSaleAction,
  registerCreditSaleAction,
  type CreditSaleActionError,
  type SaleActionError,
} from '@/presentation/actions/sales';
import {
  ProductStatusBadge,
  productStatus,
} from '@/presentation/components/catalog/product-status-badge';
import { formatMoney, Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { Button, buttonVariants } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/presentation/components/ui/sheet';
import { formatDate } from '@/presentation/lib/format-date';
import { formatQuantity } from '@/presentation/lib/format-quantity';
import { useDragToClose } from '@/presentation/lib/use-drag-to-close';
import { cn } from '@/presentation/lib/utils';
import { CustomerPicker, type CreditUsageSummary } from './customer-picker';
import { TodaySalesSheet } from './today-sales-sheet';

/** Billetes que suele recibir el mostrador, para un toque en lugar de teclear. */
const BILLS = ['10', '20', '50', '100', '200'];

type CounterError = SaleActionError | CreditSaleActionError;

/** Lo último que la venta optimista cambió en la deuda del vecino (US08 crit. 5). */
type BalanceOverride = { from: string; to: string };

type CatalogFilter = 'all' | 'top' | 'inCart' | 'installments';

type UndoSnapshot = {
  cart: CartLine[];
  message: string;
};

function toSaleProduct(item: ProductListItem): SaleProduct {
  return {
    id: item.id,
    name: item.name,
    isService: item.isService,
    isActive: item.isActive,
    allowDecimals: item.allowDecimals,
    allowsInstallments: item.allowsInstallments,
    currentStock: item.currentStock,
    cashPrice: item.cashPrice,
    creditPrice: item.creditPrice,
    // El costo no viaja al navegador: lo congela el servidor
    currentAverageCost: '0.0000',
  };
}

/** ¿Por qué no se le puede fiar? `null` si la cuenta está al día. */
function accountBlock(account: CreditAccountSnapshot | null) {
  if (!account) return 'NO_ACCOUNT' as const;
  if (account.status === 'SUSPENDED') return 'ACCOUNT_SUSPENDED' as const;
  if (account.status === 'BLOCKED') return 'ACCOUNT_BLOCKED' as const;
  if (account.hasOverdueCycle) return 'ACCOUNT_OVERDUE' as const;
  if (account.terms.currency !== 'PEN') return 'USD_ACCOUNT' as const;
  return null;
}

export function Counter({
  products,
  customers,
  topProductIds = [],
  todaySummary,
  canManageCatalog = false,
  canCreateCustomer = false,
  heading,
}: {
  products: ProductListItem[];
  customers: CounterCustomer[];
  topProductIds?: string[];
  todaySummary?: TodayCounterSummary;
  canManageCatalog?: boolean;
  canCreateCustomer?: boolean;
  heading?: React.ReactNode;
}) {
  const t = useTranslations('Sales');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CatalogFilter>('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [undoState, setUndoState] = useState<UndoSnapshot | null>(null);
  const [modality, setModality] = useState<SaleModality>('CASH');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [plan, setPlan] = useState<CreditPlan>({ mode: 'SINGLE' });
  const [method, setMethod] = useState<CashPaymentMethod>('CASH');
  const [received, setReceived] = useState('');
  const [error, setError] = useState<CounterError | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, BalanceOverride>>({});
  // La fecha decide el ciclo en pantalla; el servidor la vuelve a calcular al vender
  const [now] = useState(() => new Date());
  const [, startTransition] = useTransition();
  const { dy, handlers: dragHandlers } = useDragToClose(() => setSheetOpen(false));

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const saleProducts = useMemo(() => products.map(toSaleProduct), [products]);
  const topSet = useMemo(() => new Set(topProductIds), [topProductIds]);
  const cartIds = useMemo(() => new Set(cart.map((l) => l.productId)), [cart]);

  const topCount = useMemo(
    () => products.filter((p) => topSet.has(p.id)).length,
    [products, topSet],
  );
  const installmentsCount = useMemo(
    () => products.filter((p) => p.allowsInstallments).length,
    [products],
  );

  const activeFilter: CatalogFilter =
    filter === 'inCart' && cart.length === 0
      ? 'all'
      : filter === 'top' && topCount === 0
        ? 'all'
        : filter === 'installments' && installmentsCount === 0
          ? 'all'
          : filter;

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((p) => {
      if (activeFilter === 'top' && !topSet.has(p.id)) return false;
      if (activeFilter === 'inCart' && !cartIds.has(p.id)) return false;
      if (activeFilter === 'installments' && !p.allowsInstallments) return false;
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        (p.brand ?? '').toLowerCase().includes(term) ||
        (p.barcode ?? '').toLowerCase() === term
      );
    });
  }, [products, query, activeFilter, topSet, cartIds]);

  const customer = customers.find((c) => c.id === customerId) ?? null;
  // La deuda optimista vale hasta que el servidor devuelve la nueva
  const account: CreditAccountSnapshot | null = customer?.account
    ? {
        ...customer.account,
        currentBalance:
          overrides[customer.id]?.from === customer.account.currentBalance
            ? overrides[customer.id]!.to
            : customer.account.currentBalance,
      }
    : null;
  const block = accountBlock(account);
  const credit = modality === 'CREDIT';

  const priced = cart.length > 0 ? priceSale(cart, saleProducts, modality) : null;
  const total = priced?.ok ? priced.value.total : MoneyValue.zero('PEN');
  const payment = !credit && priced?.ok ? settleCashPayment(total, method, received) : null;
  const creditSettled =
    credit && account && cart.length > 0
      ? settleCreditSale({ cart, products: saleProducts, account, plan, now })
      : null;
  const installmentsAllowed = priced?.ok ? priced.value.allowsInstallments : false;
  const maxInstallments = account?.terms.maxInstallmentMonths ?? 1;

  const ready = credit ? Boolean(creditSettled?.ok) : Boolean(priced?.ok && payment?.ok);

  const creditUsage: CreditUsageSummary | null = (() => {
    if (!account || block !== null) return null;
    const limitStr = account.terms.creditLimit;
    const limitDec = new Dec(limitStr);
    const usedDec = new Dec(account.currentBalance);
    const ratio = limitDec.gt(0) ? usedDec.div(limitDec).toNumber() : 0;
    return {
      used: account.currentBalance,
      limit: limitStr,
      ratio,
      // DESIGN.md §2.4: uso >= 85 % del límite activa alerta ámbar
      nearLimit: ratio >= 0.85,
      afterSale: credit && creditSettled?.ok ? creditSettled.value.availableAfter.toFixed2() : null,
    };
  })();

  const inCart = (productId: string) => cart.find((l) => l.productId === productId)?.quantity;

  function canAddOne(item: ProductListItem): boolean {
    if (item.isService) return true;
    const current = safe(inCart(item.id) ?? '0');
    return Quantity.compare(Quantity.plus(current, '1'), item.currentStock) <= 0;
  }

  function add(item: ProductListItem) {
    setError(null);
    setUndoState(null);
    setCart((current) => {
      const line = current.find((l) => l.productId === item.id);
      if (!line) return [...current, { productId: item.id, quantity: '1' }];
      return current.map((l) =>
        l.productId === item.id
          ? { ...l, quantity: formatQuantity(Quantity.plus(safe(l.quantity), '1')) }
          : l,
      );
    });
  }

  function decrement(productId: string) {
    setError(null);
    const item = byId.get(productId);
    const existing = cart.find((l) => l.productId === productId);
    if (existing && item) {
      const next = Quantity.minus(safe(existing.quantity), '1');
      if (Quantity.compare(next, '0') <= 0) {
        setUndoState({
          cart,
          message: t('undoRemoved', { product: item.name }),
        });
      }
    }
    setCart((current) =>
      current.flatMap((l) => {
        if (l.productId !== productId) return [l];
        const next = Quantity.minus(safe(l.quantity), '1');
        return Quantity.compare(next, '0') <= 0 ? [] : [{ ...l, quantity: formatQuantity(next) }];
      }),
    );
  }

  function setQuantity(productId: string, quantity: string) {
    setError(null);
    setCart((current) => current.map((l) => (l.productId === productId ? { ...l, quantity } : l)));
  }

  function remove(productId: string) {
    setError(null);
    const item = byId.get(productId);
    if (item) {
      setUndoState({
        cart,
        message: t('undoRemoved', { product: item.name }),
      });
    }
    setCart((current) => current.filter((l) => l.productId !== productId));
  }

  function clearCart() {
    if (cart.length === 0) return;
    setError(null);
    setUndoState({
      cart,
      message: t('undoCleared', { count: cart.length }),
    });
    setCart([]);
    if (filter === 'inCart') setFilter('all');
  }

  function undo() {
    if (!undoState) return;
    setError(null);
    setCart(undoState.cart);
    setUndoState(null);
  }

  function repeatSale(items: { productId: string; quantity: string }[]) {
    const validLines: CartLine[] = [];
    for (const line of items) {
      const product = byId.get(line.productId);
      if (!product || !product.isActive) continue;
      if (product.isService) {
        validLines.push({ productId: product.id, quantity: line.quantity });
        continue;
      }
      if (Quantity.isZero(product.currentStock)) continue;
      const clamped =
        Quantity.compare(line.quantity, product.currentStock) > 0
          ? formatQuantity(product.currentStock)
          : line.quantity;
      validLines.push({ productId: product.id, quantity: clamped });
    }
    if (validLines.length === 0) {
      sileo.error({ title: t('todaySales.repeatedOutToast') });
      return;
    }
    if (cart.length > 0) {
      setUndoState({
        cart,
        message: t('undoCleared', { count: cart.length }),
      });
    }
    setError(null);
    setCart(validLines);
    sileo.success({ title: t('todaySales.repeatedToast', { count: validLines.length }) });
  }

  /** Elegir un vecino con cuenta pasa al fiado; sin cuenta, solo se asocia al contado (D13). */
  function chooseCustomer(next: CounterCustomer | null) {
    setError(null);
    setCustomerId(next?.id ?? null);
    setPlan({ mode: 'SINGLE' });
    setModality(next?.account ? 'CREDIT' : 'CASH');
  }

  function resetSale() {
    setCart([]);
    setUndoState(null);
    setReceived('');
    setMethod('CASH');
    setPlan({ mode: 'SINGLE' });
    setSheetOpen(false);
    setError(null);
    if (filter === 'inCart') setFilter('all');
  }

  function restore(snapshot: { cart: CartLine[] }, failure: CounterError) {
    // Lo que no se pudo vender vuelve al carrito con el motivo en pantalla
    setCart(snapshot.cart);
    setError(failure);
    setSheetOpen(true);
    if (failure.code === 'OUT_OF_STOCK' || failure.code === 'EXCEEDS_AVAILABLE') router.refresh();
  }

  function confirm() {
    if (!ready || !priced?.ok) return;
    const shownTotal = formatMoney(total.toFixed2(), 'PEN');

    if (credit && customer && account && creditSettled?.ok) {
      const snapshot = { cart, plan, customer, account };
      const optimistic = {
        from: customer.account!.currentBalance,
        to: creditSettled.value.balanceAfter.toFixed2(),
      };
      // Interfaz optimista (US08 crit. 5): la deuda del vecino sube al instante
      setOverrides((o) => ({ ...o, [customer.id]: optimistic }));
      resetSale();
      startTransition(async () => {
        const result = await registerCreditSaleAction({
          cart: snapshot.cart,
          customerId: snapshot.customer.id,
          plan: snapshot.plan,
        });
        if (result.ok) {
          setOverrides((o) => ({
            ...o,
            [snapshot.customer.id]: { from: optimistic.from, to: result.sale.balanceAfter },
          }));
          sileo.success({
            title: t('toastCreditTitle', { total: shownTotal }),
            description: result.sale.installments
              ? t('toastInstallments', {
                  name: snapshot.customer.name,
                  count: result.sale.installments.count,
                  amount: formatMoney(result.sale.installments.amount, 'PEN'),
                })
              : t('toastAvailable', {
                  name: snapshot.customer.name,
                  available: formatMoney(result.sale.availableAfter, 'PEN'),
                }),
          });
          router.refresh();
          return;
        }
        setOverrides((o) =>
          Object.fromEntries(Object.entries(o).filter(([id]) => id !== snapshot.customer.id)),
        );
        setPlan(snapshot.plan);
        restore(snapshot, result.error);
      });
      return;
    }

    const snapshot = { cart, method, received };
    resetSale();
    startTransition(async () => {
      const result = await registerCashSaleAction({
        cart: snapshot.cart,
        paymentMethod: snapshot.method,
        amountReceived: snapshot.received,
        customerId,
      });
      if (result.ok) {
        sileo.success({
          title: t('toastTitle', { total: shownTotal }),
          description: result.changeGiven
            ? t('toastChange', { change: formatMoney(result.changeGiven, 'PEN') })
            : undefined,
        });
        router.refresh();
        return;
      }
      setMethod(snapshot.method);
      setReceived(snapshot.received);
      restore(snapshot, result.error);
    });
  }

  const pricingError = priced && !priced.ok ? priced.error : null;
  const settleError = credit
    ? creditSettled && !creditSettled.ok
      ? creditSettled.error
      : null
    : payment && !payment.ok
      ? { code: payment.error }
      : null;
  const shownError = error ?? pricingError ?? settleError;

  const errorText = (e: NonNullable<typeof shownError>): string => {
    switch (e.code) {
      case 'OUT_OF_STOCK':
        return t('errors.OUT_OF_STOCK', {
          product: e.productName,
          available: formatQuantity(e.available),
        });
      case 'QUANTITY_INVALID':
        return t('errors.QUANTITY_INVALID', { product: e.productName });
      case 'EXCEEDS_AVAILABLE':
        return t('errors.EXCEEDS_AVAILABLE', { excess: formatMoney(e.excess, 'PEN') });
      case 'EXCEEDS_MAX_INSTALLMENT_MONTHS':
        return t('errors.EXCEEDS_MAX_INSTALLMENT_MONTHS', { max: e.max });
      default:
        return t(`errors.${e.code}`);
    }
  };

  const customerDetail = customer ? (
    block === null && account ? (
      <span className="text-ink-soft">
        {t.rich('customer.available', {
          amount: formatMoney(availableCredit(account).toFixed2(), 'PEN'),
          strong: (chunks) => (
            <strong className="font-semibold text-ink tabular-nums">{chunks}</strong>
          ),
        })}
      </span>
    ) : (
      <span className="font-medium text-error-ink">{t(`customer.blocked.${block}`)}</span>
    )
  ) : null;

  // El carrito se pinta en la columna (escritorio) y en la hoja (celular): ids propios en cada uno
  const cartPanel = (id: string) => (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">{t('modalityLabel')}</legend>
        <div className="relative grid grid-cols-2 rounded-full bg-paper-deep p-1">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-surface shadow-xs transition-transform duration-200 ease-(--ease-out-expo) motion-reduce:transition-none"
            style={{
              transform: modality === 'CREDIT' ? 'translateX(100%)' : 'translateX(0%)',
            }}
          />
          {(['CASH', 'CREDIT'] as const).map((value) => {
            const disabled = value === 'CREDIT' && block !== null;
            return (
              <label
                key={value}
                className={cn(
                  'relative z-10 flex h-11 items-center justify-center rounded-full text-sm font-semibold transition-[color,transform] duration-150 ease-(--ease-out-expo) select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-link-active',
                  modality === value ? 'text-ink' : 'text-ink-soft',
                  disabled
                    ? 'cursor-not-allowed opacity-60'
                    : 'cursor-pointer active:scale-[0.97] motion-reduce:active:scale-100',
                )}
              >
                <input
                  type="radio"
                  name={`${id}-modality`}
                  value={value}
                  checked={modality === value}
                  disabled={disabled}
                  onChange={() => {
                    setError(null);
                    setModality(value);
                  }}
                  className="sr-only"
                />
                {t(`modality.${value}`)}
              </label>
            );
          })}
        </div>
        {block === 'NO_ACCOUNT' && !customer ? (
          <p className="text-[13px] text-ink-soft">{t('modalityHint')}</p>
        ) : null}
      </fieldset>

      {undoState ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-2 rounded-field border border-line bg-paper px-3 py-2 text-sm"
        >
          <span className="truncate text-ink-soft">{undoState.message}</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={undo}
            className="shrink-0 transition-transform duration-150 ease-(--ease-out-expo) active:scale-[0.97]"
          >
            <RotateCcwIcon aria-hidden="true" className="size-4" />
            {t('undo')}
          </Button>
        </div>
      ) : null}

      {cart.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-paper-deep text-ink-soft">
            <ShoppingBasketIcon aria-hidden="true" className="size-6" />
          </span>
          <p className="text-sm text-ink-soft">{t('emptyCart')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink-soft tabular-nums">
              {t('itemsSummary', { lines: cart.length })}
            </span>
            <button
              type="button"
              onClick={clearCart}
              aria-label={t('clearCartAria')}
              className="inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface-hover hover:text-error-ink focus-visible:outline-2 focus-visible:outline-link-active"
            >
              <Trash2Icon aria-hidden="true" className="size-3.5" />
              {t('clearCart')}
            </button>
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {cart.map((line) => {
              const item = byId.get(line.productId);
              if (!item) return null;
              const pricedLine = priced?.ok
                ? priced.value.lines.find((l) => l.productId === line.productId)
                : undefined;
              return (
                <li key={line.productId} className="flex flex-col gap-2 py-3 first:pt-1">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium text-ink">{item.name}</span>
                    <span className="text-sm font-semibold whitespace-nowrap text-ink tabular-nums">
                      {pricedLine ? (
                        <Money amount={pricedLine.subtotal.toFixed2()} currency="PEN" />
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={() => decrement(line.productId)}
                      aria-label={t('decrease', { product: item.name })}
                    >
                      <MinusIcon aria-hidden="true" />
                    </Button>
                    <label htmlFor={`${id}-qty-${line.productId}`} className="sr-only">
                      {t('quantityLabel', { product: item.name })}
                    </label>
                    <Input
                      id={`${id}-qty-${line.productId}`}
                      value={line.quantity}
                      inputMode={item.allowDecimals ? 'decimal' : 'numeric'}
                      autoComplete="off"
                      onChange={(e) => setQuantity(line.productId, e.target.value)}
                      className="w-20 text-center tabular-nums"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      disabled={!canAddOne(item)}
                      onClick={() => add(item)}
                      aria-label={t('increase', { product: item.name })}
                    >
                      <PlusIcon aria-hidden="true" />
                    </Button>
                    <span className="text-[13px] text-ink-soft">{item.unitCode}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="ml-auto text-ink-soft hover:text-error-ink"
                      onClick={() => remove(line.productId)}
                      aria-label={t('remove', { product: item.name })}
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div
        className="flex items-baseline justify-between border-t border-line pt-3"
        aria-live="polite"
      >
        <span className="text-base font-medium text-ink">
          {credit ? t('totalCredit') : t('total')}
        </span>
        <Money
          amount={total.toFixed2()}
          currency="PEN"
          className="text-2xl font-semibold text-ink tabular-nums"
        />
      </div>

      {credit ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-ink">{t('planLabel')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['SINGLE', 'INSTALLMENTS'] as const).map((mode) => {
              const disabled =
                mode === 'INSTALLMENTS' && (!installmentsAllowed || maxInstallments < 2);
              return (
                <label
                  key={mode}
                  className={cn(
                    'flex h-11 items-center justify-center rounded-field border text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 ease-(--ease-out-expo) select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-link-active',
                    plan.mode === mode
                      ? 'border-link-active bg-soft text-soft-ink'
                      : 'border-line bg-surface text-ink hover:bg-surface-hover',
                    disabled
                      ? 'cursor-not-allowed opacity-60'
                      : 'cursor-pointer active:scale-[0.97] motion-reduce:active:scale-100',
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-plan`}
                    value={mode}
                    checked={plan.mode === mode}
                    disabled={disabled}
                    onChange={() => {
                      setError(null);
                      setPlan(
                        mode === 'SINGLE'
                          ? { mode }
                          : { mode, count: Math.min(3, maxInstallments) },
                      );
                    }}
                    className="sr-only"
                  />
                  {t(`plan.${mode}`)}
                </label>
              );
            })}
          </div>
          {plan.mode === 'INSTALLMENTS' ? (
            <div className="flex flex-col gap-2">
              <label htmlFor={`${id}-installments`} className="text-sm font-medium text-ink">
                {t('installmentsLabel')}
              </label>
              <select
                id={`${id}-installments`}
                value={plan.count}
                onChange={(e) => {
                  setError(null);
                  setPlan({ mode: 'INSTALLMENTS', count: Number(e.target.value) });
                }}
                className="h-11 rounded-field border border-line bg-surface px-3 text-base text-ink tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active"
              >
                {Array.from({ length: maxInstallments - 1 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {t('installmentsOption', { count: n })}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <p className="text-[13px] text-ink-soft">
            {installmentsAllowed || cart.length === 0 ? t('planHint') : t('planNoInstallments')}
          </p>
          {creditSettled?.ok ? (
            <dl
              className="flex flex-col gap-1 rounded-field bg-paper-deep px-3 py-2 text-sm"
              aria-live="polite"
            >
              {creditSettled.value.installments ? (
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-ink">
                    {t('installmentAmount', {
                      date: formatDate(
                        BusinessDate.endInstant(creditSettled.value.installments.rows[0]!.dueDate),
                      ),
                    })}
                  </dt>
                  <dd>
                    <Money
                      amount={creditSettled.value.installments.installmentAmount.toFixed2()}
                      currency="PEN"
                      className="font-semibold whitespace-nowrap text-ink tabular-nums"
                    />
                  </dd>
                </div>
              ) : (
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-ink">{t('paymentDue')}</dt>
                  <dd className="font-semibold text-ink tabular-nums">
                    {formatDate(creditSettled.value.cycle.paymentDueInstant)}
                  </dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-ink-soft">{t('availableAfter')}</dt>
                <dd>
                  <Money
                    amount={creditSettled.value.availableAfter.toFixed2()}
                    currency="PEN"
                    className="whitespace-nowrap text-ink tabular-nums"
                  />
                </dd>
              </div>
            </dl>
          ) : null}
        </fieldset>
      ) : (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-ink">{t('methodLabel')}</legend>
            <div className="grid grid-cols-4 gap-2">
              {CASH_PAYMENT_METHODS.map((value) => (
                <label
                  key={value}
                  className={cn(
                    'flex h-11 cursor-pointer items-center justify-center rounded-field border text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 ease-(--ease-out-expo) select-none active:scale-[0.97] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-link-active motion-reduce:active:scale-100',
                    method === value
                      ? 'border-link-active bg-soft text-soft-ink'
                      : 'border-line bg-surface text-ink hover:bg-surface-hover',
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-payment-method`}
                    value={value}
                    checked={method === value}
                    onChange={() => setMethod(value)}
                    className="sr-only"
                  />
                  {t(`methods.${value}`)}
                </label>
              ))}
            </div>
            <p className="text-[13px] text-ink-soft">{t('methodHint')}</p>
          </fieldset>

          {method === 'CASH' ? (
            <div className="flex flex-col gap-2">
              <label htmlFor={`${id}-received`} className="text-sm font-medium text-ink">
                {t('receivedLabel')}
              </label>
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-soft"
                >
                  S/
                </span>
                <Input
                  id={`${id}-received`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={received}
                  onChange={(e) => {
                    setReceived(e.target.value);
                    setError(null);
                  }}
                  aria-describedby={`${id}-received-hint`}
                  className="pl-10 tabular-nums"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {received !== '' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setReceived('');
                      setError(null);
                    }}
                  >
                    {t('exactAmount')}
                  </Button>
                ) : null}
                {BILLS.filter((bill) => MoneyValue.of(bill, 'PEN').compare(total) >= 0)
                  .slice(0, 3)
                  .map((bill) => (
                    <Button
                      key={bill}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setReceived(bill);
                        setError(null);
                      }}
                      className={cn(
                        'tabular-nums',
                        received === bill ? 'border-link-active bg-soft text-soft-ink' : '',
                      )}
                    >
                      {formatMoney(bill, 'PEN')}
                    </Button>
                  ))}
              </div>
              <p id={`${id}-received-hint`} className="text-[13px] text-ink-soft">
                {t('receivedHint')}
              </p>
              {payment?.ok && payment.value.changeGiven ? (
                <p
                  className="flex items-baseline justify-between rounded-field bg-paper-deep px-3 py-2"
                  aria-live="polite"
                >
                  <span className="text-sm text-ink">{t('change')}</span>
                  <Money
                    amount={payment.value.changeGiven.toFixed2()}
                    currency="PEN"
                    className="text-lg font-semibold text-ink tabular-nums"
                  />
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {shownError && cart.length > 0 ? (
        <Notice tone="error">
          <p>{errorText(shownError)}</p>
        </Notice>
      ) : null}

      <Button type="button" size="lg" className="w-full" disabled={!ready} onClick={confirm}>
        {actionLabel()}
      </Button>
    </div>
  );

  function actionLabel() {
    const amount = formatMoney(total.toFixed2(), 'PEN');
    return credit ? t('chargeCredit', { total: amount }) : t('charge', { total: amount });
  }

  const filterPills: { key: CatalogFilter; label: string; count: number }[] = [
    { key: 'all', label: t('filters.all'), count: products.length },
    ...(topCount > 0 ? [{ key: 'top' as const, label: t('filters.top'), count: topCount }] : []),
    ...(cart.length > 0
      ? [{ key: 'inCart' as const, label: t('filters.inCart'), count: cart.length }]
      : []),
    ...(installmentsCount > 0
      ? [
          {
            key: 'installments' as const,
            label: t('filters.installments'),
            count: installmentsCount,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      {heading || todaySummary ? (
        <div className="flex flex-wrap items-start justify-between gap-4">
          {heading}
          {todaySummary ? (
            <TodaySalesSheet summary={todaySummary} onRepeatSale={repeatSale} />
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
        <section
          aria-label={t('productsLabel')}
          className={cn('flex flex-col gap-4', cart.length > 0 || undoState ? 'pb-20 lg:pb-0' : '')}
        >
          <CustomerPicker
            customers={customers}
            value={customer}
            onChange={chooseCustomer}
            detail={customerDetail}
            creditUsage={creditUsage}
            canCreateCustomer={canCreateCustomer}
          />

          <div className="flex flex-col gap-2">
            <div className="relative">
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-3.5 my-auto size-5 text-ink-soft"
              />
              <label htmlFor="sale-search" className="sr-only">
                {t('searchLabel')}
              </label>
              <Input
                id="sale-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const term = query.trim().toLowerCase();
                  if (!term) return;
                  const exactBarcode = products.find(
                    (p) => p.barcode && p.barcode.toLowerCase() === term,
                  );
                  const candidate = exactBarcode ?? (visible.length === 1 ? visible[0] : undefined);
                  if (candidate && canAddOne(candidate)) {
                    e.preventDefault();
                    add(candidate);
                    if (exactBarcode) setQuery('');
                  }
                }}
                placeholder={t('searchPlaceholder')}
                aria-describedby="sale-search-hint"
                autoComplete="off"
                className={cn('pl-11', query ? 'pr-11' : '')}
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t('clearSearch')}
                  className="absolute inset-y-0 right-0 flex size-11 items-center justify-center rounded-full text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-link-active"
                >
                  <XIcon aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </div>
            <p id="sale-search-hint" className="text-[13px] text-ink-soft">
              {t('scanHint')}
            </p>
          </div>

          {filterPills.length > 1 ? (
            <div
              role="group"
              aria-label={t('filters.label')}
              className="-mx-1 flex [scrollbar-width:none] items-center gap-1.5 overflow-x-auto px-1 py-0.5 [&::-webkit-scrollbar]:hidden"
            >
              {filterPills.map((pill) => {
                const isActive = activeFilter === pill.key;
                return (
                  <button
                    key={pill.key}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setFilter(pill.key)}
                    className={cn(
                      'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 ease-(--ease-out-expo) select-none active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100',
                      isActive
                        ? 'border-link-active bg-soft text-soft-ink'
                        : 'border-line bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
                    )}
                  >
                    <span>{pill.label}</span>
                    <span
                      className={cn(
                        'py-0.2 rounded-full px-1.5 text-xs font-semibold tabular-nums',
                        isActive ? 'bg-surface/80 text-soft-ink' : 'bg-paper-deep text-ink-soft',
                      )}
                    >
                      {pill.count}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-paper-deep text-ink-soft">
                <PackageIcon aria-hidden="true" className="size-6" />
              </span>
              <p className="text-sm text-ink-soft">
                {products.length === 0 ? t('noProducts') : t('noResults', { query })}
              </p>
              {products.length === 0 && canManageCatalog ? (
                <Link href="/inventory/new" className={buttonVariants({ variant: 'secondary' })}>
                  <PackagePlusIcon aria-hidden="true" />
                  {t('goToInventory')}
                </Link>
              ) : query || activeFilter !== 'all' ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                  }}
                >
                  {t('clearSearch')}
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
              {visible.map((item) => {
                const out = !item.isService && Quantity.isZero(item.currentStock);
                const status = productStatus(item);
                const quantity = inCart(item.id);
                return (
                  <li key={item.id} className="relative">
                    <button
                      type="button"
                      onClick={() => add(item)}
                      disabled={!canAddOne(item)}
                      className={cn(
                        'relative flex h-full min-h-30 w-full flex-col gap-2 rounded-card border bg-surface p-3 text-left transition-[background-color,border-color,transform] duration-150 ease-(--ease-out-expo) outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:enabled:active:scale-100',
                        quantity
                          ? 'border-link-active bg-soft/30'
                          : 'border-line hover:bg-surface-hover',
                      )}
                    >
                      <span className="flex items-start gap-2.5">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- imagen del bucket público, sin optimizador
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="size-10 shrink-0 rounded-field object-cover"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="flex size-10 shrink-0 items-center justify-center rounded-field bg-paper-deep text-ink-soft"
                          >
                            <PackageIcon className="size-5" />
                          </span>
                        )}
                        <span className="line-clamp-2 text-sm font-medium text-ink">
                          {item.name}
                        </span>
                      </span>
                      <span className={cn('mt-auto flex flex-col gap-0.5', quantity ? 'pr-9' : '')}>
                        <span className="flex flex-wrap items-baseline gap-1.5">
                          {/* US08 crit. 4: en el fiado se ve y se cobra el precio de crédito */}
                          <Money
                            amount={credit ? item.creditPrice : item.cashPrice}
                            currency="PEN"
                            className="text-base font-semibold whitespace-nowrap text-ink tabular-nums"
                          />
                          {item.allowsInstallments ? (
                            <span className="rounded-full bg-paper-deep px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">
                              {t('installmentsBadge')}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-soft tabular-nums">
                          {item.isService
                            ? t('service')
                            : out
                              ? t('outOfStock')
                              : t('left', {
                                  quantity: formatQuantity(item.currentStock),
                                  unit: item.unitCode,
                                })}
                          {status === 'lowStock' ? <ProductStatusBadge status="lowStock" /> : null}
                        </span>
                      </span>
                      {quantity ? (
                        <span className="absolute -top-2 -right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-dark tabular-nums shadow-xs">
                          <span className="sr-only">{t('inCart')} </span>
                          {formatQuantity(safe(quantity))}
                        </span>
                      ) : null}
                    </button>
                    {quantity ? (
                      <button
                        type="button"
                        onClick={() => decrement(item.id)}
                        aria-label={t('decrease', { product: item.name })}
                        className="absolute right-2.5 bottom-2.5 z-10 flex size-8 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-xs transition-[transform,background-color] duration-150 ease-(--ease-out-expo) after:absolute after:-inset-1.5 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active active:scale-[0.94] motion-reduce:transition-none"
                      >
                        <MinusIcon aria-hidden="true" className="size-4" />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Escritorio: el carrito siempre a la vista */}
        <aside
          aria-label={t('cartTitle')}
          className="sticky top-8 hidden rounded-card border border-line bg-surface p-4 lg:block"
        >
          <h2 className="mb-4 text-lg font-semibold text-ink">{t('cartTitle')}</h2>
          {cartPanel('cart')}
        </aside>

        {/* Celular: barra translúcida sobre la navegación inferior; cobrar, fiar o deshacer sin abrir la hoja (D7) */}
        {cart.length > 0 || undoState ? (
          <div className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface/95 px-3.5 py-2.5 shadow-float backdrop-blur lg:hidden">
            {cart.length === 0 && undoState ? (
              <div
                role="status"
                aria-live="polite"
                className="flex w-full items-center justify-between gap-2"
              >
                <span className="truncate text-sm text-ink-soft">{undoState.message}</span>
                <Button type="button" variant="secondary" size="sm" onClick={undo}>
                  <RotateCcwIcon aria-hidden="true" className="size-4" />
                  {t('undo')}
                </Button>
              </div>
            ) : (
              <>
                {/* Sin abrir la hoja, el motivo de un botón desactivado queda a la vista */}
                {shownError && !sheetOpen ? (
                  <p role="status" className="w-full text-[13px] font-medium text-error-ink">
                    {errorText(shownError)}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="shrink-0 px-4 tabular-nums"
                  onClick={() => setSheetOpen(true)}
                >
                  <ShoppingBasketIcon aria-hidden="true" />
                  {t('cartButtonShort', { count: cart.length })}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="min-w-0 flex-1 tabular-nums"
                  disabled={!ready}
                  onClick={confirm}
                >
                  <span className="truncate">{actionLabel()}</span>
                </Button>
              </>
            )}
          </div>
        ) : null}

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="bottom"
            showCloseButton={false}
            // DESIGN.md §8 + apple-design §2: capas en 150–250 ms y arrastre 1:1 con proyección de velocidad
            className="max-h-[90dvh] gap-0 overflow-y-auto overscroll-contain rounded-t-sheet border-line bg-surface px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] ease-(--ease-out-expo) data-[state=closed]:duration-150 data-[state=open]:duration-250 lg:hidden"
            style={{
              transform: dy ? `translateY(${dy}px)` : undefined,
              transition: dy ? 'none' : undefined,
            }}
          >
            <div
              {...dragHandlers}
              className="mb-3 flex shrink-0 cursor-grab touch-none flex-col items-center gap-2 pt-1"
            >
              <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-line" />
              <div className="flex w-full items-center justify-between">
                <SheetTitle className="text-lg font-semibold text-ink">{t('cartTitle')}</SheetTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setSheetOpen(false)}
                >
                  <XIcon aria-hidden="true" />
                  <span className="sr-only">{t('closeCart')}</span>
                </Button>
              </div>
            </div>
            <SheetDescription className="sr-only">{t('cartDescription')}</SheetDescription>
            {cartPanel('sheet')}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

/** Una cantidad a medio teclear ("2," o "") vale como 0 al sumar o restar. */
function safe(quantity: string): string {
  const parsed = Quantity.parse(quantity, { allowDecimals: true, allowZero: true });
  return parsed.ok ? parsed.value : '0';
}
