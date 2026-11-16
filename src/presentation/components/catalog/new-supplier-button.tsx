'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/presentation/components/ui/button';
import { SupplierDialog } from './supplier-dialog';

export function NewSupplierButton({
  label,
  disabled = false,
}: {
  label: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // El acceso directo "Crear > Nuevo proveedor" llega con ?new=1 y abre la hoja
  const [open, setOpen] = useState(!disabled && searchParams.get('new') === '1');

  const change = (next: boolean) => {
    setOpen(next);
    if (!next) router.replace(pathname, { scroll: false });
  };

  return (
    <>
      <Button type="button" disabled={disabled} onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden="true" />
        {label}
      </Button>
      {/* La acción revalida /inventory/suppliers: la lista se actualiza sola */}
      <SupplierDialog open={open} onOpenChange={change} />
    </>
  );
}
