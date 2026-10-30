import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AuthMailKind } from '@/core/domain/ports/auth-mailer';
import type { OutboxMail } from '@/infrastructure/email/outbox-auth-mailer';

export type { OutboxMail };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Devuelve el correo más reciente para `to` y `kind`; reintenta cada 100 ms hasta `timeoutMs`. */
export async function readLatestMail(
  to: string,
  kind: AuthMailKind,
  options: { dir?: string; timeoutMs?: number } = {},
): Promise<OutboxMail> {
  const dir = options.dir ?? path.join(process.cwd(), '.outbox');
  const timeoutMs = options.timeoutMs ?? 5000;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const found = await findLatest(dir, to, kind);
    if (found) return found;
    if (Date.now() >= deadline) {
      throw new Error(`No ${kind} mail for ${to} appeared in ${dir} within ${timeoutMs} ms`);
    }
    await sleep(100);
  }
}

async function findLatest(
  dir: string,
  to: string,
  kind: AuthMailKind,
): Promise<OutboxMail | undefined> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return undefined;
  }
  const names = files
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();
  for (const name of names) {
    try {
      const mail = JSON.parse(await readFile(path.join(dir, name), 'utf8')) as OutboxMail;
      if (mail.to === to && mail.kind === kind) return mail;
    } catch {
      // archivo a medio escribir: se reintenta en la siguiente vuelta
    }
  }
  return undefined;
}
