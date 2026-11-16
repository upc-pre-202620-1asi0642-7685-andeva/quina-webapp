'use client';

import { useActionState, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LockIcon, PaperclipIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { PURCHASE_DOCUMENT_TYPES, type PurchaseDocumentType } from '@/core/domain/catalog/purchase';
import {
  ATTACHMENT_MIME_TYPES,
  type AttachmentMimeType,
  MAX_ATTACHMENT_BYTES,
} from '@/core/domain/catalog/purchase-attachment';
import type { SupplierOption } from '@/core/domain/ports/purchase-repository';
import {
  registerPurchaseAction,
  type PurchaseField,
  type PurchaseFormState,
} from '@/presentation/actions/purchases';
import { FormField } from '@/presentation/components/auth/form-field';
import { NativeSelect } from '@/presentation/components/forms/native-select';
import { formatMoney } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { Button, buttonVariants } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { SupplierDialog } from './supplier-dialog';

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

function parseLineNumber(raw: string): number | null {
  const value = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

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
  const [selectedAttachment, setSelectedAttachment] = useState<{
    name: string;
    sizeKb: number;
  } | null>(null);
  const [clientErrors, setClientErrors] = useState<Partial<Record<PurchaseField, string>>>({});
  const attachmentRef = useRef<HTMLInputElement | null>(null);

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

  const addLine = () => {
    const usedIds = new Set(lines.map((l) => l.productId));
    const nextProduct = products.find((p) => !usedIds.has(p.id)) ?? products[0];
    setLines((prev) => [
      ...prev,
      {
        key: `line-${Date.now()}-${prev.length}`,
        productId: nextProduct?.id ?? '',
        quantity: '1',
        unitCost:
          nextProduct && Number(nextProduct.currentAverageCost) > 0
            ? nextProduct.currentAverageCost
            : '',
      },
    ]);
    setClientErrors((prev) => ({ ...prev, lines: undefined }));
  };

  const removeLine = (key: string) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
    setClientErrors((prev) => ({ ...prev, lines: undefined }));
  };

  const updateLine = (key: string, patch: Partial<LineState>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setClientErrors((prev) => ({ ...prev, lines: undefined }));
  };

  const totalEstimate = lines.reduce((acc, line) => {
    const q = parseLineNumber(line.quantity);
    const c = parseLineNumber(line.unitCost);
    if (q !== null && c !== null && q > 0 && c >= 0) {
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

  const errors = { ...state.errors, ...clientErrors };
  const fieldError = (field: PurchaseField) =>
    errors[field] ? t(`errors.${errors[field]}`) : undefined;

  function handleAttachmentChange(event: React.ChangeEvent<HTMLInputElement>) {
    setClientErrors((prev) => ({ ...prev, attachment: undefined }));
    const file = event.target.files?.[0];
    if (!file) {
      setSelectedAttachment(null);
      return;
    }
    if (!ATTACHMENT_MIME_TYPES.includes(file.type as AttachmentMimeType)) {
      setClientErrors((prev) => ({ ...prev, attachment: 'attachmentType' }));
      setSelectedAttachment(null);
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setClientErrors((prev) => ({ ...prev, attachment: 'attachmentTooLarge' }));
      setSelectedAttachment(null);
      return;
    }
    setSelectedAttachment({
      name: file.name,
      sizeKb: Math.max(1, Math.round(file.size / 1024)),
    });
  }

  function clearAttachment() {
    if (attachmentRef.current) attachmentRef.current.value = '';
    setSelectedAttachment(null);
    setClientErrors((prev) => ({ ...prev, attachment: undefined }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const next: Partial<Record<PurchaseField, string>> = {};
    if (!supplierId.trim()) next.supplierId = 'supplierRequired';
    if (!documentNumber.trim()) next.documentNumber = 'documentNumberInvalid';
    if (!issueDate.trim()) next.issueDate = 'issueDateInvalid';

    const seenProducts = new Set<string>();
    for (const line of lines) {
      if (!line.productId) {
        next.lines = 'productInvalid';
        break;
      }
      if (seenProducts.has(line.productId)) {
        next.lines = 'duplicateProduct';
        break;
      }
      seenProducts.add(line.productId);
      const q = parseLineNumber(line.quantity);
      const c = parseLineNumber(line.unitCost);
      if (q === null || q <= 0) {
        next.lines = 'quantityInvalid';
        break;
      }
      if (c === null || c <= 0) {
        next.lines = 'unitCostInvalid';
        break;
      }
    }

    const file = attachmentRef.current?.files?.[0];
    if (file && !ATTACHMENT_MIME_TYPES.includes(file.type as AttachmentMimeType)) {
      next.attachment = 'attachmentType';
    } else if (file && file.size > MAX_ATTACHMENT_BYTES) {
      next.attachment = 'attachmentTooLarge';
    }

    setClientErrors(next);
    if (Object.keys(next).length > 0) event.preventDefault();
  }

  return (
    <>
      <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-6">
        {initialOrder ? (
          <input type="hidden" name="purchaseOrderId" value={initialOrder.id} />
        ) : null}
        <input type="hidden" name="linesJson" value={linesJson} />

        {errors.form ? (
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
                <NativeSelect
                  {...props}
                  name="supplierId"
                  value={supplierId}
                  onChange={(e) => {
                    setSupplierId(e.target.value);
                    setClientErrors((prev) => ({ ...prev, supplierId: undefined }));
                  }}
                  required
                >
                  <option value="">{t('supplierNone')}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.tradeName} ({s.taxIdNumber})
                    </option>
                  ))}
                </NativeSelect>
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
                <NativeSelect
                  {...props}
                  name="documentType"
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value as PurchaseDocumentType)}
                >
                  {PURCHASE_DOCUMENT_TYPES.map((dt) => (
                    <option key={dt} value={dt}>
                      {tDocs(dt)}
                    </option>
                  ))}
                </NativeSelect>
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
                    onChange={(e) => {
                      setDocumentNumber(e.target.value);
                      setClientErrors((prev) => ({ ...prev, documentNumber: undefined }));
                    }}
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
              const q = parseLineNumber(line.quantity);
              const c = parseLineNumber(line.unitCost);
              const lineSubtotal =
                q !== null && c !== null && q > 0 && c > 0 ? (q * c).toFixed(2) : null;
              const otherSelectedIds = new Set(
                lines.filter((l) => l.key !== line.key).map((l) => l.productId),
              );

              return (
                <div
                  key={line.key}
                  className="flex flex-col gap-3 rounded-field border border-line bg-paper p-3.5"
                >
                  <div className="grid gap-3 sm:grid-cols-[1fr_120px_140px_auto] sm:items-end">
                    <FormField
                      id={`line-product-${index}`}
                      label={t('productLabel')}
                      hint={t('productHint')}
                    >
                      {(props) => (
                        <NativeSelect
                          {...props}
                          value={line.productId}
                          onChange={(e) => updateLine(line.key, { productId: e.target.value })}
                          required
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id} disabled={otherSelectedIds.has(p.id)}>
                              {p.name} ({p.unitCode})
                            </option>
                          ))}
                        </NativeSelect>
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

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-2 text-xs text-ink-soft tabular-nums">
                    <span>
                      {selectedProduct && Number(selectedProduct.currentAverageCost) > 0
                        ? t('currentAvgCostRef', {
                            cost: `S/ ${selectedProduct.currentAverageCost}`,
                          })
                        : t('noAvgCostYet')}
                    </span>
                    <span className="font-medium text-ink">
                      {t('lineSubtotalLabel')}:{' '}
                      {lineSubtotal ? formatMoney(lineSubtotal, 'PEN') : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
            <span className="text-sm text-ink-soft">{t('estimatedTotal')}:</span>
            <span className="text-lg font-semibold text-ink tabular-nums">
              {formatMoney(totalEstimate.toFixed(2), 'PEN')}
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
            <div className="flex flex-col gap-3">
              <FormField
                id="purchase-receipt"
                label={t('receiptLabel')}
                hint={t('receiptHint')}
                error={fieldError('attachment')}
              >
                {(props) => (
                  <input
                    {...props}
                    ref={attachmentRef}
                    type="file"
                    name="attachments"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleAttachmentChange}
                    className="block w-full text-sm text-ink file:mr-4 file:rounded-full file:border-0 file:bg-paper-deep file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-surface-hover"
                  />
                )}
              </FormField>
              {selectedAttachment ? (
                <div className="flex items-center justify-between gap-3 rounded-field bg-paper-deep px-3.5 py-2 text-xs text-ink">
                  <span className="truncate font-medium">
                    {selectedAttachment.name} ({selectedAttachment.sizeKb} KB)
                  </span>
                  <button
                    type="button"
                    onClick={clearAttachment}
                    aria-label={t('clearReceipt')}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-surface-hover hover:text-ink"
                  >
                    <XIcon aria-hidden="true" className="size-4" />
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-field bg-paper-deep p-3 text-sm text-ink-soft">
              <span className="flex items-center gap-2">
                <LockIcon aria-hidden="true" className="size-4 shrink-0" />
                {t('receiptLocked')}
              </span>
              <Link
                href="/settings/subscription"
                className="font-semibold text-link-active underline underline-offset-4"
              >
                {tPlans('seePlans')}
              </Link>
            </div>
          )}
        </section>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link href="/inventory/purchases" className={buttonVariants({ variant: 'secondary' })}>
            {t('cancel')}
          </Link>
          <Button type="submit" disabled={pending || products.length === 0}>
            {pending ? t('submitting') : t('submit')}
          </Button>
        </div>
      </form>

      <SupplierDialog
        open={supplierDialogOpen}
        onOpenChange={setSupplierDialogOpen}
        onCreated={(supplier) => {
          setSuppliers((prev) => [...prev, supplier]);
          setSupplierId(supplier.id);
          setClientErrors((prev) => ({ ...prev, supplierId: undefined }));
        }}
      />
    </>
  );
}
