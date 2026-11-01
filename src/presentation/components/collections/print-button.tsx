'use client';

import { useTranslations } from 'next-intl';
import { PrinterIcon } from 'lucide-react';
import { Button } from '@/presentation/components/ui/button';

export function PrintButton() {
  const t = useTranslations('Collections.receipt');
  return (
    <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
      <PrinterIcon aria-hidden="true" />
      {t('print')}
    </Button>
  );
}
