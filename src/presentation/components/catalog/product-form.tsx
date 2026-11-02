'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { parseProductDetails } from '@/core/domain/catalog/product-details';
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/core/domain/catalog/product-image';
import { ProductPrices } from '@/core/domain/catalog/product-prices';
import { Quantity } from '@/core/domain/catalog/quantity';
import type { Unit } from '@/core/domain/ports/product-repository';
import type { SupplierOption } from '@/core/domain/ports/purchase-repository';
import type { ProductFormState } from '@/presentation/actions/catalog';
import { FormField } from '@/presentation/components/auth/form-field';
import { NativeSelect } from '@/presentation/components/forms/native-select';
import { Notice } from '@/presentation/components/notice';
import { Button, buttonVariants } from '@/presentation/components/ui/button';
import { Checkbox } from '@/presentation/components/ui/checkbox';
import { Input } from '@/presentation/components/ui/input';
import { Textarea } from '@/presentation/components/ui/textarea';
import { productError, type ProductField } from '@/presentation/validation/product-form';

export type ProductFormValues = {
  name: string;
  description: string;
  brand: string;
  sku: string;
  barcode: string;
  unitId: string;
  defaultSupplierId?: string;
  isService: boolean;
  allowsInstallments: boolean;
  cashPrice: string;
  creditPrice: string;
  minimumStock: string;
  initialStock: string;
  imageUrl: string | null;
};

type Action = (state: ProductFormState, formData: FormData) => Promise<ProductFormState>;

