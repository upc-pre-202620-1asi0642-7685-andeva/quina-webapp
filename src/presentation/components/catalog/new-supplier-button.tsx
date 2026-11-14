'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/presentation/components/ui/button';
import { SupplierDialog } from './supplier-dialog';

export function NewSupplierButton({ label }: { label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  // El acceso directo "Crear > Nuevo proveedor" llega con ?new=1 y abre el diálogo
  const [open, setOpen] = useState(useSearchParams().get('new') === '1');

  const change = (next: boolean) => {
    setOpen(next);
    if (!next) router.replace(pathname, { scroll: false });
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden="true" />
        {label}
      </Button>
      {/* La acción revalida /inventory/suppliers: la lista se actualiza sola */}
      <SupplierDialog open={open} onOpenChange={change} />
    </>
  );
}
