'use client';

import { useTranslations } from 'next-intl';
import { PrinterIcon } from 'lucide-react';
import { Button } from '@/presentation/components/ui/button';

export function PrintButton({
  label,
  size = 'default',
}: {
  label?: string;
  size?: 'default' | 'lg';
} = {}) {
  const t = useTranslations('Collections.receipt');
  return (
    <Button variant="secondary" size={size} onClick={() => window.print()} className="print:hidden">
      <PrinterIcon aria-hidden="true" />
      {label ?? t('print')}
    </Button>
  );
}
