import { RatePercent } from '@/core/domain/credit/rate-percent';
import type { Currency } from '@/core/domain/shared/money';
import type { AuditLogEntry } from '@/infrastructure/db/queries/audit';
import { formatMoney } from '@/presentation/components/money';
import { formatDate, formatDateTime } from '@/presentation/lib/format-date';
import { formatQuantity } from '@/presentation/lib/format-quantity';

export type AuditTone = 'error' | 'amber' | 'success' | 'soft' | 'neutral';

export type AuditTranslator = ((
  key: string,
  values?: Record<string, string | number>,
) => string) & {
  has?: (key: string) => boolean;
};

export type AuditDiffRow = {
  field: string;
  fieldLabel: string;
  before: string | null;
  after: string | null;
  changed: boolean;
};

export type PresentedAuditEntry = {
  id: string;
  action: string;
  actionLabel: string;
  entityName: string;
  entityLabel: string;
  entityId: string | null;
  tone: AuditTone;
  summary: string;
  actorName: string;
  ipAddress: string | null;
  deviceSummary: string | null;
  dateTimeLabel: string;
  dateLabel: string;
  timeLabel: string;
  deepLink: string | null;
  diffRows: AuditDiffRow[];
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACTION_TONES: Record<string, AuditTone> = {
  // Error / destructivo / crítico
  CHARGE_VOIDED: 'error',
  VOID_CREDIT_CHARGE: 'error',
  RECORD_WASTE: 'error',
  LOGIN_BLOCKED: 'error',
  LOCK_ACCOUNT: 'error',
  DEACTIVATE_EMPLOYEE: 'error',
  SUSPEND_STORE: 'error',
  SUBSCRIPTION_PAYMENT_REJECTED: 'error',
  MARK_SUBSCRIPTION_PAST_DUE: 'error',
  EXPIRE_GRACE_PERIOD: 'error',

  // Ámbar / advertencia / ajuste sensible
  OBJECT_CHARGE: 'amber',
  UPDATE_CREDIT_TERMS: 'amber',
  UPDATE_PRICE: 'amber',
  ADJUST_STOCK: 'amber',
  DEACTIVATE_CUSTOMER: 'amber',
  DEACTIVATE_PRODUCT: 'amber',
  DEACTIVATE_SUPPLIER: 'amber',
  UPDATE_TAX_SETTINGS: 'amber',
  LOGIN_FAILED: 'amber',
  SUBSCRIPTION_PAYMENT_REFUNDED: 'amber',
  CANCEL_SUBSCRIPTION_RENEWAL: 'amber',
  EXPIRE_TRIAL: 'amber',

  // Éxito / creación / confirmación / pago
  CREATE_CASH_SALE: 'success',
  REGISTER_PAYMENT: 'success',
  CHARGE_CONFIRMED: 'success',
  CREATE_CUSTOMER: 'success',
  REACTIVATE_CUSTOMER: 'success',
  CREATE_PRODUCT: 'success',
  REACTIVATE_PRODUCT: 'success',
  ACTIVATE_PRODUCT: 'success',
  CREATE_SUPPLIER: 'success',
  REACTIVATE_SUPPLIER: 'success',
  REGISTER_PURCHASE: 'success',
  CREATE_STORE: 'success',
  REACTIVATE_STORE: 'success',
  REACTIVATE_EMPLOYEE: 'success',
  SUBSCRIPTION_PAYMENT_APPROVED: 'success',
  SUBSCRIBE_PLAN: 'success',
  RENEW_SUBSCRIPTION: 'success',

  // Realce suave / inicio / apertura / acceso
  CREATE_CREDIT_SALE: 'soft',
  OPEN_CREDIT_ACCOUNT: 'soft',
  GENERATE_REPLENISHMENT_ORDERS: 'soft',
  INVITE_EMPLOYEE: 'soft',
  SET_PASSWORD: 'soft',
  START_SUBSCRIPTION_CHECKOUT: 'soft',

  // Neutro / edición rutinaria / descarte / fin de ciclo
  UPDATE_CUSTOMER: 'neutral',
  UPDATE_PRODUCT: 'neutral',
  UPDATE_SUPPLIER: 'neutral',
  DISCARD_PURCHASE_ORDER: 'neutral',
  UPDATE_PAYMENT_DETAILS: 'neutral',
  CANCEL_INVITE: 'neutral',
  ACCEPT_TERMS: 'neutral',
  COMPLETE_CANCELED_SUBSCRIPTION: 'neutral',
};

const MONEY_FIELDS = new Set([
  'totalAmount',
  'amountPaid',
  'principalPaid',
  'compensatoryInterestPaid',
  'moratoryInterestPaid',
  'balanceAfter',
  'creditLimit',
  'cashPrice',
  'creditPrice',
  'voidedAmount',
  'amount',
]);

const QUANTITY_FIELDS = new Set(['initialStock', 'currentStock', 'wasteQuantity']);

const DATETIME_FIELDS = new Set([
  'lockedUntil',
  'trialEndsAt',
  'currentPeriodEnd',
  'gracePeriodEndsAt',
]);

const DATE_ONLY_FIELDS = new Set(['issueDate']);

const RATE_FIELDS = new Set(['compensatory', 'moratory']);

const ENUM_FIELD_GROUPS: Record<string, string> = {
  paymentMethod: 'paymentMethod',
  saleModality: 'saleModality',
  documentType: 'documentType',
  planTier: 'planTier',
  billingInterval: 'billingInterval',
  status: 'status',
  consentStatus: 'consentStatus',
  taxRegime: 'taxRegime',
  rusCategory: 'rusCategory',
  via: 'via',
  by: 'by',
  preferredLocale: 'locale',
};

function tr(
  t: AuditTranslator,
  key: string,
  fallback: string,
  values?: Record<string, string | number>,
): string {
  if (t.has && !t.has(key)) return fallback;
  try {
    return t(key, values);
  } catch {
    return fallback;
  }
}

function asCurrency(data: Record<string, unknown> | null): Currency {
  return data?.currency === 'USD' ? 'USD' : 'PEN';
}

function safeMoney(raw: unknown, currency: Currency = 'PEN'): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  try {
    return formatMoney(String(raw), currency);
  } catch {
    return String(raw);
  }
}

