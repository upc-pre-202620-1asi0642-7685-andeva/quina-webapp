import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BanknoteIcon } from 'lucide-react';
import { buttonVariants } from '@/presentation/components/ui/button';

/** Lleva al cobro del ciclo más antiguo del vecino (US13, D6). */
export function CyclePayButton({ customerId }: { customerId: string }) {
  const t = useTranslations('Collections.cycle');
  return (
    <Link href={`/customers/${customerId}/pay`} className={buttonVariants({ size: 'lg' })}>
      <BanknoteIcon aria-hidden="true" />
      {t('pay')}
    </Link>
  );
}
