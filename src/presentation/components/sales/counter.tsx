'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  MinusIcon,
  PackageIcon,
  PlusIcon,
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
import { Money as MoneyValue } from '@/core/domain/shared/money';
import type { ProductListItem } from '@/infrastructure/db/queries/catalog';
import type { CounterCustomer } from '@/infrastructure/db/queries/sales';
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
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/presentation/components/ui/sheet';
import { formatDate } from '@/presentation/lib/format-date';
import { formatQuantity } from '@/presentation/lib/format-quantity';
import { cn } from '@/presentation/lib/utils';
import { CustomerPicker } from './customer-picker';

/** Billetes que suele recibir el mostrador, para un toque en lugar de teclear. */
const BILLS = ['10', '20', '50', '100', '200'];

type CounterError = SaleActionError | CreditSaleActionError;

/** Lo último que la venta optimista cambió en la deuda del vecino (US08 crit. 5). */
type BalanceOverride = { from: string; to: string };

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
}: {
  products: ProductListItem[];
  customers: CounterCustomer[];
}) {
  const t = useTranslations('Sales');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
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
  const [busy, startTransition] = useTransition();

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const saleProducts = useMemo(() => products.map(toSaleProduct), [products]);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.brand ?? '').toLowerCase().includes(term) ||
        p.barcode === term,
    );
  }, [products, query]);

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

  const inCart = (productId: string) => cart.find((l) => l.productId === productId)?.quantity;

  function canAddOne(item: ProductListItem): boolean {
    if (item.isService) return true;
    const current = safe(inCart(item.id) ?? '0');
    return Quantity.compare(Quantity.plus(current, '1'), item.currentStock) <= 0;
  }

  function add(item: ProductListItem) {
    setError(null);
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
    setCart((current) => current.filter((l) => l.productId !== productId));
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
    setReceived('');
    setMethod('CASH');
    setPlan({ mode: 'SINGLE' });
    setSheetOpen(false);
    setError(null);
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
        <div className="grid grid-cols-2 gap-1 rounded-full bg-paper-deep p-1">
          {(['CASH', 'CREDIT'] as const).map((value) => {
            const disabled = value === 'CREDIT' && block !== null;
            return (
              <label
                key={value}
                className={cn(
                  'flex h-11 items-center justify-center rounded-full text-sm font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-link-active',
                  modality === value ? 'bg-surface text-ink shadow-xs' : 'text-ink-soft',
                  disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
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

      {cart.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <ShoppingBasketIcon aria-hidden="true" className="size-8 text-ink-soft" />
          <p className="text-sm text-ink-soft">{t('emptyCart')}</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {cart.map((line) => {
            const item = byId.get(line.productId);
            if (!item) return null;
            const pricedLine = priced?.ok
              ? priced.value.lines.find((l) => l.productId === line.productId)
              : undefined;
            return (
              <li key={line.productId} className="flex flex-col gap-2 py-3 first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-medium text-ink">{item.name}</span>
                  <span className="text-sm font-semibold whitespace-nowrap text-ink">
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
                    className="ml-auto"
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
      )}

      <div className="flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-base font-medium text-ink">
          {credit ? t('totalCredit') : t('total')}
        </span>
        <Money
          amount={total.toFixed2()}
          currency="PEN"
          className="text-2xl font-semibold text-ink"
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
                    'flex h-11 items-center justify-center rounded-field border text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-link-active',
                    plan.mode === mode
                      ? 'border-link-active bg-soft text-soft-ink'
                      : 'border-line bg-surface text-ink hover:bg-surface-hover',
                    disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
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
                className="h-11 rounded-field border border-line bg-surface px-3 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active"
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
                      className="font-semibold whitespace-nowrap text-ink"
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
                    className="whitespace-nowrap text-ink"
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
                    'flex h-11 cursor-pointer items-center justify-center rounded-field border text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-link-active',
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
                {BILLS.filter((bill) => MoneyValue.of(bill, 'PEN').compare(total) >= 0)
                  .slice(0, 3)
                  .map((bill) => (
                    <Button
                      key={bill}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setReceived(bill)}
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
                    className="text-lg font-semibold text-ink"
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

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={busy || !ready}
        onClick={confirm}
      >
        {actionLabel()}
      </Button>
    </div>
  );

  function actionLabel() {
    const amount = formatMoney(total.toFixed2(), 'PEN');
    return credit ? t('chargeCredit', { total: amount }) : t('charge', { total: amount });
  }

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
      <section aria-label={t('productsLabel')} className="flex flex-col gap-4">
        <CustomerPicker
          customers={customers}
          value={customer}
          onChange={chooseCustomer}
          detail={customerDetail}
        />

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
            placeholder={t('searchPlaceholder')}
            autoComplete="off"
            className="pl-11"
          />
        </div>

        {visible.length === 0 ? (
          <p className="rounded-card border border-line bg-surface px-6 py-10 text-center text-sm text-ink-soft">
            {products.length === 0 ? t('noProducts') : t('noResults', { query })}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((item) => {
              const out = !item.isService && Quantity.isZero(item.currentStock);
              const status = productStatus(item);
              const quantity = inCart(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => add(item)}
                    disabled={!canAddOne(item)}
                    className={cn(
                      'relative flex h-full min-h-28 w-full flex-col gap-2 rounded-card border bg-surface p-3 text-left transition-[background-color,border-color,transform] duration-100 ease-out outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60',
                      quantity ? 'border-link-active' : 'border-line hover:bg-surface-hover',
                    )}
                  >
                    <span className="flex items-start gap-2">
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
                      <span className="line-clamp-2 text-sm font-medium text-ink">{item.name}</span>
                    </span>
                    <span className="mt-auto flex flex-col gap-0.5">
                      {/* US08 crit. 4: en el fiado se ve y se cobra el precio de crédito */}
                      <Money
                        amount={credit ? item.creditPrice : item.cashPrice}
                        currency="PEN"
                        className="text-base font-semibold whitespace-nowrap text-ink"
                      />
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
                      <span className="absolute -top-2 -right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-dark tabular-nums">
                        <span className="sr-only">{t('inCart')} </span>
                        {formatQuantity(safe(quantity))}
                      </span>
                    ) : null}
                  </button>
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

      {/* Celular: barra sobre la navegación inferior; cobrar o fiar sin abrir la hoja (D7) */}
      {cart.length > 0 ? (
        <div className="fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] z-30 flex flex-wrap gap-2 border-t border-line bg-surface px-4 py-3 lg:hidden">
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
            className="shrink-0 px-4"
            onClick={() => setSheetOpen(true)}
          >
            <ShoppingBasketIcon aria-hidden="true" />
            {t('cartButtonShort', { count: cart.length })}
          </Button>
          <Button
            type="button"
            size="lg"
            className="min-w-0 flex-1"
            disabled={busy || !ready}
            onClick={confirm}
          >
            <span className="truncate">{actionLabel()}</span>
          </Button>
        </div>
      ) : null}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          // DESIGN.md §8: capas en 150–250 ms, no los 500 ms de la hoja base
          className="max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-sheet border-line bg-surface px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] ease-(--ease-out-expo) data-[state=closed]:duration-150 data-[state=open]:duration-250 lg:hidden"
        >
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold text-ink">{t('cartTitle')}</SheetTitle>
            <Button type="button" variant="ghost" size="icon" onClick={() => setSheetOpen(false)}>
              <XIcon aria-hidden="true" />
              <span className="sr-only">{t('closeCart')}</span>
            </Button>
          </div>
          <SheetDescription className="sr-only">{t('cartDescription')}</SheetDescription>
          {cartPanel('sheet')}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Una cantidad a medio teclear ("2," o "") vale como 0 al sumar o restar. */
function safe(quantity: string): string {
  const parsed = Quantity.parse(quantity, { allowDecimals: true, allowZero: true });
  return parsed.ok ? parsed.value : '0';
}