function safeDateTime(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  const text = String(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const d = new Date(`${text}T12:00:00.000-05:00`);
    return Number.isNaN(d.getTime()) ? text : formatDate(d);
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? text : formatDateTime(d);
}

function safeRate(raw: unknown, t: AuditTranslator): string {
  if (!raw || typeof raw !== 'object') return String(raw ?? '—');
  const obj = raw as Record<string, unknown>;
  const typeRaw = String(obj.type ?? '');
  const periodRaw = String(obj.period ?? '');
  const capRaw = obj.capitalization ? String(obj.capitalization) : null;
  let percent = String(obj.value ?? '0');
  try {
    percent = RatePercent.fromFraction(percent);
  } catch {
    // conserva valor textual si no es fracción decimal válida
  }
  const typeLabel = tr(t, `values.rateType.${typeRaw}`, typeRaw);
  const periodLabel = tr(t, `values.ratePeriod.${periodRaw}`, periodRaw);
  if (typeRaw === 'NOMINAL' && capRaw) {
    const capLabel = tr(t, `values.ratePeriod.${capRaw}`, capRaw);
    return tr(
      t,
      'values.rateNominal',
      `${typeLabel} ${percent} % (${periodLabel}, cap. ${capLabel})`,
      { type: typeLabel, percent, period: periodLabel, cap: capLabel },
    );
  }
  return tr(t, 'values.rateEffective', `${typeLabel} ${percent} % (${periodLabel})`, {
    type: typeLabel,
    percent,
    period: periodLabel,
  });
}

function humanizeFieldKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

export function fieldLabel(key: string, t: AuditTranslator): string {
  return tr(t, `fields.${key}`, humanizeFieldKey(key));
}

export function formatAuditFieldValue(
  key: string,
  value: unknown,
  context: Record<string, unknown> | null,
  t: AuditTranslator,
): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (RATE_FIELDS.has(key)) return safeRate(value, t);
  if (MONEY_FIELDS.has(key)) return safeMoney(value, asCurrency(context));
  if (QUANTITY_FIELDS.has(key)) return formatQuantity(String(value));
  if (DATETIME_FIELDS.has(key) || DATE_ONLY_FIELDS.has(key)) return safeDateTime(value);

  if (typeof value === 'boolean') {
    return tr(t, value ? 'values.bool.true' : 'values.bool.false', value ? 'Sí' : 'No');
  }

  if (Array.isArray(value)) {
    const mapped = value.map((item) => {
      const s = String(item);
      return key === 'documents' ? tr(t, `values.documents.${s}`, s) : s;
    });
    return mapped.join(', ');
  }

  const group = ENUM_FIELD_GROUPS[key];
  if (group) {
    const raw = String(value);
    return tr(t, `values.${group}.${raw}`, raw);
  }

  const str = String(value);
  if (UUID_RE.test(str)) {
    return `${str.slice(0, 8)}…`;
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${fieldLabel(k, t)}: ${String(v)}`)
      .join(' · ');
  }
  return str;
}

export function resolveActionTone(
  action: string,
  entry?: Pick<AuditLogEntry, 'newData'>,
): AuditTone {
  if (action === 'SET_CREDIT_ACCOUNT_STATUS') {
    const nextStatus = String(entry?.newData?.status ?? '');
    if (nextStatus === 'BLOCKED') return 'error';
    if (nextStatus === 'ACTIVE') return 'success';
    return 'amber';
  }
  return ACTION_TONES[action] ?? 'neutral';
}

export function resolveDeepLink(
  entityName: string,
  entityId: string | null,
  newData: Record<string, unknown> | null,
): string | null {
  const validEntityId = entityId && UUID_RE.test(entityId) ? entityId : null;

  if (entityName === 'customers' && validEntityId) return `/customers/${validEntityId}`;
  if (entityName === 'products' && validEntityId) return `/inventory/${validEntityId}`;
  if (entityName === 'purchases' && validEntityId) return `/inventory/purchases/${validEntityId}`;
  if (entityName === 'suppliers') return '/inventory/suppliers';
  if (entityName === 'debt_payments' && validEntityId) return `/payments/${validEntityId}`;

  if (entityName === 'sales' || entityName === 'credit_charges') {
    const customerId = typeof newData?.customerId === 'string' ? newData.customerId : null;
    if (customerId && UUID_RE.test(customerId)) return `/customers/${customerId}`;
  }

  return null;
}

export function summarizeUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const clean = ua.trim();
  if (!clean) return null;

  let browser: string | null = null;
  if (/Edg\//i.test(clean) || /Edge\//i.test(clean)) browser = 'Edge';
  else if (/OPR\//i.test(clean) || /Opera/i.test(clean)) browser = 'Opera';
  else if (/Firefox\//i.test(clean)) browser = 'Firefox';
  else if (/Chrome\//i.test(clean) || /CriOS\//i.test(clean)) browser = 'Chrome';
  else if (/Safari\//i.test(clean) && !/Android/i.test(clean)) browser = 'Safari';

  let os: string | null = null;
  if (/iPhone/i.test(clean)) os = 'iPhone';
  else if (/iPad/i.test(clean)) os = 'iPad';
  else if (/Android/i.test(clean)) os = 'Android';
  else if (/Windows/i.test(clean)) os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(clean)) os = 'macOS';
  else if (/Linux/i.test(clean)) os = 'Linux';

  if (browser && os) return `${browser} · ${os}`;
  if (browser) return browser;
  if (os) return os;
  const firstToken = clean.split(' ')[0] ?? clean;
  return firstToken.length > 32 ? `${firstToken.slice(0, 32)}…` : firstToken;
}

export function buildDiffRows(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
  t: AuditTranslator,
): AuditDiffRow[] {
  const keys = Array.from(new Set([...Object.keys(oldData ?? {}), ...Object.keys(newData ?? {})]));
  if (keys.length === 0) return [];

  const mergedContext = { ...(oldData ?? {}), ...(newData ?? {}) };
  const allRows: AuditDiffRow[] = keys
    .map((key) => {
      const before = oldData ? formatAuditFieldValue(key, oldData[key], oldData, t) : null;
      const after = newData ? formatAuditFieldValue(key, newData[key], mergedContext, t) : null;
      return {
        field: key,
        fieldLabel: fieldLabel(key, t),
        before,
        after,
        changed: before !== after,
      };
    })
    .filter((row) => row.before !== null || row.after !== null);

  if (oldData && newData) {
    const changedOnly = allRows.filter((row) => row.changed);
    if (changedOnly.length > 0) return changedOnly;
  }

  return allRows;
}

function strVal(data: Record<string, unknown> | null, key: string): string | null {
  const v = data?.[key];
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

function numVal(data: Record<string, unknown> | null, key: string): number {
  const v = Number(data?.[key] ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function changedFieldList(diffRows: AuditDiffRow[]): string {
  return diffRows
    .map((r) => r.fieldLabel)
    .slice(0, 4)
    .join(', ');
}

function formatPriceDelta(
  oldVal: unknown,
  newVal: unknown,
  t: AuditTranslator,
  currency: Currency = 'PEN',
): string {
  const before = oldVal !== null && oldVal !== undefined ? safeMoney(oldVal, currency) : null;
  const after = newVal !== null && newVal !== undefined ? safeMoney(newVal, currency) : null;
  if (before && after && before !== after) return `${before} → ${after}`;
  return after ?? before ?? '—';
}

function formatTaxSide(data: Record<string, unknown> | null, t: AuditTranslator): string {
  const regime = strVal(data, 'taxRegime');
  const category = strVal(data, 'rusCategory');
  const regimeLabel = regime ? tr(t, `values.taxRegime.${regime}`, regime) : '—';
  if (regime === 'NUEVO_RUS' && category) {
    const catLabel = tr(t, `values.rusCategory.${category}`, category);
    return `${regimeLabel} (${catLabel})`;
  }
  return regimeLabel;
}

export function buildAuditSummary(
  entry: AuditLogEntry,
  diffRows: AuditDiffRow[],
  t: AuditTranslator,
): string {
  const oldD = entry.oldData;
  const newD = entry.newData;
  const currency = asCurrency(newD ?? oldD);

  switch (entry.action) {
    case 'CREATE_CASH_SALE': {
      const methodRaw = strVal(newD, 'paymentMethod') ?? 'CASH';
      return tr(t, 'summaries.cashSale', `${safeMoney(newD?.totalAmount, currency)}`, {
        amount: safeMoney(newD?.totalAmount, currency),
        method: tr(t, `values.paymentMethod.${methodRaw}`, methodRaw),
        count: numVal(newD, 'itemsCount'),
      });
    }
    case 'CREATE_CREDIT_SALE': {
      const installments = newD?.installmentsCount;
      const amount = safeMoney(newD?.totalAmount, currency);
      const balance = safeMoney(newD?.balanceAfter, currency);
      if (typeof installments === 'number' && installments > 0) {
        return tr(t, 'summaries.creditSaleInstallments', `${amount} · ${installments} cuotas`, {
          amount,
          installments,
          balance,
        });
      }
      return tr(t, 'summaries.creditSaleSingle', `${amount} · Al fiado`, { amount, balance });
    }
    case 'REGISTER_PAYMENT': {
      const methodRaw = strVal(newD, 'paymentMethod') ?? 'CASH';
      const receipt = strVal(newD, 'receiptNumber') ?? '—';
      const amount = safeMoney(newD?.amountPaid, currency);
      const method = tr(t, `values.paymentMethod.${methodRaw}`, methodRaw);
      const days = numVal(newD, 'daysLate');
      if (days > 0) {
        return tr(t, 'summaries.registerPaymentLate', `${receipt} · ${amount}`, {
          receipt,
          amount,
          method,
          days,
        });
      }
      return tr(t, 'summaries.registerPayment', `${receipt} · ${amount}`, {
        receipt,
        amount,
        method,
      });
    }
    case 'OBJECT_CHARGE': {
      const note = strVal(newD, 'note') ?? '—';
      return tr(
        t,
        newD?.byCustomer ? 'summaries.objectChargeCustomer' : 'summaries.objectChargeStore',
        note,
        { note },
      );
    }
    case 'CHARGE_CONFIRMED': {
      const note = strVal(newD, 'note') ?? '—';
      return tr(t, 'summaries.chargeConfirmed', note, { note });
    }
    case 'CHARGE_VOIDED':
    case 'VOID_CREDIT_CHARGE': {
      const amount = safeMoney(newD?.voidedAmount ?? newD?.amount, currency);
      const reason = strVal(newD, 'reason') ?? '—';
      return tr(t, 'summaries.chargeVoided', `${amount} · ${reason}`, { amount, reason });
    }
    case 'OPEN_CREDIT_ACCOUNT':
    case 'UPDATE_CREDIT_TERMS': {
      const source = newD ?? oldD;
      const limit = safeMoney(source?.creditLimit, asCurrency(source));
      const cutOff = strVal(source, 'cutOffDay') ?? '—';
      const due = strVal(source, 'paymentDueDay') ?? '—';
      const key =
        entry.action === 'OPEN_CREDIT_ACCOUNT'
          ? 'summaries.openCreditAccount'
          : 'summaries.updateCreditTerms';
      return tr(t, key, limit, { limit, cutOff, due });
    }
    case 'SET_CREDIT_ACCOUNT_STATUS': {
      const bRaw = strVal(oldD, 'status') ?? '—';
      const aRaw = strVal(newD, 'status') ?? '—';
      return tr(t, 'summaries.setCreditAccountStatus', `${bRaw} → ${aRaw}`, {
        before: tr(t, `values.status.${bRaw}`, bRaw),
        after: tr(t, `values.status.${aRaw}`, aRaw),
      });
    }
    case 'CREATE_CUSTOMER': {
      const name = [strVal(newD, 'firstName'), strVal(newD, 'lastName')].filter(Boolean).join(' ');
      const docType = strVal(newD, 'documentType');
      const docNum = strVal(newD, 'documentNumber');
      const doc = [docType, docNum].filter(Boolean).join(' ');
      return tr(t, 'summaries.createCustomer', `${name} · ${doc}`, { name: name || '—', doc });
    }
    case 'UPDATE_CUSTOMER':
      return tr(t, 'summaries.updateCustomer', changedFieldList(diffRows), {
        fields: changedFieldList(diffRows) || '—',
      });
    case 'REACTIVATE_CUSTOMER':
      return tr(t, 'summaries.reactivateCustomer', 'Cuenta reactivada');
    case 'DEACTIVATE_CUSTOMER':
      return tr(t, 'summaries.deactivateCustomer', 'Cuenta desactivada');
    case 'CREATE_PRODUCT': {
      const name = strVal(newD, 'name') ?? '—';
      const cash = safeMoney(newD?.cashPrice, currency);
      const stock = formatQuantity(strVal(newD, 'initialStock') ?? '0');
      return tr(t, 'summaries.createProduct', `${name} · ${cash}`, { name, cash, stock });
    }
    case 'UPDATE_PRODUCT':
      return tr(t, 'summaries.updateProduct', changedFieldList(diffRows), {
        fields: changedFieldList(diffRows) || '—',
      });
    case 'UPDATE_PRICE': {
      const cash = formatPriceDelta(oldD?.cashPrice, newD?.cashPrice, t, currency);
      const credit = formatPriceDelta(oldD?.creditPrice, newD?.creditPrice, t, currency);
      return tr(t, 'summaries.updatePrice', `${cash} · ${credit}`, { cash, credit });
    }
    case 'REACTIVATE_PRODUCT':
    case 'ACTIVATE_PRODUCT':
      return tr(t, 'summaries.reactivateProduct', 'Producto reactivado');
    case 'DEACTIVATE_PRODUCT':
      return tr(t, 'summaries.deactivateProduct', 'Producto desactivado');
    case 'ADJUST_STOCK': {
      const before = formatQuantity(strVal(oldD, 'currentStock') ?? '0');
      const after = formatQuantity(strVal(newD, 'currentStock') ?? '0');
      const reason = strVal(newD, 'reason') ?? '—';
      return tr(t, 'summaries.adjustStock', `${before} → ${after} · ${reason}`, {
        before,
        after,
        reason,
      });
    }
    case 'RECORD_WASTE': {
      const waste = formatQuantity(strVal(newD, 'wasteQuantity') ?? '0');
      const before = formatQuantity(strVal(oldD, 'currentStock') ?? '0');
      const after = formatQuantity(strVal(newD, 'currentStock') ?? '0');
      const reason = strVal(newD, 'reason') ?? '—';
      return tr(t, 'summaries.recordWaste', `${waste} · ${before} → ${after}`, {
        waste,
        before,
        after,
        reason,
      });
    }
    case 'CREATE_SUPPLIER': {
      const name = strVal(newD, 'tradeName') ?? '—';
      const taxId = strVal(newD, 'taxIdNumber') ?? '—';
      return tr(t, 'summaries.createSupplier', `${name} · ${taxId}`, { name, taxId });
    }
    case 'UPDATE_SUPPLIER':
      return tr(t, 'summaries.updateSupplier', changedFieldList(diffRows), {
        fields: changedFieldList(diffRows) || '—',
      });
    case 'REACTIVATE_SUPPLIER':
      return tr(t, 'summaries.reactivateSupplier', 'Proveedor reactivado');
    case 'DEACTIVATE_SUPPLIER':
      return tr(t, 'summaries.deactivateSupplier', 'Proveedor desactivado');
    case 'REGISTER_PURCHASE': {
      const docTypeRaw = strVal(newD, 'documentType') ?? '';
      const docType = docTypeRaw ? tr(t, `values.documentType.${docTypeRaw}`, docTypeRaw) : '';
      const num = [strVal(newD, 'series'), strVal(newD, 'documentNumber')]
        .filter(Boolean)
        .join('-');
      const doc = [docType, num].filter(Boolean).join(' ') || '—';
      const amount = safeMoney(newD?.totalAmount, currency);
      const count = numVal(newD, 'linesCount');
      return tr(t, 'summaries.registerPurchase', `${doc} · ${amount}`, { doc, amount, count });
    }
    case 'GENERATE_REPLENISHMENT_ORDERS':
      return tr(t, 'summaries.generateReplenishment', 'Pedido borrador generado', {
        count: numVal(newD, 'itemsCount'),
      });
    case 'DISCARD_PURCHASE_ORDER':
      return tr(t, 'summaries.discardPurchaseOrder', 'Pedido borrador descartado');
    case 'CREATE_STORE': {
      const name = strVal(newD, 'commercialName') ?? '—';
      const planRaw = strVal(newD, 'planTier') ?? 'CASERO';
      const plan = tr(t, `values.planTier.${planRaw}`, planRaw);
      return tr(t, 'summaries.createStore', `${name} · ${plan}`, { name, plan });
    }
    case 'REACTIVATE_STORE':
      return tr(t, 'summaries.reactivateStore', 'Tienda reactivada');
    case 'SUSPEND_STORE':
      return tr(t, 'summaries.suspendStore', 'Tienda suspendida');
    case 'UPDATE_PAYMENT_DETAILS':
      return tr(t, 'summaries.updatePaymentDetails', changedFieldList(diffRows), {
        fields: changedFieldList(diffRows) || '—',
      });
    case 'UPDATE_TAX_SETTINGS': {
      const before = formatTaxSide(oldD, t);
      const after = formatTaxSide(newD, t);
      return tr(t, 'summaries.updateTaxSettings', `${before} → ${after}`, { before, after });
    }
    case 'INVITE_EMPLOYEE': {
      const name = strVal(newD, 'name') ?? '—';
      const email = strVal(newD, 'email') ?? '—';
      return tr(t, 'summaries.inviteEmployee', `${name} (${email})`, { name, email });
    }
    case 'CANCEL_INVITE': {
      const email = strVal(oldD, 'email') ?? '—';
      return tr(t, 'summaries.cancelInvite', email, { email });
    }
    case 'REACTIVATE_EMPLOYEE':
      return tr(t, 'summaries.reactivateEmployee', 'Empleado reactivado');
    case 'DEACTIVATE_EMPLOYEE':
      return tr(t, 'summaries.deactivateEmployee', 'Empleado desactivado');
    case 'SET_PASSWORD':
      return tr(t, 'summaries.setPassword', 'Contraseña configurada');
    case 'ACCEPT_TERMS': {
      const version = strVal(newD, 'version') ?? '1';
      return tr(t, 'summaries.acceptTerms', `v${version}`, { version });
    }
    case 'LOGIN_FAILED':
      return tr(t, 'summaries.loginFailed', `#${numVal(newD, 'failedLoginAttempts')}`, {
        attempts: numVal(newD, 'failedLoginAttempts'),
      });
    case 'LOGIN_BLOCKED':
      return tr(t, 'summaries.loginBlocked', safeDateTime(newD?.lockedUntil), {
        until: safeDateTime(newD?.lockedUntil),
      });
    case 'LOCK_ACCOUNT':
      return tr(t, 'summaries.lockAccount', safeDateTime(newD?.lockedUntil), {
        attempts: numVal(newD, 'failedLoginAttempts'),
        until: safeDateTime(newD?.lockedUntil),
      });
    case 'START_SUBSCRIPTION_CHECKOUT': {
      const planRaw = strVal(newD, 'planTier') ?? '';
      const intRaw = strVal(newD, 'billingInterval') ?? '';
      const plan = tr(t, `values.planTier.${planRaw}`, planRaw);
      const interval = tr(t, `values.billingInterval.${intRaw}`, intRaw);
      const amount = safeMoney(newD?.amount, currency);
      return tr(t, 'summaries.startCheckout', `${plan} · ${amount}`, { plan, interval, amount });
    }
    case 'SUBSCRIPTION_PAYMENT_APPROVED': {
      const planRaw = strVal(newD, 'planTier') ?? '';
      const plan = tr(t, `values.planTier.${planRaw}`, planRaw);
      const amount = safeMoney(newD?.amount, currency);
      const until = safeDateTime(newD?.currentPeriodEnd);
      return tr(t, 'summaries.subscriptionPaymentApproved', `${plan} · ${amount}`, {
        plan,
        amount,
        until,
      });
    }
    case 'SUBSCRIPTION_PAYMENT_REJECTED': {
      const amount = safeMoney(newD?.amount, currency);
      const until = safeDateTime(newD?.gracePeriodEndsAt);
      return tr(t, 'summaries.subscriptionPaymentRejected', amount, { amount, until });
    }
    case 'SUBSCRIPTION_PAYMENT_REFUNDED': {
      const amount = safeMoney(newD?.amount, currency);
      return tr(t, 'summaries.subscriptionPaymentRefunded', amount, { amount });
    }
    case 'CANCEL_SUBSCRIPTION_RENEWAL': {
      const until = safeDateTime(newD?.currentPeriodEnd);
      return tr(t, 'summaries.cancelRenewal', until, { until });
    }
    case 'EXPIRE_TRIAL':
      return tr(t, 'summaries.expireTrial', 'Fin de prueba Pro');
    case 'EXPIRE_GRACE_PERIOD':
      return tr(t, 'summaries.expireGrace', 'Fin de periodo de gracia');
    case 'COMPLETE_CANCELED_SUBSCRIPTION':
      return tr(t, 'summaries.completeCanceled', 'Fin de periodo pagado');
    default: {
      if (diffRows.length > 0) {
        return diffRows
          .slice(0, 3)
          .map((r) => `${r.fieldLabel}: ${r.after ?? r.before ?? '—'}`)
          .join(' · ');
      }
      return tr(t, 'summaries.noAdditionalDetails', '—');
    }
  }
}

export function presentAuditEntry(entry: AuditLogEntry, t: AuditTranslator): PresentedAuditEntry {
  const diffRows = buildDiffRows(entry.oldData, entry.newData, t);
  const actionLabel = tr(t, `actions.${entry.action}`, entry.action);
  const entityLabel = tr(t, `entities.${entry.entityName}`, entry.entityName);
  const tone = resolveActionTone(entry.action, entry);
  const summary = buildAuditSummary(entry, diffRows, t);
  const actorName = entry.userName ?? tr(t, 'systemActor', 'Sistema');

  return {
    id: entry.id,
    action: entry.action,
    actionLabel,
    entityName: entry.entityName,
    entityLabel,
    entityId: entry.entityId,
    tone,
    summary,
    actorName,
    ipAddress: entry.ipAddress,
    deviceSummary: summarizeUserAgent(entry.userAgent),
    dateTimeLabel: formatDateTime(entry.createdAt),
    dateLabel: formatDate(entry.createdAt),
    timeLabel: formatDateTime(entry.createdAt).split(' · ')[1] ?? '',
    deepLink: resolveDeepLink(entry.entityName, entry.entityId, entry.newData),
    diffRows,
    oldData: entry.oldData,
    newData: entry.newData,
  };
}
