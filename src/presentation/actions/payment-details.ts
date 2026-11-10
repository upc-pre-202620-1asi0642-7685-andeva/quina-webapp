'use server';

import { revalidatePath } from 'next/cache';
import { UpdatePaymentDetailsUseCase } from '@/core/application/identity/update-payment-details';
import { DrizzleStorePaymentRepository } from '@/infrastructure/db/repositories/drizzle-store-payment-repository';
import { getPrivateFileStorage } from '@/infrastructure/storage/image-storage-factory';
import { authorizeStore } from '@/presentation/auth/guards';
import { actionRedirect } from '@/presentation/lib/action-redirect';

export type PaymentDetailsField =
  'yapeNumber' | 'plinNumber' | 'bankName' | 'bankAccountNumber' | 'bankCci' | 'qr';
export type PaymentDetailsState = {
  saved?: boolean;
  errors?: Partial<Record<PaymentDetailsField | 'form', string>>;
};

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === 'string' ? value.slice(0, 200) : '';
};

/** Plan 5, P3 y D12: solo el dueño guarda los datos de cobro que ve el vecino. */
export async function savePaymentDetailsAction(
  _prev: PaymentDetailsState,
  formData: FormData,
): Promise<PaymentDetailsState> {
  const user = await authorizeStore('store.payment_details', { allowWhenReadOnly: true });
  if (!user) return actionRedirect('/login');

  const file = formData.get('qr');
  const qr =
    file instanceof File && file.size > 0
      ? { contentType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }
      : null;

  try {
    const result = await new UpdatePaymentDetailsUseCase(
      new DrizzleStorePaymentRepository(),
      getPrivateFileStorage(),
    ).execute({
      storeId: user.storeId,
      actorId: user.id,
      fields: {
        yapeNumber: text(formData, 'yapeNumber'),
        plinNumber: text(formData, 'plinNumber'),
        bankName: text(formData, 'bankName'),
        bankAccountNumber: text(formData, 'bankAccountNumber'),
        bankCci: text(formData, 'bankCci'),
      },
      qr,
      removeQr: formData.get('removeQr') === 'on',
    });
    if (!result.ok) {
      const { field, error } = result.error;
      return { errors: { [field]: field === 'qr' ? error : 'INVALID' } };
    }
  } catch (error) {
    console.error('[settings] no se pudieron guardar los datos de cobro', error);
    return { errors: { form: 'GENERIC' } };
  }
  revalidatePath('/settings');
  return { saved: true };
}