export function ProductForm({
  mode,
  action,
  units,
  suppliers = [],
  initial,
  cancelHref,
}: {
  mode: 'new' | 'edit';
  action: Action;
  units: Unit[];
  suppliers?: SupplierOption[];
  initial: ProductFormValues;
  cancelHref: string;
}) {
  const t = useTranslations('Inventory.form');
  const tPlans = useTranslations('Plans');
  const [state, formAction, pending] = useActionState(action, {});
  const [values, setValues] = useState(initial);
  const [removeImage, setRemoveImage] = useState(false);
  const [clientErrors, setClientErrors] = useState<Partial<Record<ProductField, string>>>({});

  const errors = { ...state.errors, ...clientErrors };
  const error = (field: ProductField) => (errors[field] ? t(`errors.${errors[field]}`) : undefined);
  const set = <K extends keyof ProductFormValues>(field: K, value: ProductFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setClientErrors((current) => ({ ...current, [field]: undefined }));
  };
  const unit = units.find((u) => u.id === values.unitId);
  const priceChanged =
    mode === 'edit' &&
    (values.cashPrice !== initial.cashPrice || values.creditPrice !== initial.creditPrice);

  // Misma validación que el servidor (DESIGN.md §7.2): se adelanta el primer error
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const next: Partial<Record<ProductField, string>> = {};
    const details = parseProductDetails(values);
    const prices = ProductPrices.parse(values.cashPrice, values.creditPrice);
    if (!details.ok) {
      const [field, key] = productError(details.error);
      next[field] = key;
    } else if (!prices.ok) {
      const [field, key] = productError(prices.error);
      next[field] = key;
    }
    const allowDecimals = unit?.allowDecimals ?? false;
    if (!values.isService) {
      for (const field of ['initialStock', 'minimumStock'] as const) {
        if (mode === 'edit' && field === 'initialStock') continue;
        if (!values[field].trim()) continue;
        const parsed = Quantity.parse(values[field], { allowDecimals, allowZero: true });
        if (!parsed.ok) {
          next[field] =
            parsed.error === 'QUANTITY_NOT_WHOLE' ? 'quantityNotWhole' : 'quantityInvalid';
        }
      }
    }
    const file = (event.currentTarget.elements.namedItem('image') as HTMLInputElement | null)
      ?.files?.[0];
    if (file && !IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) {
      next.image = 'imageType';
    } else if (file && file.size > MAX_IMAGE_BYTES) {
      next.image = 'imageTooLarge';
    }
    setClientErrors(next);
    if (Object.keys(next).length > 0) event.preventDefault();
  }

  const moneyInput = (field: 'cashPrice' | 'creditPrice') => (
    <FormField
      id={`product-${field}`}
      label={t(`${field}Label`)}
      hint={t(`${field}Hint`)}
      error={error(field)}
    >
      {(props) => (
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-soft"
          >
            S/
          </span>
          <Input
            {...props}
            name={field}
            inputMode="decimal"
            autoComplete="off"
            required
            value={values[field]}
            onChange={(e) => set(field, e.target.value)}
            className="pl-10 tabular-nums"
          />
        </div>
      )}
    </FormField>
  );

  const quantityInput = (field: 'initialStock' | 'minimumStock') => (
    <FormField
      id={`product-${field}`}
      label={t(`${field}Label`)}
      hint={t(`${field}Hint`)}
      error={error(field)}
    >
      {(props) => (
        <div className="relative">
          <Input
            {...props}
            name={field}
            inputMode={unit?.allowDecimals ? 'decimal' : 'numeric'}
            autoComplete="off"
            value={values[field]}
            onChange={(e) => set(field, e.target.value)}
            className="pr-14 tabular-nums"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-ink-soft"
          >
            {unit?.code}
          </span>
        </div>
      )}
    </FormField>
  );

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {errors.form ? (
        <Notice tone={errors.form === 'planLimit' ? 'warning' : 'error'}>
          <p>{t(`errors.${errors.form}`)}</p>
          {errors.form === 'planLimit' ? (
            <Link href="/settings" className="font-semibold underline underline-offset-4">
              {tPlans('seePlans')}
            </Link>
          ) : null}
        </Notice>
      ) : null}

      <fieldset className="flex flex-col gap-4 rounded-card border border-line p-4">
        <legend className="px-1 text-base font-semibold text-ink">{t('basicsTitle')}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField
              id="product-name"
              label={t('nameLabel')}
              hint={t('nameHint')}
              error={error('name')}
            >
              {(props) => (
                <Input
                  {...props}
                  name="name"
                  autoComplete="off"
                  required
                  value={values.name}
                  onChange={(e) => set('name', e.target.value)}
                />
              )}
            </FormField>
          </div>
          <FormField
            id="product-brand"
            label={t('brandLabel')}
            hint={t('brandHint')}
            error={error('brand')}
          >
            {(props) => (
              <Input
                {...props}
                name="brand"
                autoComplete="off"
                value={values.brand}
                onChange={(e) => set('brand', e.target.value)}
              />
            )}
          </FormField>
          <FormField
            id="product-unit"
            label={t('unitLabel')}
            hint={t('unitHint')}
            error={error('unitId')}
          >
            {(props) => (
              <NativeSelect
                {...props}
                name="unitId"
                value={values.unitId}
                onChange={(e) => set('unitId', e.target.value)}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} · {u.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            id="product-barcode"
            label={t('barcodeLabel')}
            hint={t('barcodeHint')}
            error={error('barcode')}
          >
            {(props) => (
              <Input
                {...props}
                name="barcode"
                inputMode="numeric"
                autoComplete="off"
                value={values.barcode}
                onChange={(e) => set('barcode', e.target.value)}
                className="tabular-nums"
              />
            )}
          </FormField>
          <FormField
            id="product-sku"
            label={t('skuLabel')}
            hint={t('skuHint')}
            error={error('sku')}
          >
            {(props) => (
              <Input
                {...props}
                name="sku"
                autoComplete="off"
                autoCapitalize="characters"
                value={values.sku}
                onChange={(e) => set('sku', e.target.value)}
              />
            )}
          </FormField>
          {!values.isService ? (
            <div className="sm:col-span-2">
              <FormField
                id="product-supplier"
                label={t('defaultSupplierLabel')}
                hint={t('defaultSupplierHint')}
                error={error('defaultSupplierId')}
              >
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="defaultSupplierId"
                    value={values.defaultSupplierId ?? ''}
                    onChange={(e) => set('defaultSupplierId', e.target.value)}
                  >
                    <option value="">{t('defaultSupplierNone')}</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.tradeName} · {s.taxIdNumber}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <FormField
              id="product-description"
              label={t('descriptionLabel')}
              hint={t('descriptionHint')}
            >
              {(props) => (
                <Textarea
                  {...props}
                  name="description"
                  rows={2}
                  value={values.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              )}
            </FormField>
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-card border border-line p-4">
        <legend className="px-1 text-base font-semibold text-ink">{t('kindTitle')}</legend>
        <CheckField
          id="product-service"
          name="isService"
          label={t('serviceLabel')}
          hint={t('serviceHint')}
          error={error('isService')}
          checked={values.isService}
          onChange={(checked) => set('isService', checked)}
        />
        <CheckField
          id="product-installments"
          name="allowsInstallments"
          label={t('installmentsLabel')}
          hint={t('installmentsHint')}
          checked={values.allowsInstallments}
          onChange={(checked) => set('allowsInstallments', checked)}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-card border border-line p-4">
        <legend className="px-1 text-base font-semibold text-ink">{t('pricesTitle')}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {moneyInput('cashPrice')}
          {moneyInput('creditPrice')}
          {priceChanged ? (
            <div className="sm:col-span-2">
              <FormField
                id="product-price-reason"
                label={t('priceReasonLabel')}
                hint={t('priceReasonHint')}
              >
                {(props) => <Input {...props} name="priceReason" autoComplete="off" />}
              </FormField>
            </div>
          ) : null}
        </div>
      </fieldset>

      {values.isService ? null : (
        <fieldset className="flex flex-col gap-4 rounded-card border border-line p-4">
          <legend className="px-1 text-base font-semibold text-ink">{t('stockTitle')}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === 'new' ? quantityInput('initialStock') : null}
            {quantityInput('minimumStock')}
          </div>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-4 rounded-card border border-line p-4">
        <legend className="px-1 text-base font-semibold text-ink">{t('imageTitle')}</legend>
        {initial.imageUrl && !removeImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagen del bucket público, sin optimizador
          <img
            src={initial.imageUrl}
            alt={t('currentImageAlt', { name: initial.name })}
            className="size-24 rounded-field border border-line object-cover"
          />
        ) : null}
        <FormField
          id="product-image"
          label={t('imageLabel')}
          hint={t('imageHint')}
          error={error('image')}
        >
          {(props) => (
            <Input
              {...props}
              name="image"
              type="file"
              accept={IMAGE_TYPES.join(',')}
              onChange={() => setClientErrors((current) => ({ ...current, image: undefined }))}
              className="h-auto py-2 file:mr-3 file:rounded-field file:border-0 file:bg-paper-deep file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
            />
          )}
        </FormField>
        {mode === 'edit' && initial.imageUrl ? (
          <CheckField
            id="product-remove-image"
            name="removeImage"
            label={t('removeImageLabel')}
            checked={removeImage}
            onChange={setRemoveImage}
          />
        ) : null}
      </fieldset>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href={cancelHref} className={buttonVariants({ variant: 'secondary' })}>
          {t('cancel')}
        </Link>
        <Button type="submit" disabled={pending}>
          {mode === 'new'
            ? pending
              ? t('submitting')
              : t('submit')
            : pending
              ? t('saving')
              : t('save')}
        </Button>
      </div>
    </form>
  );
}

function CheckField({
  id,
  name,
  label,
  hint,
  error,
  checked,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  error?: string | undefined;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        name={name}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        className="mt-0.5 size-5"
      />
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-ink">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-[13px] leading-snug text-ink-soft">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-[13px] font-medium text-error-ink">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
