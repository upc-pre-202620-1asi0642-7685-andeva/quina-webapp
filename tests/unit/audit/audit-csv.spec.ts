import { describe, expect, it } from 'vitest';
import { escapeCsvCell, formatAuditCsv } from '@/infrastructure/db/queries/audit';

describe('exportación CSV de auditoría (US18 crit. 6)', () => {
  it('neutraliza inyección de fórmulas y escapa comillas y comas según RFC 4180', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeCsvCell('+cmd|"/c calc"!A0')).toBe('"\'+cmd|""/c calc""!A0"');
    expect(escapeCsvCell('-20')).toBe("'-20");
    expect(escapeCsvCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
    expect(escapeCsvCell('Texto, con "comillas"')).toBe('"Texto, con ""comillas"""');
  });

  it('antepone BOM UTF-8 y formatea filas completas', () => {
    const csv = formatAuditCsv([
      {
        id: 'aud-1',
        userId: 'u-1',
        userName: 'Rosa Quispe',
        action: 'UPDATE_CREDIT_TERMS',
        entityName: 'credit_accounts',
        entityId: 'acc-1',
        oldData: { creditLimit: '100.00' },
        newData: { creditLimit: '200.00' },
        ipAddress: '192.0.2.10',
        createdAt: new Date('2026-11-01T15:00:00.000Z'),
      },
    ]);
    expect(csv.startsWith('\uFEFFfecha_utc,usuario,accion,entidad')).toBe(true);
    expect(csv).toContain('Rosa Quispe,UPDATE_CREDIT_TERMS,credit_accounts,acc-1');
    expect(csv).toContain('"{""creditLimit"":""100.00""}"');
    expect(csv).toContain('"{""creditLimit"":""200.00""}"');
  });
});
