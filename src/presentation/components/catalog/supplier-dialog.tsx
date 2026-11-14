'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { sileo } from 'sileo';
import type { SupplierOption } from '@/core/domain/ports/purchase-repository';
import { createSupplierAction } from '@/presentation/actions/purchases';
import { FormField } from '@/presentation/components/auth/form-field';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/presentation/components/ui/dialog';
import { Input } from '@/presentation/components/ui/input';

/** Alta rápida de proveedor: desde Nueva compra y desde la lista de Proveedores. */
export function SupplierDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (supplier: SupplierOption) => void;
}) {
  const t = useTranslations('Purchases.form');
  const [busy, startTransition] = useTransition();
  const [tradeName, setTradeName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createSupplierAction({
        taxIdNumber: taxId.trim(),
        tradeName: tradeName.trim(),
        phone: phone.trim() || undefined,
      });
      if (!result.ok) {
        setError(t(`supplierErrors.${result.error}`));
        return;
      }
      onCreated?.({
        id: result.supplierId,
        tradeName: tradeName.trim(),
        taxIdNumber: taxId.trim(),
        contactName: null,
        phone: phone.trim() || null,
        email: null,
        isActive: true,
      });
      setTradeName('');
      setTaxId('');
      setPhone('');
      onOpenChange(false);
      sileo.success({ title: t('supplierCreatedToast') });
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-card border-line bg-surface">
        <DialogTitle className="text-lg text-ink">{t('newSupplierTitle')}</DialogTitle>
        <DialogDescription className="text-sm text-ink-soft">
          {t('newSupplierDescription')}
        </DialogDescription>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Un RUC repetido o inválido exige corregir: se queda en el diálogo (DESIGN §7.3) */}
          {error ? (
            <Notice tone="error">
              <p>{error}</p>
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
                value={tradeName}
                onChange={(e) => setTradeName(e.target.value)}
                required
                maxLength={200}
              />
            )}
          </FormField>
          <FormField id="supplier-tax-id" label={t('supplierTaxId')} hint={t('supplierTaxIdHint')}>
            {(props) => (
              <Input
                {...props}
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
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
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                maxLength={20}
              />
            )}
          </FormField>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t('savingSupplier') : t('saveSupplier')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
