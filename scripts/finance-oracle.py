#!/usr/bin/env python3
"""Oráculo independiente del motor financiero de Quina.

Recalcula, con el módulo `decimal` de Python (precisión 40) y sin compartir
código con la implementación en TypeScript, los resultados esperados de los dos
juegos de datos del informe (docs/quina-financial-engine.md). Las pruebas de
Vitest leen el JSON que genera este script.

Uso:
    python3 -I scripts/finance-oracle.py          # regenera el JSON
    python3 -I scripts/finance-oracle.py --check  # falla si el JSON no coincide
"""

from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal, getcontext
from pathlib import Path

getcontext().prec = 40

OUT = Path(__file__).resolve().parent.parent / 'tests/unit/finance/fixtures/datasets.json'
CENT = Decimal('0.01')
RATE_PLACES = Decimal('1e-20')
PERIOD_DAYS = {'ANNUAL': 360, 'MONTHLY': 30, 'DAILY': 1}
LIMA = timezone(timedelta(hours=-5))


def money(x: Decimal) -> Decimal:
    return x.quantize(CENT, ROUND_HALF_UP)


def text(x: Decimal) -> str:
    return f'{x:.2f}'


def rate_text(x: Decimal) -> str:
    return f'{x.quantize(RATE_PLACES, ROUND_HALF_UP):.20f}'


# --- Tasas -----------------------------------------------------------------


def tea(rate: dict) -> Decimal:
    value = Decimal(rate['value'])
    period_days = PERIOD_DAYS[rate['period']]
    if rate['type'] == 'EFFECTIVE':
        return (1 + value) ** (Decimal(360) / period_days) - 1
    cap_days = PERIOD_DAYS[rate['capitalization']]
    m = Decimal(period_days) / cap_days
    return (1 + value / m) ** (Decimal(360) / cap_days) - 1


def daily(rate: dict) -> Decimal:
    return (1 + tea(rate)) ** (Decimal(1) / 360) - 1


def monthly(rate: dict) -> Decimal:
    return (1 + tea(rate)) ** (Decimal(30) / 360) - 1


def interest(base: Decimal, rate: dict, days: int) -> Decimal:
    if days <= 0:
        return Decimal('0.00')
    return money(base * ((1 + daily(rate)) ** days - 1))


# --- Fechas ----------------------------------------------------------------


def lima_day(instant: str) -> date:
    return datetime.fromisoformat(instant.replace('Z', '+00:00')).astimezone(LIMA).date()


