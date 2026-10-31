import { describe, expect, it } from 'vitest';
import { InviteEmployeeUseCase, seatGuard } from '@/core/application/team/manage-team';
import type { Subscription } from '@/core/domain/billing/plan-limits';
import type { AccountSetupTokens } from '@/core/domain/ports/account-setup';
import type { NotificationMailer } from '@/core/domain/ports/notification-mailer';
import type { InviteData, TeamRepository } from '@/core/domain/ports/team-repository';

const NOW = new Date('2026-11-15T15:00:00Z');

class FakeTeam implements TeamRepository {
  invited: InviteData[] = [];
  async invite(data: InviteData) {
    this.invited.push(data);
    return { userId: 'u-1' };
  }
  async findInvited() {
    return null;
  }
  async cancelInvite() {
    return 'OK' as const;
  }
  async setActive() {
    return 'OK' as const;
  }
}

const tokens: AccountSetupTokens = { issue: async () => 'token-1' };
const failingMailer: NotificationMailer = {
  sendCustomerWelcome: async () => {},
  sendAccountSetup: async () => {
    throw new Error('Resend caído');
  },
};

const command = {
  storeId: 's-1',
  actorId: 'o-1',
  name: '  Rosa   Quispe ',
  email: ' Rosa@Correo.PE ',
  now: NOW,
  storeName: 'Bodega',
  locale: 'es' as const,
  setupUrl: (token: string) => `https://x.test/${token}`,
};

describe('invitar empleado (US05)', () => {
  it('normaliza nombre y correo, y no deshace la invitación si el correo falla', async () => {
    const team = new FakeTeam();
    const result = await new InviteEmployeeUseCase(team, tokens, failingMailer).execute(command);
    expect(result).toEqual({ ok: true, value: { userId: 'u-1', mailSent: false } });
    expect(team.invited[0]).toMatchObject({ name: 'Rosa Quispe', email: 'rosa@correo.pe' });
  });

  it('rechaza nombres y correos inválidos sin tocar la base', async () => {
    const team = new FakeTeam();
    const useCase = new InviteEmployeeUseCase(team, tokens, failingMailer);
    expect(await useCase.execute({ ...command, name: 'R2' })).toEqual({
      ok: false,
      error: 'NAME_INVALID',
    });
    expect(await useCase.execute({ ...command, email: 'rosa@' })).toEqual({
      ok: false,
      error: 'EMAIL_INVALID',
    });
    expect(team.invited).toHaveLength(0);
  });
});

describe('cupos de usuarios (US26)', () => {
  const sub = (s: Partial<Subscription>): Subscription => ({
    planTier: 'BODEGA_PRO',
    status: 'ACTIVE',
    trialEndsAt: null,
    ...s,
  });

  it('cuenta la prueba vigente como Pro y la vencida como Casero', () => {
    const guard = seatGuard(NOW);
    const trial = { status: 'TRIALING' as const, trialEndsAt: new Date('2026-11-20T00:00:00Z') };
    expect(guard(sub(trial), 2)).toBe(true);
    expect(guard(sub({ ...trial, trialEndsAt: new Date('2026-11-01T00:00:00Z') }), 1)).toBe(false);
    expect(guard(sub({ planTier: 'NEGOCIO_PLUS' }), 40)).toBe(true);
  });
});
