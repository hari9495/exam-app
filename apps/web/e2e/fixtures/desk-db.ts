import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

// Direct database set-up for the Service Desk console e2e (same database as the API under test): link a fresh staff
// account to a YukthiX Support desk user in the platform tenant (what the support lead does once per new hire), and
// take the link away again afterwards.

function databaseUrl(): string {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const env = readFileSync(join(__dirname, '../../../api/.env'), 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('Set E2E_DATABASE_URL or DATABASE_URL in apps/api/.env');
  return line.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });

function asPlatform<T>(fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true), set_config('app.sd_system', 'on', true)`;
    return fn(tx);
  });
}

export async function linkConsoleAgent(staffUserId: string, name: string): Promise<void> {
  await asPlatform(async (tx) => {
    const platform = await tx.organization.findFirstOrThrow({ where: { isPlatform: true }, select: { id: true } });
    const bridge = await tx.sdSupportBridge.findUniqueOrThrow({ where: { organizationId: platform.id } });
    const user = await tx.user.create({ data: { organizationId: platform.id, email: `${staffUserId.slice(0, 8)}@yukthix.test`, name, passwordHash: '!console-only', role: 'panel', status: 'console_only' } });
    await tx.sdConsoleAgent.create({ data: { organizationId: platform.id, staffUserId, userId: user.id } });
    await tx.sdDeskMember.create({ data: { organizationId: platform.id, deskId: bridge.deskId, userId: user.id, role: 'lead', validFrom: new Date('2026-01-01') } });
  });
}

/** Ends the seat and the link (the platform user stays: their replies on tickets keep their author). */
export async function unlinkConsoleAgent(staffUserId: string): Promise<void> {
  await asPlatform(async (tx) => {
    const link = await tx.sdConsoleAgent.findFirst({ where: { staffUserId } });
    if (!link) return;
    await tx.sdDeskMember.updateMany({ where: { organizationId: link.organizationId, userId: link.userId, validTo: null }, data: { validTo: new Date('2025-12-31') } });
    await tx.sdConsoleAgent.deleteMany({ where: { staffUserId } });
    // Their support requests are withdrawn, and the account can never sign in again if it cannot be deleted.
    await tx.supportSession.updateMany({ where: { requestedBy: staffUserId, status: 'requested' }, data: { status: 'cancelled' } });
    await tx.user.update({ where: { id: staffUserId }, data: { status: 'disabled', passwordHash: '!e2e-ended' } });
  }).catch(() => undefined);
  await prisma.$disconnect();
}
