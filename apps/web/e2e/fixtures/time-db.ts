import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

// Direct database set-up for the time e2e (same database as the API under test): mark a person's open sessions as
// freshly stepped up (what a passkey or authenticator check does), so the lock / unlock actions can run headless.

function databaseUrl(): string {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const env = readFileSync(join(__dirname, '../../../api/.env'), 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('Set E2E_DATABASE_URL or DATABASE_URL in apps/api/.env');
  return line.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
}

export async function stepUp(email: string): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const users = await tx.user.findMany({ where: { email }, select: { id: true } });
      await tx.session.updateMany({ where: { userId: { in: users.map((u) => u.id) }, revokedAt: null }, data: { assuranceLevel: 'aal2', mfaVerifiedAt: new Date(), mfaMethod: 'totp' } });
    });
  } finally {
    await prisma.$disconnect();
  }
}
