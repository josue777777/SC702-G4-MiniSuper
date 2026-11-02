import { expect } from '@playwright/test';
import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { MAILBOX_DIR } from './env';

/**
 * Buzón de prueba (HU-13): lee los correos que el backend E2E guarda como
 * archivos JSON (`MAIL_TRANSPORT=outbox`), como si se abriera la bandeja.
 */

export interface Email {
  to: string;
  subject: string;
  text: string;
}

/** Vacía el buzón antes de cada prueba. */
export async function clearMailbox(): Promise<void> {
  await rm(MAILBOX_DIR, { recursive: true, force: true });
}

/** Todos los correos que recibió `to`, del más viejo al más nuevo. */
export async function emailsTo(to: string): Promise<Email[]> {
  let files: string[];

  try {
    files = (await readdir(MAILBOX_DIR)).filter((name) => name.endsWith('.json')).sort();
  } catch {
    return [];
  }

  const emails = await Promise.all(
    files.map(
      async (name) => JSON.parse(await readFile(path.join(MAILBOX_DIR, name), 'utf8')) as Email,
    ),
  );

  return emails.filter((email) => email.to === to);
}

/** Espera el correo de `to` cuyo asunto contiene `subject` (el envío va en segundo plano). */
export async function waitForEmail(to: string, subject: string): Promise<Email> {
  let found: Email | undefined;

  await expect
    .poll(
      async () => {
        found = (await emailsTo(to)).filter((email) => email.subject.includes(subject)).at(-1);

        return found !== undefined;
      },
      { message: `No llegó el correo «${subject}» a ${to}`, timeout: 10_000 },
    )
    .toBe(true);

  return found as Email;
}

/** El enlace que trae un correo. */
export function linkIn(email: Email): string {
  const link = email.text.match(/https?:\/\/\S+/)?.[0];

  if (link === undefined) {
    throw new Error(`El correo «${email.subject}» no trae ningún enlace.`);
  }

  return link;
}
