import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { EmailAddress } from '@/core/domain/identity/email-address';
import { PersonName } from '@/core/domain/identity/person-name';
import type { AccountSetupTokens } from '@/core/domain/ports/account-setup';
import type { NotificationMailer } from '@/core/domain/ports/notification-mailer';
import type { SeatGuard, TeamRepository } from '@/core/domain/ports/team-repository';
import type { Locale } from '@/core/domain/shared/locale';
import { err, ok, type Result } from '@/core/domain/shared/result';

/** Límite de usuarios del plan que rige hoy (la prueba cuenta como Pro). */
export function seatGuard(now: Date): SeatGuard {
  return (subscription, seats) =>
    PlanLimits.canAdd(PlanLimits.effectiveTier(subscription, now), 'users', seats);
}

/** Datos para el correo con el enlace; la URL la arma la capa web. */
export type SetupMail = {
  storeName: string;
  locale: Locale;
  setupUrl: (token: string) => string;
};

type MemberCommand = { storeId: string; actorId: string; userId: string; now: Date };

export type InviteEmployeeError =
  'NAME_INVALID' | 'EMAIL_INVALID' | 'EMAIL_TAKEN' | 'PLAN_LIMIT_REACHED';

export class InviteEmployeeUseCase {
  constructor(
    private readonly team: TeamRepository,
    private readonly tokens: AccountSetupTokens,
    private readonly mailer: NotificationMailer,
  ) {}

  async execute(
    command: {
      storeId: string;
      actorId: string;
      name: string;
      email: string;
      now: Date;
    } & SetupMail,
  ): Promise<Result<{ userId: string; mailSent: boolean }, InviteEmployeeError>> {
    const name = PersonName.parse(command.name);
    if (!name.ok) return err('NAME_INVALID');
    const email = EmailAddress.parse(command.email);
    if (!email.ok) return email;

    const created = await this.team.invite({
      storeId: command.storeId,
      actorId: command.actorId,
      name: name.value,
      email: email.value,
      locale: command.locale,
      canAdd: seatGuard(command.now),
      now: command.now,
    });
    if (typeof created === 'string') return err(created);

    const mailSent = await sendSetupLink(this.tokens, this.mailer, {
      ...command,
      userId: created.userId,
      name: name.value,
      email: email.value,
    });
    return ok({ userId: created.userId, mailSent });
  }
}

export class ResendInviteUseCase {
  constructor(
    private readonly team: TeamRepository,
    private readonly tokens: AccountSetupTokens,
    private readonly mailer: NotificationMailer,
  ) {}

  async execute(
    command: MemberCommand & SetupMail,
  ): Promise<Result<void, 'NOT_FOUND' | 'MAIL_FAILED'>> {
    const invited = await this.team.findInvited(command.storeId, command.userId);
    if (!invited) return err('NOT_FOUND');
    const sent = await sendSetupLink(this.tokens, this.mailer, { ...command, ...invited });
    return sent ? ok(undefined) : err('MAIL_FAILED');
  }
}

export class CancelInviteUseCase {
  constructor(private readonly team: TeamRepository) {}

  async execute(command: MemberCommand): Promise<Result<void, 'NOT_FOUND'>> {
    const result = await this.team.cancelInvite(command);
    return result === 'OK' ? ok(undefined) : err(result);
  }
}

export class SetEmployeeActiveUseCase {
  constructor(private readonly team: TeamRepository) {}

  async execute(
    command: MemberCommand & { active: boolean },
  ): Promise<Result<void, 'NOT_FOUND' | 'PLAN_LIMIT_REACHED'>> {
    const result = await this.team.setActive({ ...command, canAdd: seatGuard(command.now) });
    return result === 'OK' ? ok(undefined) : err(result);
  }
}

/** Un enlace nuevo anula el anterior; un fallo de correo no deshace la invitación (D8). */
async function sendSetupLink(
  tokens: AccountSetupTokens,
  mailer: NotificationMailer,
  data: SetupMail & { storeId: string; userId: string; name: string; email: string; now: Date },
): Promise<boolean> {
  const token = await tokens.issue(data.userId, data.now);
  try {
    await mailer.sendAccountSetup(
      {
        to: data.email,
        locale: data.locale,
        audience: 'employee',
        name: data.name,
        storeName: data.storeName,
        url: data.setupUrl(token),
      },
      { storeId: data.storeId, userId: data.userId },
    );
    return true;
  } catch {
    return false;
  }
}
