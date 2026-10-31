import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import type { DocumentType } from '@/core/domain/identity/document-id';
import { getCustomer } from '@/infrastructure/db/queries/customers';
import { updateCustomerAction } from '@/presentation/actions/customers';
import { requireStoreUser } from '@/presentation/auth/guards';
import { CustomerForm } from '@/presentation/components/customers/customer-form';
import { loadStoreContext } from '@/presentation/queries/store-context';

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStoreUser(`/customers/${id}/edit`, 'customers.update');
  if (!z.uuid().safeParse(id).success) notFound();
  const customer = await getCustomer(user.storeId, id);
  if (!customer) notFound();
  const store = await loadStoreContext(user.storeId);
  const t = await getTranslations('Customers.form');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        {t('editTitle', { name: customer.firstName })}
      </h1>
      <section className="rounded-card border border-line bg-surface p-4 sm:p-6">
        <CustomerForm
          mode="edit"
          action={updateCustomerAction.bind(null, id)}
          storeName={store.name}
          privacyHref={`/app/privacy/customers/${user.storeId}`}
          cancelHref={`/customers/${id}`}
          initial={{
            documentType: customer.documentType as DocumentType,
            documentNumber: customer.documentNumber,
            firstName: customer.firstName,
            lastName: customer.lastName,
            phone: customer.phone ?? '',
            email: customer.email,
            address: customer.address ?? '',
            preferredLocale: customer.preferredLocale ?? '',
          }}
        />
      </section>
    </div>
  );
}
