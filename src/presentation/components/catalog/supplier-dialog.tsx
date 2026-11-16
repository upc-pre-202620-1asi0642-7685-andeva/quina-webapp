'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { sileo } from 'sileo';
import type { SupplierOption } from '@/core/domain/ports/purchase-repository';
import { createSupplierAction, updateSupplierAction } from '@/presentation/actions/purchases';
import { FormField } from '@/presentation/components/auth/form-field';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { ResponsiveSheet } from '@/presentation/components/ui/responsive-sheet';

type SupplierField = 'taxIdNumber' | 'tradeName' | 'contactName' | 'phone' | 'email' | 'form';

/** Alta o edición de proveedor en hoja adaptable (celular: hoja arrastrable, escritorio: diálogo). */
export function SupplierDialog({
  open,
  onOpenChange,
  supplier,
  onCreated,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: SupplierOption | null;
  onCreated?: (supplier: SupplierOption) => void;
  onUpdated?: (supplier: SupplierOption) => void;
}) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={<SupplierSheetTitle isEdit={Boolean(supplier)} />}
      description={<SupplierSheetDescription isEdit={Boolean(supplier)} />}
    >
      {open ? (
        <SupplierDialogForm
          key={supplier?.id ?? 'new'}
          supplier={supplier ?? null}
          onClose={() => onOpenChange(false)}
          onCreated={onCreated}
          onUpdated={onUpdated}
        />
      ) : null}
    </ResponsiveSheet>
  );
}

function SupplierSheetTitle({ isEdit }: { isEdit: boolean }) {
  const t = useTranslations('Purchases.form');
  return <>{isEdit ? t('editSupplierTitle') : t('newSupplierTitle')}</>;
}

function SupplierSheetDescription({ isEdit }: { isEdit: boolean }) {
  const t = useTranslations('Purchases.form');
  return <>{isEdit ? t('editSupplierDescription') : t('newSupplierDescription')}</>;
}

function SupplierDialogForm({
  supplier,
  onClose,
  onCreated,
  onUpdated,
}: {
  supplier: SupplierOption | null;
  onClose: () => void;
  onCreated?: (supplier: SupplierOption) => void;
  onUpdated?: (supplier: SupplierOption) => void;
}) {
  const t = useTranslations('Purchases.form');
  const isEdit = Boolean(supplier);
  const [busy, startTransition] = useTransition();
  const [tradeName, setTradeName] = useState(supplier?.tradeName ?? '');
  const [taxId, setTaxId] = useState(supplier?.taxIdNumber ?? '');
  const [contactName, setContactName] = useState(supplier?.contactName ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [email, setEmail] = useState(supplier?.email ?? '');
  const [fieldError, setFieldError] = useState<{ field: SupplierField; message: string } | null>(
    null,
  );

  const errorFor = (field: SupplierField) =>
    fieldError?.field === field ? fieldError.message : undefined;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldError(null);
    const payload = {
      taxIdNumber: taxId.trim(),
      tradeName: tradeName.trim(),
      contactName: contactName.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateSupplierAction(supplier!.id, payload)
        : await createSupplierAction(payload);

      if (!result.ok) {
        setFieldError({ field: result.field, message: t(`supplierErrors.${result.error}`) });
        return;
      }

      const saved: SupplierOption = {
        id: result.supplierId,
        tradeName: payload.tradeName,
        taxIdNumber: payload.taxIdNumber,
        contactName: payload.contactName ?? null,
        phone: payload.phone ?? null,
        email: payload.email ?? null,
        isActive: supplier?.isActive ?? true,
      };

      if (isEdit) {
        onUpdated?.(saved);
        sileo.clear();
        sileo.success({ title: t('supplierUpdatedToast') });
      } else {
        onCreated?.(saved);
        sileo.clear();
        sileo.success({ title: t('supplierCreatedToast') });
      }
      onClose();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {errorFor('form') ? (
        <Notice tone="error">
          <p>{errorFor('form')}</p>
        </Notice>
      ) : null}

      <FormField
        id="supplier-business-name"
        label={t('supplierBusinessName')}
        hint={t('supplierBusinessHint')}
        error={errorFor('tradeName')}
      >
        {(props) => (
          <Input
            {...props}
            value={tradeName}
            onChange={(e) => {
              setTradeName(e.target.value);
              if (fieldError?.field === 'tradeName') setFieldError(null);
            }}
            required
            maxLength={150}
          />
        )}
      </FormField>

      <FormField
        id="supplier-tax-id"
        label={t('supplierTaxId')}
        hint={t('supplierTaxIdHint')}
        error={errorFor('taxIdNumber')}
      >
        {(props) => (
          <Input
            {...props}
            value={taxId}
            onChange={(e) => {
              setTaxId(e.target.value);
              if (fieldError?.field === 'taxIdNumber') setFieldError(null);
            }}
            inputMode="numeric"
            placeholder="20123456789"
            required
            maxLength={11}
            className="tabular-nums"
          />
        )}
      </FormField>

      <FormField
        id="supplier-contact-name"
        label={t('supplierContactName')}
        hint={t('supplierContactHint')}
        error={errorFor('contactName')}
      >
        {(props) => (
          <Input
            {...props}
            value={contactName}
            onChange={(e) => {
              setContactName(e.target.value);
              if (fieldError?.field === 'contactName') setFieldError(null);
            }}
            maxLength={100}
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="supplier-phone"
          label={t('supplierPhone')}
          hint={t('supplierPhoneHint')}
          error={errorFor('phone')}
        >
          {(props) => (
            <Input
              {...props}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (fieldError?.field === 'phone') setFieldError(null);
              }}
              inputMode="tel"
              maxLength={20}
              className="tabular-nums"
            />
          )}
        </FormField>

        <FormField
          id="supplier-email"
          label={t('supplierEmail')}
          hint={t('supplierEmailHint')}
          error={errorFor('email')}
        >
          {(props) => (
            <Input
              {...props}
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldError?.field === 'email') setFieldError(null);
              }}
              maxLength={150}
            />
          )}
        </FormField>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? t('savingSupplier') : isEdit ? t('updateSupplierButton') : t('saveSupplier')}
        </Button>
      </div>
    </form>
  );
}
