import { createTranslator } from 'next-intl';
import type { AuthMailKind } from '@/core/domain/ports/auth-mailer';
import type { Locale } from '@/core/domain/shared/locale';
import es from '../../../messages/es.json';
import en from '../../../messages/en.json';
import qu from '../../../messages/qu.json';

const messages = { es, en, qu } as const;

export type RenderedEmail = { subject: string; html: string; text: string };
export type EmailData = { otp?: string; url?: string };

// Los correos no soportan variables CSS: el verde de marca va literal (DESIGN.md 2.2).
const BRAND_GREEN = '#2bdd66';
const BRAND_DARK = '#0a2e17';
const BRAND_SOFT = '#e3f9ea';

function escapeHtml(value: string): string {
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

  const greeting = t('greeting');
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
${codeBlock}${button}<p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#4a564e;">${escapeHtml(outro)}</p>
<p style="margin:0;font-size:14px;color:#4a564e;">${escapeHtml(signature)}</p>
</div>
</body>
</html>`;

  const textParts = [greeting, '', intro];
  if (highlight) textParts.push('', highlight);
  if (action) textParts.push('', `${action.label}: ${action.url}`);
  textParts.push('', outro, '', signature);

  return { subject, html, text: textParts.join('\n') };
}
