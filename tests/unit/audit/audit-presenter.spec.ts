import { describe, expect, it } from 'vitest';
import {
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_ACTIONS,
  AUDIT_ENTITY_NAMES,
  type AuditLogEntry,
} from '@/infrastructure/db/queries/audit';
import {
  buildDiffRows,
  presentAuditEntry,
  resolveActionTone,
  resolveDeepLink,
  summarizeUserAgent,
  type AuditTranslator,
} from '@/presentation/lib/audit-presenter';

const TEST_MESSAGES: Record<string, string> = {
  systemActor: 'Sistema',
  'actions.CREATE_CASH_SALE': 'Venta al contado',
  'actions.CREATE_CREDIT_SALE': 'Venta al fiado',
  'actions.REGISTER_PAYMENT': 'Cobro de deuda',
  'actions.OBJECT_CHARGE': 'Cargo observado',
  'actions.CHARGE_CONFIRMED': 'Cargo confirmado',
  'actions.CHARGE_VOIDED': 'Anulación de cargo',
  'actions.UPDATE_CREDIT_TERMS': 'Cambio de condiciones de fiado',
  'actions.SET_CREDIT_ACCOUNT_STATUS': 'Cambio de estado de cuenta',
  'actions.CREATE_CUSTOMER': 'Alta de vecino',
  'actions.UPDATE_PRICE': 'Cambio de precio',
  'actions.ADJUST_STOCK': 'Ajuste de inventario',
  'actions.RECORD_WASTE': 'Registro de merma',
  'actions.REGISTER_PURCHASE': 'Registro de compra',
  'actions.UPDATE_TAX_SETTINGS': 'Cambio de régimen tributario',
  'actions.SUBSCRIPTION_PAYMENT_APPROVED': 'Pago de suscripción aprobado',
  'actions.LOCK_ACCOUNT': 'Bloqueo de cuenta por seguridad',
  'entities.sales': 'Ventas',
  'entities.debt_payments': 'Cobros',
  'entities.credit_accounts': 'Cuentas de fiado',
  'entities.credit_charges': 'Cargos de fiado',
  'entities.customers': 'Vecinos',
  'entities.products': 'Productos',
  'entities.purchases': 'Compras',
  'entities.stores': 'Tienda',
  'entities.store_subscriptions': 'Suscripción',
  'entities.users': 'Usuarios',
  'fields.cashPrice': 'Precio al contado',
  'fields.creditPrice': 'Precio al fiado',
  'fields.currentStock': 'Stock actual',
  'fields.wasteQuantity': 'Cantidad de merma',
  'fields.reason': 'Motivo',
  'fields.creditLimit': 'Límite de fiado',
  'fields.compensatory': 'Tasa compensatoria',
  'fields.moratory': 'Tasa moratoria',
  'fields.taxRegime': 'Régimen tributario',
  'fields.rusCategory': 'Categoría RUS',
  'fields.voidedAmount': 'Monto anulado',
  'fields.status': 'Estado',
  'fields.consentStatus': 'Conformidad',
  'fields.planTier': 'Plan',
  'fields.amount': 'Monto',
  'fields.currentPeriodEnd': 'Fin del periodo',
  'values.bool.true': 'Sí',
  'values.bool.false': 'No',
  'values.paymentMethod.YAPE': 'Yape',
  'values.documentType.FACTURA': 'Factura',
  'values.planTier.BODEGA_PRO': 'Bodega Pro',
  'values.taxRegime.NUEVO_RUS': 'Nuevo RUS',
  'values.rusCategory.1': 'Categoría 1',
  'values.rusCategory.2': 'Categoría 2',
  'values.status.ACTIVE': 'Activa',
  'values.status.BLOCKED': 'Bloqueada',
  'values.status.PENDING': 'Pendiente',
  'values.consentStatus.OBJECTED': 'Observado',
  'values.rateType.EFFECTIVE': 'Efectiva',
  'values.rateType.NOMINAL': 'Nominal',
  'values.ratePeriod.ANNUAL': 'anual',
  'values.ratePeriod.MONTHLY': 'mensual',
  'values.rateEffective': '{type} {percent} % ({period})',
  'values.rateNominal': '{type} {percent} % ({period}, cap. {cap})',
  'summaries.cashSale': '{amount} · {method} · {count} productos',
  'summaries.updatePrice': 'Contado {cash} · Fiado {credit}',
  'summaries.recordWaste': 'Merma de {waste} · Stock {before} → {after} · {reason}',
  'summaries.registerPurchase': '{doc} · {amount} · {count} líneas',
  'summaries.updateTaxSettings': '{before} → {after}',
  'summaries.chargeVoided': 'Anulado {amount} · {reason}',
  'summaries.subscriptionPaymentApproved': 'Plan {plan} · {amount} · Hasta {until}',
  'summaries.setCreditAccountStatus': 'Estado: {before} → {after}',
};

const t: AuditTranslator = Object.assign(
  (key: string, values?: Record<string, string | number>) => {
    let template = TEST_MESSAGES[key] ?? key;
    if (values) {
      for (const [k, v] of Object.entries(values)) {
        template = template.replaceAll(`{${k}}`, String(v));
      }
    }
    return template;
  },
  {
    has: (key: string) => key in TEST_MESSAGES,
  },
);

