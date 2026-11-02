'use client';

import { useActionState, useState, useTransition } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { sileo } from 'sileo';
import { LockIcon, PaperclipIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { PURCHASE_DOCUMENT_TYPES, type PurchaseDocumentType } from '@/core/domain/catalog/purchase';
import type { SupplierOption } from '@/core/domain/ports/purchase-repository';
import {
  createSupplierAction,
  registerPurchaseAction,
  type PurchaseField,
  type PurchaseFormState,
} from '@/presentation/actions/purchases';
import { FormField } from '@/presentation/components/auth/form-field';
import { Notice } from '@/presentation/components/notice';
import { Button, buttonVariants } from '@/presentation/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/presentation/components/ui/dialog';
import { Input } from '@/presentation/components/ui/input';

export type PurchaseFormProduct = {
  id: string;
  name: string;
  unitCode: string;
  currentAverageCost: string;
};

export type PurchaseFormOrder = {
  id: string;
  supplierId: string | null;
  items: {
    productId: string;
    suggestedQuantity: string;
    unitCost: string | null;
  }[];
};

type LineState = {
  key: string;
  productId: string;
  quantity: string;
  unitCost: string;
};

export function PurchaseForm({
  suppliers: initialSuppliers,
  products,
  initialOrder,
  canAttachReceipt,
  defaultDate,
}: {
  suppliers: SupplierOption[];
  products: PurchaseFormProduct[];
  initialOrder: PurchaseFormOrder | null;
  canAttachReceipt: boolean;
  defaultDate: string;
}) {
  const t = useTranslations('Purchases.form');
  const tDocs = useTranslations('Purchases.docTypes');
  const tPlans = useTranslations('Plans');

  const [state, formAction, pending] = useActionState<PurchaseFormState, FormData>(
    registerPurchaseAction,
    {},
  );

  const [suppliers, setSuppliers] = useState<SupplierOption[]>(initialSuppliers);
  const [supplierId, setSupplierId] = useState<string>(
    initialOrder?.supplierId ?? initialSuppliers[0]?.id ?? '',
  );
  const [documentType, setDocumentType] = useState<PurchaseDocumentType>('BOLETA');
  const [series, setSeries] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issueDate, setIssueDate] = useState(defaultDate);
  const [notes, setNotes] = useState('');

  const [lines, setLines] = useState<LineState[]>(() => {
    if (initialOrder && initialOrder.items.length > 0) {
      return initialOrder.items.map((item, idx) => {
        const prod = products.find((p) => p.id === item.productId);
        const fallbackCost =
          item.unitCost && Number(item.unitCost) > 0
            ? item.unitCost
            : prod && Number(prod.currentAverageCost) > 0
              ? prod.currentAverageCost
              : '';
        return {
          key: `init-${idx}`,
          productId: item.productId,
          quantity: item.suggestedQuantity,
          unitCost: fallbackCost,
        };
      });
    }
    return [
      {
        key: 'line-0',
        productId: products[0]?.id ?? '',
        quantity: '1',
        unitCost: '',
      },
    ];
  });

  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [supplierBusy, startSupplierTransition] = useTransition();
  const [newTradeName, setNewTradeName] = useState('');
  const [newTaxId, setNewTaxId] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [supplierError, setSupplierError] = useState<string | null>(null);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        key: `line-${Date.now()}-${prev.length}`,
        productId: products[0]?.id ?? '',
        quantity: '1',
        unitCost: '',
      },
    ]);
  };

  const removeLine = (key: string) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  };

  const updateLine = (key: string, patch: Partial<LineState>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const totalEstimate = lines.reduce((acc, line) => {
    const q = Number(line.quantity.replace(',', '.'));
    const c = Number(line.unitCost.replace(',', '.'));
    if (Number.isFinite(q) && Number.isFinite(c) && q > 0 && c >= 0) {
      return acc + q * c;
    }
    return acc;
  }, 0);

  const linesJson = JSON.stringify(
    lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity.trim(),
      unitCost: l.unitCost.trim(),
    })),
  );

  const fieldError = (field: PurchaseField) =>
    state.errors?.[field] ? t(`errors.${state.errors[field]}`) : undefined;

  const handleCreateSupplier = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSupplierError(null);
    startSupplierTransition(async () => {
      const result = await createSupplierAction({
        taxIdNumber: newTaxId.trim(),
        tradeName: newTradeName.trim(),
        phone: newPhone.trim() || undefined,
      });
      if (!result.ok) {
        setSupplierError(t(`supplierErrors.${result.error}`));
        return;
      }
      setSuppliers((prev) => [
        ...prev,
        {
          id: result.supplierId,
          tradeName: newTradeName.trim(),
          taxIdNumber: newTaxId.trim(),
          contactName: null,
          phone: newPhone.trim() || null,
          email: null,
          isActive: true,
        },
      ]);
      setSupplierId(result.supplierId);
      setNewTradeName('');
      setNewTaxId('');
      setNewPhone('');
      setSupplierDialogOpen(false);
      sileo.success({ title: t('supplierCreatedToast') });
    });
  };

  return (
    <>
      <form action={formAction} className="flex flex-col gap-6">
        {initialOrder ? (
          <input type="hidden" name="purchaseOrderId" value={initialOrder.id} />
        ) : null}
        <input type="hidden" name="linesJson" value={linesJson} />

        {state.errors?.form ? (
          <Notice tone="error">
            <p>{fieldError('form')}</p>
          </Notice>
        ) : null}

        <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink">{t('documentSection')}</h2>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSupplierDialogOpen(true)}
            >
              <PlusIcon aria-hidden="true" />
              {t('newSupplierButton')}
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="purchase-supplier"
              label={t('supplierLabel')}
              hint={t('supplierHint')}
              error={fieldError('supplierId')}
            >
              {(props) => (
                <select
                  {...props}
                  name="supplierId"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  required
                  className="h-11 w-full rounded-field border border-line bg-surface px-3.5 text-base text-ink focus-visible:outline-2 focus-visible:outline-link-active"
                >
                  <option value="">{t('supplierNone')}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.tradeName} ({s.taxIdNumber})
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField
              id="purchase-date"
              label={t('dateLabel')}
              hint={t('dateHint')}
              error={fieldError('issueDate')}
            >
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  name="issueDate"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  required
                />
              )}
            </FormField>

            <FormField
              id="purchase-doc-type"
              label={t('docTypeLabel')}
              hint={t('docTypeHint')}
              error={fieldError('documentType')}
            >
              {(props) => (
                <select
                  {...props}
                  name="documentType"
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value as PurchaseDocumentType)}
                  className="h-11 w-full rounded-field border border-line bg-surface px-3.5 text-base text-ink focus-visible:outline-2 focus-visible:outline-link-active"
                >
                  {PURCHASE_DOCUMENT_TYPES.map((dt) => (
                    <option key={dt} value={dt}>
                      {tDocs(dt)}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                id="purchase-series"
                label={t('seriesLabel')}
                hint={t('seriesHint')}
                error={fieldError('series')}
              >
                {(props) => (
                  <Input
                    {...props}
                    name="series"
                    value={series}
                    onChange={(e) => setSeries(e.target.value)}
                    placeholder="F001"
                    maxLength={10}
                  />
                )}
              </FormField>
              <FormField
                id="purchase-number"
                label={t('numberLabel')}
                hint={t('numberHint')}
                error={fieldError('documentNumber')}
              >
                {(props) => (
                  <Input
                    {...props}
                    name="documentNumber"
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    placeholder="000123"
                    required
                    maxLength={20}
                  />
                )}
              </FormField>
            </div>
          </div>

          <FormField id="purchase-notes" label={t('notesLabel')} hint={t('notesHint')}>
            {(props) => (
              <Input
                {...props}
                name="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
              />
            )}
          </FormField>
        </section>

        {/* Líneas de productos (US15, US16) */}
        <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink">{t('itemsSection')}</h2>
            <Button type="button" variant="secondary" size="sm" onClick={addLine}>
              <PlusIcon aria-hidden="true" />
              {t('addLineButton')}
            </Button>
          </div>

          {fieldError('lines') ? (
            <Notice tone="error">
              <p>{fieldError('lines')}</p>
            </Notice>
          ) : null}

          <div className="flex flex-col gap-3">
            {lines.map((line, index) => {
              const selectedProduct = products.find((p) => p.id === line.productId);
              return (
                <div
                  key={line.key}
                  className="grid gap-3 rounded-field border border-line bg-paper p-3 sm:grid-cols-[1fr_130px_150px_auto] sm:items-end"
                >
                  <FormField
                    id={`line-product-${index}`}
                    label={t('productLabel')}
                    hint={t('productHint')}
                  >
                    {(props) => (
                      <select
                        {...props}
                        value={line.productId}
                        onChange={(e) => updateLine(line.key, { productId: e.target.value })}
                        required
                        className="h-11 w-full rounded-field border border-line bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-link-active"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.unitCode})
                          </option>
                        ))}
                      </select>
                    )}
                  </FormField>

                  <FormField
                    id={`line-qty-${index}`}
                    label={`${t('quantityLabel')} (${selectedProduct?.unitCode ?? 'UND'})`}
                    hint={t('quantityHint')}
                  >
                    {(props) => (
                      <Input
                        {...props}
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        required
                        className="tabular-nums"
                      />
                    )}
                  </FormField>

                  <FormField
                    id={`line-cost-${index}`}
                    label={t('unitCostLabel')}
                    hint={t('unitCostHint')}
                  >
                    {(props) => (
                      <Input
                        {...props}
                        inputMode="decimal"
                        placeholder="0.00"
                        value={line.unitCost}
                        onChange={(e) => updateLine(line.key, { unitCost: e.target.value })}
                        required
                        className="tabular-nums"
                      />
                    )}
                  </FormField>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={lines.length <= 1}
                    onClick={() => removeLine(line.key)}
                    aria-label={t('removeLineAria')}
                    className="text-error-ink hover:bg-error/12 hover:text-error-ink"
                  >
                    <Trash2Icon aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
            <span className="text-sm text-ink-soft">{t('estimatedTotal')}:</span>
            <span className="text-lg font-semibold text-ink tabular-nums">
              S/ {totalEstimate.toFixed(2)}
            </span>
          </div>
        </section>

        {/* Comprobante adjunto (US15 crit. 3, 4 y 6) */}
        <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <PaperclipIcon aria-hidden="true" className="size-5 text-ink-soft" />
            <h2 className="text-lg font-semibold text-ink">{t('receiptSection')}</h2>
          </div>

          {canAttachReceipt ? (
            <FormField
              id="purchase-receipt"
              label={t('receiptLabel')}
              hint={t('receiptHint')}
              error={fieldError('attachment')}
            >
              {(props) => (
                <input
                  {...props}
                  type="file"
                  name="attachments"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="block w-full text-sm text-ink file:mr-4 file:rounded-full file:border-0 file:bg-paper-deep file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-surface-hover"
                />
              )}
            </FormField>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-field bg-paper-deep p-3 text-sm text-ink-soft">
              <span className="flex items-center gap-2">
                <LockIcon aria-hidden="true" className="size-4 shrink-0" />
                {t('receiptLocked')}
              </span>
              <Link
                href="/settings#plans"
                className="font-semibold text-link-active underline underline-offset-4"
              >
                {tPlans('seePlans')}
              </Link>
            </div>
          )}
        </section>

        <div className="flex items-center justify-end gap-3">
          <Link href="/inventory/purchases" className={buttonVariants({ variant: 'secondary' })}>
            {t('cancel')}
          </Link>
          <Button type="submit" disabled={pending || products.length === 0}>
            {pending ? t('submitting') : t('submit')}
          </Button>
        </div>
      </form>

      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent className="rounded-card border-line bg-surface">
          <DialogTitle className="text-lg text-ink">{t('newSupplierTitle')}</DialogTitle>
          <DialogDescription className="text-sm text-ink-soft">
            {t('newSupplierDescription')}
          </DialogDescription>
          <form onSubmit={handleCreateSupplier} className="flex flex-col gap-4">
            {supplierError ? (
              <Notice tone="error">
                <p>{supplierError}</p>
              </Notice>
            ) : null}
            <FormField
              id="supplier-business-name"
              label={t('supplierBusinessName')}
              hint={t('supplierBusinessHint')}
            >
              {(props) => (
                <Input
                  {...props}
                  value={newTradeName}
                  onChange={(e) => setNewTradeName(e.target.value)}
                  required
                  maxLength={200}
                />
              )}
            </FormField>
            <FormField
              id="supplier-tax-id"
              label={t('supplierTaxId')}
              hint={t('supplierTaxIdHint')}
            >
              {(props) => (
                <Input
                  {...props}
                  value={newTaxId}
                  onChange={(e) => setNewTaxId(e.target.value)}
                  inputMode="numeric"
                  placeholder="20123456789"
                  required
                  maxLength={11}
                />
              )}
            </FormField>
            <FormField id="supplier-phone" label={t('supplierPhone')} hint={t('supplierPhoneHint')}>
              {(props) => (
                <Input
                  {...props}
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  inputMode="tel"
                  maxLength={20}
                />
              )}
            </FormField>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSupplierDialogOpen(false)}
                disabled={supplierBusy}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={supplierBusy}>
                {supplierBusy ? t('savingSupplier') : t('saveSupplier')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
