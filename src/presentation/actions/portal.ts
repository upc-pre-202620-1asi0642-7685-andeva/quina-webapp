'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { NOTE_MAX, ResolveChargeUseCase } from '@/core/application/collections/resolve-charge';
import {
  RequestPortalCodeUseCase,
  VerifyPortalCodeUseCase,
} from '@/core/application/portal/portal-code';
import { DOCUMENT_TYPES, DocumentId } from '@/core/domain/identity/document-id';
import { getAuth } from '@/infrastructure/auth/auth';
import { createPortalCodes } from '@/infrastructure/auth/portal-codes';
import { verifyTurnstile } from '@/infrastructure/auth/turnstile';
import { db } from '@/infrastructure/db/connection';
import { DrizzleChargeResolutionRepository } from '@/infrastructure/db/collections/drizzle-charge-resolution-repository';
import { createPortalDirectory } from '@/infrastructure/db/portal/drizzle-portal-directory';
import type { ChargeActionResult } from '@/presentation/actions/collections';
import { authorizePortal } from '@/presentation/auth/guards';

const documentSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  documentNumber: z.string().max(20),
});

export type PortalCodeError = 'DOCUMENT_INVALID' | 'CAPTCHA_REQUIRED' | 'CODE_INVALID' | 'GENERIC';
type ActionResult = { ok: true } | { ok: false; error: PortalCodeError };

function parseDocument(input: unknown) {
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) return null;
  const document = DocumentId.parse(parsed.data.documentType, parsed.data.documentNumber);
  return document.ok ? document.value : null;
}

async function portalCodes() {
  const requestHeaders = await headers();
  const auth = getAuth();
  return createPortalCodes({
    db,
    send: async (email) => {
      await auth.api.sendVerificationOTP({
        body: { email, type: 'sign-in' },
        headers: requestHeaders,
      });
    },
  });
}

/**
 * US14.4: manda un código a cada correo registrado con el documento. Responde
 * igual exista o no el documento, para no revelar tiendas ni correos.
 */
export async function requestPortalCodeAction(input: {
  documentType: string;
  documentNumber: string;
  captchaToken: string;
}): Promise<ActionResult> {
  const document = parseDocument(input);
  if (!document) return { ok: false, error: 'DOCUMENT_INVALID' };

  const requestHeaders = await headers();
  const ip = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  if (!(await verifyTurnstile(input.captchaToken, ip))) {
    return { ok: false, error: 'CAPTCHA_REQUIRED' };
  }

  try {
    await new RequestPortalCodeUseCase(createPortalDirectory(), await portalCodes()).execute({
      document,
      now: new Date(),
    });
  } catch (error) {
    // Un correo que no sale no debe delatar que el documento existe
    console.error('[portal] no se pudo enviar el código', error);
  }
  return { ok: true };
}

/** US14.4: el código abre la sesión del correo al que se mandó (D6). */
export async function verifyPortalCodeAction(input: {
  documentType: string;
  documentNumber: string;
  code: string;
}): Promise<ActionResult> {
  const document = parseDocument(input);
  if (!document) return { ok: false, error: 'DOCUMENT_INVALID' };

  const match = await new VerifyPortalCodeUseCase(
    createPortalDirectory(),
    await portalCodes(),
  ).execute({ document, code: input.code.trim() });
  if (!match.ok) return { ok: false, error: 'CODE_INVALID' };

  try {
    // nextCookies deja la cookie de sesión en la respuesta de la acción
    await getAuth().api.signInEmailOTP({
      body: { email: match.value.email, otp: input.code.trim() },
      headers: await headers(),
    });
    return { ok: true };
  } catch {
    return { ok: false, error: 'CODE_INVALID' };
  }
}

const portalChargeSchema = z.object({
  storeId: z.uuid(),
  cycleId: z.uuid(),
  chargeId: z.uuid(),
  note: z.string().max(NOTE_MAX * 2),
});

/**
 * US14.9: el vecino observa un cargo dentro de sus 48 h. El cargo debe ser de su
 * cuenta en esa tienda; el `customerId` sale del vínculo de su correo, nunca del
 * formulario.
 */
export async function objectChargeFromPortalAction(
  input: z.input<typeof portalChargeSchema>,
): Promise<ChargeActionResult> {
  const parsed = portalChargeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };
  const access = await authorizePortal(parsed.data.storeId);
  if (!access) return { ok: false, error: 'SESSION' };
  try {
    const result = await new ResolveChargeUseCase(new DrizzleChargeResolutionRepository()).object({
      storeId: access.link.storeId,
      customerId: access.link.customerId,
      userId: access.user.id,
      chargeId: parsed.data.chargeId,
      note: parsed.data.note,
      now: new Date(),
    });
    if (!result.ok) return { ok: false, error: result.error };
    revalidatePath(`/portal/${parsed.data.storeId}/cycles/${parsed.data.cycleId}`);
    revalidatePath(`/customers/${access.link.customerId}/cycles/${parsed.data.cycleId}`);
    revalidatePath('/collections');
    return { ok: true };
  } catch (error) {
    console.error('objectChargeFromPortalAction', error);
    return { ok: false, error: 'GENERIC' };
  }
}

const enterSchema = z.object({
  token: z.string().min(1).max(200),
  // Solo dentro del portal: nunca un redireccionamiento abierto
  to: z
    .string()
    .regex(/^\/portal(\/[0-9a-f-]{36})?$/)
    .catch('/portal'),
});

/** US14.2 y D5: canjea el enlace mágico por POST; un antivirus que abre el correo no lo gasta. */
export async function enterPortalAction(formData: FormData): Promise<void> {
  const parsed = enterSchema.safeParse({ token: formData.get('token'), to: formData.get('to') });
  if (!parsed.success) redirect('/portal/login?error=link');
  const requestHeaders = await headers();
  const auth = getAuth();
  let entered = false;
  try {
    // D5: si había otra sesión en el equipo (la del dueño), se cierra antes
    if (await auth.api.getSession({ headers: requestHeaders })) {
      await auth.api.signOut({ headers: requestHeaders });
    }
    await auth.api.magicLinkVerify({
      query: { token: parsed.data.token },
      headers: requestHeaders,
    });
    entered = true;
  } catch {
    // Token vencido o ya usado: Better Auth lanza un redireccionamiento propio
  }
  redirect(entered ? parsed.data.to : '/portal/login?error=link');
}