function makeEntry(overrides: Partial<AuditLogEntry>): AuditLogEntry {
  return {
    id: 'aud-1',
    userId: '11111111-1111-4111-8111-111111111111',
    userName: 'Rosa Quispe',
    action: 'CREATE_CASH_SALE',
    entityName: 'sales',
    entityId: '22222222-2222-4222-8222-222222222222',
    oldData: null,
    newData: null,
    ipAddress: '190.12.1.10',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36',
    createdAt: new Date('2026-11-15T15:00:00.000Z'),
    ...overrides,
  };
}

describe('presentador de auditoría', () => {
  it('incluye store_subscriptions y todas las categorías canónicas', () => {
    expect(AUDIT_ENTITY_NAMES).toContain('store_subscriptions');
    expect(AUDIT_CATEGORIES).toEqual([
      'sales_credit',
      'inventory',
      'team_store',
      'security',
      'billing',
    ]);
  });

  it('asigna un tono semántico válido a todas las acciones del repositorio', () => {
    const validTones = new Set(['error', 'amber', 'success', 'soft', 'neutral']);
    for (const cat of AUDIT_CATEGORIES) {
      for (const action of AUDIT_CATEGORY_ACTIONS[cat]) {
        const tone = resolveActionTone(action, { newData: { status: 'BLOCKED' } });
        expect(validTones.has(tone)).toBe(true);
      }
    }
    expect(resolveActionTone('CHARGE_VOIDED')).toBe('error');
    expect(resolveActionTone('OBJECT_CHARGE')).toBe('amber');
    expect(resolveActionTone('CHARGE_CONFIRMED')).toBe('success');
    expect(resolveActionTone('SET_PASSWORD')).toBe('soft');
    expect(resolveActionTone('SET_CREDIT_ACCOUNT_STATUS', { newData: { status: 'BLOCKED' } })).toBe(
      'error',
    );
    expect(resolveActionTone('SET_CREDIT_ACCOUNT_STATUS', { newData: { status: 'ACTIVE' } })).toBe(
      'success',
    );
  });

  it('formatea dinero, cantidades, tasas y fechas de Lima sin JSON crudo', () => {
    const wasteEntry = presentAuditEntry(
      makeEntry({
        action: 'RECORD_WASTE',
        entityName: 'products',
        oldData: { currentStock: '10.000' },
        newData: {
          currentStock: '9.000',
          wasteQuantity: '1.000',
          reason: 'Botella rota',
        },
      }),
      t,
    );

    expect(wasteEntry.tone).toBe('error');
    expect(wasteEntry.summary).toBe('Merma de 1 · Stock 10 → 9 · Botella rota');
    expect(wasteEntry.summary).not.toContain('{');
    expect(wasteEntry.dateTimeLabel).toBe('15 nov 2026 · 10:00 a. m.');
    expect(wasteEntry.deviceSummary).toBe('Chrome · Windows');
    expect(wasteEntry.deepLink).toBe('/inventory/22222222-2222-4222-8222-222222222222');

    const priceEntry = presentAuditEntry(
      makeEntry({
        action: 'UPDATE_PRICE',
        entityName: 'products',
        oldData: { cashPrice: '9.00', creditPrice: '10.00', name: 'Aceite' },
        newData: { cashPrice: '9.50', creditPrice: '10.00', name: 'Aceite' },
      }),
      t,
    );
    expect(priceEntry.summary).toContain('S/ 9.00 → S/ 9.50');
    expect(priceEntry.diffRows).toHaveLength(1);
    expect(priceEntry.diffRows[0]).toMatchObject({
      field: 'cashPrice',
      before: 'S/ 9.00',
      after: 'S/ 9.50',
      changed: true,
    });
  });

  it('formatea tasas nominales y efectivas en condiciones de crédito', () => {
    const rows = buildDiffRows(
      {
        creditLimit: '100.00',
        compensatory: {
          type: 'EFFECTIVE',
          value: '0.2000',
          period: 'ANNUAL',
          capitalization: null,
        },
      },
      {
        creditLimit: '1500.00',
        compensatory: {
          type: 'NOMINAL',
          value: '0.1800',
          period: 'ANNUAL',
          capitalization: 'MONTHLY',
        },
      },
      t,
    );

    expect(rows).toEqual([
      {
        field: 'creditLimit',
        fieldLabel: 'Límite de fiado',
        before: 'S/ 100.00',
        after: 'S/ 1,500.00',
        changed: true,
      },
      {
        field: 'compensatory',
        fieldLabel: 'Tasa compensatoria',
        before: 'Efectiva 20.00 % (anual)',
        after: 'Nominal 18.00 % (anual, cap. mensual)',
        changed: true,
      },
    ]);
  });

  it('resuelve deep links seguros por entidad y omite IDs inválidos', () => {
    const id = '33333333-3333-4333-8333-333333333333';
    expect(resolveDeepLink('customers', id, null)).toBe(`/customers/${id}`);
    expect(resolveDeepLink('products', id, null)).toBe(`/inventory/${id}`);
    expect(resolveDeepLink('purchases', id, null)).toBe(`/inventory/purchases/${id}`);
    expect(resolveDeepLink('debt_payments', id, null)).toBe(`/payments/${id}`);
    expect(resolveDeepLink('sales', id, { customerId: id })).toBe(`/customers/${id}`);
    expect(resolveDeepLink('customers', 'not-a-uuid', null)).toBeNull();
    expect(resolveDeepLink('stores', id, null)).toBeNull();
  });

  it('resume User-Agent de navegadores comunes de forma legible', () => {
    expect(
      summarizeUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari · iPhone');
    expect(
      summarizeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/130.0.0.0',
      ),
    ).toBe('Edge · Windows');
    expect(summarizeUserAgent(null)).toBeNull();
  });
});
