import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Resend } from 'resend';
import type { CollectionsMail, CollectionsMailer } from '@/core/domain/ports/collections-mailer';
import { renderCollectionsEmail } from './collections-templates';
import { safeFileSegment } from './outbox-auth-mailer';

/** Correo de cobranza guardado en `.outbox/` (desarrollo y e2e). */
export type OutboxCollectionsMail = CollectionsMail & {
  subject: string;
  text: string;
  sentAt: string;
  providerMessageId: string;
};

export class OutboxCollectionsMailer implements CollectionsMailer {
  constructor(private readonly dir: string = path.join(process.cwd(), '.outbox')) {}

  async send(mail: CollectionsMail): Promise<{ providerMessageId: string }> {
    const { subject, text } = renderCollectionsEmail(mail);
    const now = new Date();
    const providerMessageId = `outbox-${randomUUID()}`;
    const saved: OutboxCollectionsMail = {
      ...mail,
      subject,
      text,
      sentAt: now.toISOString(),
      providerMessageId,
    };
    await mkdir(this.dir, { recursive: true });
    const file = `${now.getTime()}-${safeFileSegment(mail.to)}-${mail.kind}.json`;
    await writeFile(path.join(this.dir, file), JSON.stringify(saved, null, 2), 'utf8');
    return { providerMessageId };
  }
}

type ResendPayload = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  tags: { name: string; value: string }[];
};

/** Parte mínima del SDK de Resend que usa la cobranza. */
export interface ResendSendClient {
  emails: {
    send(payload: ResendPayload): Promise<{
      data?: { id: string } | null;
      error?: { message: string } | null;
    }>;
  };
}

/**
 * Envía con Resend y etiqueta cada correo con su tienda: el webhook de rebotes
 * la lee para entrar con `withTenant` sin saltar RLS (D14).
 */
export class ResendCollectionsMailer implements CollectionsMailer {
  private readonly client: ResendSendClient;

  constructor(
    private readonly options: { apiKey: string; from: string; client?: ResendSendClient },
  ) {
    this.client = options.client ?? (new Resend(options.apiKey) as unknown as ResendSendClient);
  }

  async send(mail: CollectionsMail): Promise<{ providerMessageId: string | null }> {
    const { subject, html, text } = renderCollectionsEmail(mail);
    const result = await this.client.emails.send({
      from: this.options.from,
      to: mail.to,
      subject,
      html,
      text,
      tags: [
        { name: 'store_id', value: mail.storeId },
        { name: 'kind', value: mail.kind.replaceAll('-', '_') },
      ],
    });
    if (result.error)
      throw new Error(`Resend failed to send ${mail.kind}: ${result.error.message}`);
    return { providerMessageId: result.data?.id ?? null };
  }
}

const DEFAULT_FROM = 'Quina <hola@andeva.tech>';
let cached: CollectionsMailer | undefined;

export function createCollectionsMailer(env: NodeJS.ProcessEnv = process.env): CollectionsMailer {
  const transport = env.EMAIL_TRANSPORT || (env.NODE_ENV === 'production' ? 'resend' : 'outbox');
  if (transport === 'outbox') {
    if (env.VERCEL_ENV === 'production') {
      throw new Error('EMAIL_TRANSPORT=outbox is not allowed when VERCEL_ENV=production');
    }
    return new OutboxCollectionsMailer();
  }
  if (transport === 'resend') {
    if (!env.RESEND_API_KEY)
      throw new Error('RESEND_API_KEY is required for EMAIL_TRANSPORT=resend');
    return new ResendCollectionsMailer({
      apiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM || DEFAULT_FROM,
    });
  }
  throw new Error(`Unknown EMAIL_TRANSPORT: ${transport}`);
}

export function getCollectionsMailer(): CollectionsMailer {
  cached ??= createCollectionsMailer();
  return cached;
}
