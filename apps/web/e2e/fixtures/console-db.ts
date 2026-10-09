import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

// Direct database set-up for the platform console e2e, against the same database the API under test uses
// (apps/api/.env DATABASE_URL, or E2E_DATABASE_URL). Only for things no screen does: a fresh staff account, and a
// password for the company admin the console just invited (instead of opening the invite email).

function databaseUrl(): string {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const env = readFileSync(join(__dirname, '../../../api/.env'), 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('Set E2E_DATABASE_URL or DATABASE_URL in apps/api/.env');
  return line.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });

/** Runs `fn` with the platform RLS bypass for this transaction only. */
function asPlatform<T>(fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  });
}

export async function createStaff(email: string, password: string): Promise<string> {
  const passwordHash = await argon2.hash(password);
  return (await asPlatform((tx) => tx.user.create({ data: { email, name: 'E2E Staff', passwordHash, role: 'super_admin', organizationId: null } }))).id;
}

export async function setCompanyAdminPassword(email: string, password: string): Promise<void> {
  const passwordHash = await argon2.hash(password);
  const { count } = await asPlatform((tx) => tx.user.updateMany({ where: { email, role: 'org_admin' }, data: { passwordHash } }));
  if (count !== 1) throw new Error(`Expected one company admin ${email}, found ${count}`);
}

/** Removes what the run created: its company (with its support sessions and people) and the staff account. */
export async function cleanUp(staffId: string | null, companySlug: string): Promise<void> {
  await asPlatform(async (tx) => {
    const org = await tx.organization.findUnique({ where: { slug: companySlug }, select: { id: true } });
    if (org) {
      await tx.session.deleteMany({ where: { user: { organizationId: org.id } } });
      await tx.organization.delete({ where: { id: org.id } });
    }
    if (staffId) {
      await tx.refreshToken.deleteMany({ where: { userId: staffId } });
      await tx.session.deleteMany({ where: { userId: staffId } });
      await tx.user.delete({ where: { id: staffId } }).catch(() => undefined);
    }
  }).catch(() => undefined);
  await prisma.$disconnect();
}

/**
 * An approved support session (P02 Q8) for `staffEmail` in the company named `companyName`, starting now, as if its
 * System Admin had approved it: for e2e specs that drive pages inside a company and are not about the approval.
 */
export async function approvedSupportSession(staffEmail: string, companyName: string, hours = 1): Promise<void> {
  await asPlatform(async (tx) => {
    const staff = await tx.user.findFirstOrThrow({ where: { email: staffEmail, organizationId: null, role: 'super_admin' } });
    const org = await tx.organization.findFirstOrThrow({ where: { name: companyName } });
    const admin = await tx.user.findFirstOrThrow({ where: { organizationId: org.id, role: 'org_admin' } });
    await tx.supportSession.updateMany({ where: { organizationId: org.id, requestedBy: staff.id, status: { in: ['requested', 'approved'] } }, data: { status: 'expired' } }).catch(() => undefined);
    const now = new Date();
    await tx.supportSession.create({
      data: {
        organizationId: org.id, requestedBy: staff.id, requestedByName: staff.name ?? staff.email, requestedByEmail: staff.email, reason: 'End-to-end test of the company pages', hours,
        status: 'approved', decidedBy: admin.id, decidedByName: admin.name ?? admin.email, decidedAt: now, startsAt: now, endsAt: new Date(now.getTime() + hours * 3_600_000),
      },
    });
  });
}