def add_months(d: date, n: int) -> date:
    index = d.year * 12 + (d.month - 1) + n
    return date(index // 12, index % 12 + 1, d.day)


def days_30_360(a: date, b: date) -> int:
    def adjusted(d: date) -> int:
        last_of_feb = d.month == 2 and (d + timedelta(days=1)).month == 3
        return 30 if d.day == 31 or last_of_feb else d.day

    return 360 * (b.year - a.year) + 30 * (b.month - a.month) + adjusted(b) - adjusted(a)


def cycle_for(day: date, cut: int, pay: int) -> tuple[date, date]:
    cut_date = date(day.year, day.month, cut)
    if day.day > cut:
        cut_date = add_months(cut_date, 1)
    due = date(cut_date.year, cut_date.month, pay)
    if pay <= cut:
        due = add_months(due, 1)
    return cut_date, due


# --- Juegos de datos -------------------------------------------------------

BASE_TERMS = {'currency': 'PEN', 'cutOffDay': 20, 'paymentDueDay': 26, 'maxInstallmentMonths': 6}

DATASETS = [
    {
        'id': 'dataset-1',
        'title': 'Juego 1: compra antes del corte, tasas efectivas',
        'terms': {
            **BASE_TERMS,
            'compensatory': {'type': 'EFFECTIVE', 'value': '0.2000', 'period': 'ANNUAL', 'capitalization': None},
            'moratory': {'type': 'EFFECTIVE', 'value': '0.1500', 'period': 'ANNUAL', 'capitalization': None},
        },
        'installmentPurchaseInstant': '2026-09-15T15:00:00.000Z',
    },
    {
        'id': 'dataset-2',
        'title': 'Juego 2: compra después del corte, tasas nominales',
        'terms': {
            **BASE_TERMS,
            'compensatory': {'type': 'NOMINAL', 'value': '0.2400', 'period': 'ANNUAL', 'capitalization': 'MONTHLY'},
            'moratory': {'type': 'NOMINAL', 'value': '0.1500', 'period': 'ANNUAL', 'capitalization': 'DAILY'},
        },
        'installmentPurchaseInstant': '2026-09-22T15:00:00.000Z',
    },
]

PRINCIPAL = Decimal('120.00')
INSTALLMENTS = 3
SINGLE_CHARGES = [
    ('charge-1', '25.50', '2026-09-03T14:00:00.000Z'),
    ('charge-2', '40.00', '2026-09-15T20:00:00.000Z'),
    ('charge-3', '10.00', '2026-09-21T03:30:00.000Z'),  # 20/09 22:30 en Lima: entra al ciclo
]
EXCLUDED_INSTANT = '2026-09-21T05:10:00.000Z'  # 21/09 00:10 en Lima: ciclo siguiente
LATE_PAYMENT_INSTANT = '2026-10-06T15:00:00.000Z'


def rates(terms: dict) -> dict:
    return {
        kind: {
            'tea': rate_text(tea(terms[kind])),
            'daily': rate_text(daily(terms[kind])),
            'monthly': rate_text(monthly(terms[kind])),
        }
        for kind in ('compensatory', 'moratory')
    }


def schedule(principal: Decimal, rate: dict, purchase_instant: str, terms: dict) -> dict:
    day = lima_day(purchase_instant)
    cut, due = cycle_for(day, terms['cutOffDay'], terms['paymentDueDay'])
    grace = days_30_360(day, due)
    capitalized = money(principal * (1 + daily(rate)) ** grace)
    i = monthly(rate)
    factor = (1 + i) ** INSTALLMENTS
    fixed = money(capitalized * i * factor / (factor - 1))
    rows = []
    balance = capitalized
    for k in range(1, INSTALLMENTS + 1):
        row_interest = money(balance * i)
        amortization = balance if k == INSTALLMENTS else fixed - row_interest
        rows.append(
            {
                'number': k,
                'dueDate': add_months(due, k).isoformat(),
                'initialBalance': text(balance),
                'installment': text(amortization + row_interest),
                'interest': text(row_interest),
                'principal': text(amortization),
                'finalBalance': text(balance - amortization),
            }
        )
        balance -= amortization
    return {
        'principal': text(principal),
        'purchaseInstant': purchase_instant,
        'installments': INSTALLMENTS,
        'cycleCutOffDate': cut.isoformat(),
        'cyclePaymentDueDate': due.isoformat(),
        'graceDays': grace,
        'capitalizedAmount': text(capitalized),
        'installmentAmount': text(fixed),
        'rows': rows,
    }


def single_payment_cycle(terms: dict) -> dict:
    cut, due = cycle_for(lima_day(SINGLE_CHARGES[0][2]), terms['cutOffDay'], terms['paymentDueDay'])
    charges = []
    for charge_id, amount, instant in SINGLE_CHARGES:
        days = days_30_360(lima_day(instant), due)
        charges.append(
            {
                'id': charge_id,
                'principal': amount,
                'purchaseInstant': instant,
                'days': days,
                'interest': text(interest(Decimal(amount), terms['compensatory'], days)),
            }
        )
    purchases = sum(Decimal(c['principal']) for c in charges)
    interests = sum(Decimal(c['interest']) for c in charges)
    total = purchases + interests

    late_day = lima_day(LATE_PAYMENT_INSTANT)
    days_late = days_30_360(due, late_day)
    # Mora por línea (Plan 4, decisión P1): cada cargo paga mora sobre su propio
    # exigible con la tasa moratoria que congeló; la mora del ciclo es la suma.
    weights = [Decimal(c['principal']) + Decimal(c['interest']) for c in charges]
    shares = [interest(w, terms['moratory'], days_late) for w in weights]
    moratory = sum(shares, Decimal('0'))

    return {
        'cutOffDate': cut.isoformat(),
        'paymentDueDate': due.isoformat(),
        'excludedPurchaseInstant': EXCLUDED_INSTANT,
        'excludedCycleCutOffDate': cycle_for(
            lima_day(EXCLUDED_INSTANT), terms['cutOffDay'], terms['paymentDueDay']
        )[0].isoformat(),
        'charges': charges,
        'purchasesTotal': text(purchases),
        'compensatoryInterestTotal': text(interests),
        'totalDue': text(total),
        'latePayment': {
            'paymentInstant': LATE_PAYMENT_INSTANT,
            'daysLate': days_late,
            'moratoryInterest': text(moratory),
            'amountDue': text(total + moratory),
            'moratoryShares': [text(s) for s in shares],
            'principalPaid': text(purchases),
            'compensatoryInterestPaid': text(interests),
        },
    }


def build() -> dict:
    datasets = []
    for spec in DATASETS:
        terms = spec['terms']
        datasets.append(
            {
                'id': spec['id'],
                'title': spec['title'],
                'terms': terms,
                'rates': rates(terms),
                'installmentPurchase': schedule(
                    PRINCIPAL, terms['compensatory'], spec['installmentPurchaseInstant'], terms
                ),
                'singlePaymentCycle': single_payment_cycle(terms),
            }
        )
    control_terms = DATASETS[0]['terms']
    control = schedule(PRINCIPAL, control_terms['compensatory'], '2026-09-22T15:00:00.000Z', control_terms)
    return {
        '_generatedBy': 'scripts/finance-oracle.py',
        'datasets': datasets,
        'control': {'terms': control_terms, 'installmentPurchase': control},
    }


def main() -> int:
    content = json.dumps(build(), indent=2, ensure_ascii=False) + '\n'
    if '--check' in sys.argv:
        current = OUT.read_text(encoding='utf-8') if OUT.exists() else ''
        if json.loads(current or '{}') != json.loads(content):
            print(f'{OUT} no coincide con el oráculo. Ejecuta: python3 -I scripts/finance-oracle.py')
            return 1
        print('Fixtures del motor financiero al día.')
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(content, encoding='utf-8')
    print(f'Escrito {OUT}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
