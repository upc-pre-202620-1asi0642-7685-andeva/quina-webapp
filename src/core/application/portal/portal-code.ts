import type { DocumentId } from '@/core/domain/identity/document-id';
import type { PortalCodes, PortalDirectory } from '@/core/domain/ports/portal-directory';
import { err, ok, type Result } from '@/core/domain/shared/result';

/** D4: como máximo un código por correo cada 60 s. */
export const CODE_COOLDOWN_MS = 60_000;

/**
 * US14.4: manda un código a cada correo distinto registrado con el documento.
 * No devuelve nada: la pantalla responde siempre lo mismo, exista o no.
 */
export class RequestPortalCodeUseCase {
  constructor(
    private readonly directory: PortalDirectory,
    private readonly codes: PortalCodes,
  ) {}

  async execute(input: { document: DocumentId; now: Date }): Promise<void> {
    const emails = await this.directory.emailsForDocument(input.document);
    for (const email of emails) {
      const last = await this.codes.lastSentAt(email);
      if (last && input.now.getTime() - last.getTime() < CODE_COOLDOWN_MS) continue;
      await this.codes.send(email);
    }
  }
}

/** US14.4: encuentra el correo al que se mandó ese código, sin bloquear a los demás (D6). */
export class VerifyPortalCodeUseCase {
  constructor(
    private readonly directory: PortalDirectory,
    private readonly codes: PortalCodes,
  ) {}

  async execute(input: {
    document: DocumentId;
    code: string;
  }): Promise<Result<{ email: string }, 'CODE_INVALID'>> {
    if (!/^\d{6}$/.test(input.code)) return err('CODE_INVALID');
    const emails = await this.directory.emailsForDocument(input.document);
    if (emails.length === 0) return err('CODE_INVALID');
    const email = await this.codes.emailForCode(emails, input.code);
    if (!email) {
      await this.codes.recordFailure(emails);
      return err('CODE_INVALID');
    }
    return ok({ email });
  }
}
