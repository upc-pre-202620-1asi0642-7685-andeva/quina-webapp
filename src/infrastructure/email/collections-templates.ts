import { createTranslator } from 'next-intl';
import type { CollectionsMail, CollectionsMailLine } from '@/core/domain/ports/collections-mailer';
import type { Locale } from '@/core/domain/shared/locale';
import es from '../../../messages/es.json';
import en from '../../../messages/en.json';
import qu from '../../../messages/qu.json';
import { escapeHtml, layout, type RenderedEmail } from './templates';

const messages = { es, en, qu } as const;

const SYMBOL = { PEN: 'S/', USD: 'US$' } as const;

/** `S/ 12.30`: los correos no usan el componente Money, así que se arma aquí. */
export function formatMailMoney(amount: string, currency: CollectionsMail['currency']): string {
  return `${SYMBOL[currency]} ${amount}`;
}

/** `2026-09-26` → `26/09/2026`, como se escribe en el Perú. */
export function formatMailDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function translator(locale: Locale) {
  return createTranslator({ locale, messages: messages[locale], namespace: 'Email' });
}

type Row = { label: string; detail?: string; amount: string };

function rowsOf(mail: CollectionsMail, t: ReturnType<typeof translator>): Row[] {
  const money = (amount: string) => formatMailMoney(amount, mail.currency);
  return mail.lines.map((line: CollectionsMailLine): Row => {
    if (line.kind === 'purchase') {
      const date = formatMailDate(line.date);
      const items = line.items.map((i) => `${i.quantity} × ${i.name} (${money(i.amount)})`);
      const interest =
        line.days !== undefined && line.interest !== undefined
          ? t('collections.interest', { days: line.days, amount: money(line.interest) })
          : null;
      return {
        label: line.time
          ? t('collections.purchaseAt', { date, time: line.time })
          : t('collections.purchase', { date }),
        detail: [...items, ...(interest ? [interest] : [])].join(' · ') || undefined,
        amount: money(line.amount),
      };
    }
    if (line.kind === 'installment') {
      return {
        label: t('collections.installment', { number: line.number, total: line.total }),
        amount: money(line.amount),
      };
    }
    if (line.kind === 'void') {
      return { label: t('collections.void'), amount: `− ${money(line.amount)}` };
    }
    return { label: t('collections.moratory', { days: line.days }), amount: money(line.amount) };
  });
}

function detailOf(rows: Row[], totalLabel: string, total: string) {
  const cell = 'padding:8px 0;border-bottom:1px solid #e6e8e6;font-size:14px;vertical-align:top;';
  const htmlRows = rows
    .map(
      (r) =>
        `<tr><td style="${cell}">${escapeHtml(r.label)}${
          r.detail
            ? `<br><span style="color:#4a564e;font-size:13px;">${escapeHtml(r.detail)}</span>`
            : ''
        }</td><td style="${cell}text-align:right;white-space:nowrap;">${escapeHtml(r.amount)}</td></tr>`,
    )
    .join('');
  const html = `<table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0 24px;">${htmlRows}<tr><td style="padding:12px 0;font-size:16px;font-weight:700;">${escapeHtml(totalLabel)}</td><td style="padding:12px 0;font-size:16px;font-weight:700;text-align:right;white-space:nowrap;">${escapeHtml(total)}</td></tr></table>\n`;
  const text = [
    ...rows.map((r) => `- ${r.label}${r.detail ? ` (${r.detail})` : ''}: ${r.amount}`),
    `${totalLabel}: ${total}`,
  ].join('\n');
  return { html, text };
}

/** Correos de cobranza: resumen de cargos, estado de cuenta, recordatorio, mora y recibo. */
export function renderCollectionsEmail(mail: CollectionsMail): RenderedEmail {
  const t = translator(mail.locale);
  const store = mail.storeName;
  const total = formatMailMoney(mail.total, mail.currency);
  const dueDate = mail.paymentDueDate ? formatMailDate(mail.paymentDueDate) : '';
  const cutOff = mail.cutOffDate ? formatMailDate(mail.cutOffDate) : '';
  const contact = mail.storeContact
    ? t('collections.contact', { store, contact: mail.storeContact })
    : t('collections.contactInStore', { store });
  const yape = mail.storeYape ? [t('collections.yape', { yape: mail.storeYape })] : [];
  const detail = detailOf(rowsOf(mail, t), t('collections.total'), total);
  const greeting = t('welcome.greeting', { name: mail.customerName });
  const action = mail.portalUrl
    ? { label: t('collections.portalButton'), url: mail.portalUrl }
    : undefined;

  switch (mail.kind) {
    case 'charge-digest':
      return layout(mail.locale, {
        subject: t('collections.digest.subject', { store }),
        greeting,
        intro: t('collections.digest.intro', { store }),
        detail,
        action,
        outro: t(mail.portalUrl ? 'collections.digest.outroPortal' : 'collections.digest.outro'),
        notes: [
          ...(mail.balance
            ? [t('collections.balance', { amount: formatMailMoney(mail.balance, mail.currency) })]
            : []),
          contact,
        ],
      });
    case 'cycle-statement':
      return layout(mail.locale, {
        subject: t('collections.statement.subject', { store, cutOff }),
        greeting,
        intro: t('collections.statement.intro', { cutOff }),
        detail,
        action,
        outro: t('collections.statement.outro', { amount: total, dueDate }),
        notes: [...yape, contact],
      });
    case 'payment-reminder':
      return layout(mail.locale, {
        subject: t('collections.reminder.subject', { store, dueDate }),
        greeting,
        intro: t('collections.reminder.intro', { store, dueDate, amount: total }),
        action,
        outro: t('collections.reminder.outro'),
        notes: [...yape, contact],
      });
    case 'late-payment':
      return layout(mail.locale, {
        subject: t('collections.late.subject', { store }),
        greeting,
        intro: t('collections.late.intro', { dueDate, amount: total }),
        action,
        outro: t('collections.late.outro', { store }),
        notes: [...yape, contact],
      });
    case 'payment-receipt':
      return layout(mail.locale, {
        subject: t('collections.receipt.subject', { store, receipt: mail.receiptNumber ?? '' }),
        greeting,
        intro: t('collections.receipt.intro', {
          date: mail.paidAt ? formatMailDate(mail.paidAt) : '',
          method: t(`collections.method.${mail.paymentMethod ?? 'CASH'}`),
          receipt: mail.receiptNumber ?? '',
        }),
        detail,
        outro: t('collections.receipt.outro'),
        notes: [contact],
      });
  }
}
