import { createTranslator } from 'next-intl';
import type { AuthMailKind } from '@/core/domain/ports/auth-mailer';
import type {
  AccountSetupAudience,
  NotificationMailKind,
  SubscriptionNoticeInput,
} from '@/core/domain/ports/notification-mailer';
import type { Locale } from '@/core/domain/shared/locale';
import es from '../../../messages/es.json';
import en from '../../../messages/en.json';
import qu from '../../../messages/qu.json';

const messages = { es, en, qu } as const;

export type RenderedEmail = { subject: string; html: string; text: string };
export type EmailData = { otp?: string; url?: string };

export type NotificationEmailData = {
  url: string;
  /** Nombre de quien recibe el correo. */
  name: string;
  storeName: string | null;
  audience?: AccountSetupAudience;
};

// Los correos no soportan variables CSS: el verde de marca va literal (DESIGN.md 2.2).
const BRAND_GREEN = '#2bdd66';
const BRAND_DARK = '#0a2e17';
const BRAND_SOFT = '#e3f9ea';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderAuthEmail(
  kind: AuthMailKind,
  locale: Locale,
  data: EmailData = {},
): RenderedEmail {
  const t = createTranslator({ locale, messages: messages[locale], namespace: 'Email' });

  let subject: string;
  let intro: string;
  let outro: string;
  let highlight: string | undefined;
  let action: { label: string; url: string } | undefined;

  if (kind === 'verification-otp') {
    if (!data.otp) throw new Error('verification-otp requires data.otp');
    subject = t('otp.subject');
    intro = t('otp.intro');
    highlight = data.otp;
    outro = t('otp.outro');
  } else if (kind === 'portal-otp') {
    if (!data.otp) throw new Error('portal-otp requires data.otp');
    subject = t('portalOtp.subject');
    intro = t('portalOtp.intro');
    highlight = data.otp;
    outro = t('portalOtp.outro');
  } else if (kind === 'password-reset') {
    if (!data.url) throw new Error('password-reset requires data.url');
    subject = t('reset.subject');
    intro = t('reset.intro');
    action = { label: t('reset.action'), url: data.url };
    outro = t('reset.outro');
  } else {
    subject = t('lockout.subject');
    intro = t('lockout.intro');
    outro = t('lockout.outro');
  }

  return layout(locale, { subject, greeting: t('greeting'), intro, highlight, action, outro });
}

export type EmailParts = {
  subject: string;
  greeting: string;
  intro: string;
  outro: string;
  highlight?: string | undefined;
  action?: { label: string; url: string } | undefined;
  /** Bloque ya escapado que va después de la introducción (detalle de cobranza). */
  detail?: { html: string; text: string } | undefined;
  /** Párrafos extra después del cierre (contacto y datos de pago). */
  notes?: string[] | undefined;
};

export function layout(locale: Locale, parts: EmailParts): RenderedEmail {
  const { subject, greeting, intro, outro, highlight, action, detail, notes = [] } = parts;
  const t = createTranslator({ locale, messages: messages[locale], namespace: 'Email' });
  const signature = t('signature');

  const codeBlock = highlight
    ? `<p style="margin:24px 0;font-size:32px;font-weight:700;letter-spacing:8px;color:${BRAND_DARK};background:${BRAND_SOFT};border-radius:12px;padding:16px;text-align:center;">${escapeHtml(highlight)}</p>\n`
    : '';
  const button = action
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:${BRAND_GREEN};color:${BRAND_DARK};font-weight:700;text-decoration:none;border-radius:12px;padding:14px 24px;">${escapeHtml(action.label)}</a></p>\n`
    : '';

  const html = `<!doctype html>
<html lang="${locale}">
<body style="margin:0;padding:24px;background:#f8f8fa;font-family:Arial,Helvetica,sans-serif;color:#0f1a13;">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;">
<p style="margin:0 0 24px;font-size:24px;font-weight:700;color:${BRAND_DARK};border-bottom:4px solid ${BRAND_GREEN};padding-bottom:12px;">Quina</p>
<p style="margin:0 0 12px;font-size:16px;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 12px;font-size:16px;line-height:1.5;">${escapeHtml(intro)}</p>
${detail?.html ?? ''}${codeBlock}${button}<p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#4a564e;">${escapeHtml(outro)}</p>
${notes
  .map(
    (
      note,
    ) => `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#4a564e;">${escapeHtml(note)}</p>
`,
  )
  .join('')}<p style="margin:0;font-size:14px;color:#4a564e;">${escapeHtml(signature)}</p>
</div>
</body>
</html>`;

  const textParts = [greeting, '', intro];
  if (detail) textParts.push('', detail.text);
  if (highlight) textParts.push('', highlight);
  if (action) textParts.push('', `${action.label}: ${action.url}`);
  textParts.push('', outro);
  for (const note of notes) textParts.push('', note);
  textParts.push('', signature);

  return { subject, html, text: textParts.join('\n') };
}

export function renderNotificationEmail(
  kind: NotificationMailKind,
  locale: Locale,
  data: NotificationEmailData,
): RenderedEmail {
  const t = createTranslator({ locale, messages: messages[locale], namespace: 'Email' });
  const store = data.storeName ?? 'Quina';

  if (kind === 'customer-welcome') {
    return layout(locale, {
      subject: t('welcome.subject', { store }),
      greeting: t('welcome.greeting', { name: data.name }),
      intro: t('welcome.intro', { store }),
      action: { label: t('welcome.action'), url: data.url },
      outro: t('welcome.outro', { store }),
    });
  }

  const audience = data.audience ?? 'employee';
  return layout(locale, {
    subject: t(`setup.${audience}.subject`, { store }),
    greeting: t('welcome.greeting', { name: data.name }),
    intro: t(`setup.${audience}.intro`, { store }),
    action: { label: t('setup.action'), url: data.url },
    outro: t('setup.outro'),
  });
}

export function renderSubscriptionEmail(input: SubscriptionNoticeInput): RenderedEmail {
  const { locale, name, storeName } = input;
  const t = createTranslator({ locale, messages: messages[locale], namespace: 'Email' });
  const greeting = t('welcome.greeting', { name });

  if (input.kind === 'trial_ending') {
    return layout(locale, {
      subject: t('subscription.trialEnding.subject', { days: input.daysLeft }),
      greeting,
      intro: t('subscription.trialEnding.intro', { store: storeName, days: input.daysLeft }),
      action: { label: t('subscription.action'), url: input.url },
      outro: t('subscription.trialEnding.outro'),
    });
  }

  if (input.kind === 'payment_failed') {
    return layout(locale, {
      subject: t('subscription.paymentFailed.subject', { store: storeName }),
      greeting,
      intro: t('subscription.paymentFailed.intro', {
        store: storeName,
        plan: input.graceEndsDate,
      }),
      action: { label: t('subscription.action'), url: input.url },
      outro: t('subscription.paymentFailed.outro'),
    });
  }

  return layout(locale, {
    subject: t('subscription.paymentApproved.subject', { plan: input.planName }),
    greeting,
    intro: t('subscription.paymentApproved.intro', {
      store: storeName,
      plan: input.planName,
      amount: input.amount.replace(/^S\/\s*/, ''),
    }),
    action: { label: t('subscription.action'), url: input.receiptUrl },
    outro: t('subscription.paymentApproved.outro'),
  });
}
