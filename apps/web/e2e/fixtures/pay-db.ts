import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

// Direct database set-up for the payroll e2e (same database as the API under test).

function databaseUrl(): string {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const env = readFileSync(join(__dirname, '../../../api/.env'), 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('Set E2E_DATABASE_URL or DATABASE_URL in apps/api/.env');
  return line.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
}

/** Opens the tax-proof window from 1 April for every legal entity of the company (the company setting HR would change). */
export async function openProofWindow(orgSlug: string): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const org = await tx.organization.findFirstOrThrow({ where: { slug: orgSlug }, select: { id: true } });
      const entities = await tx.legalEntity.findMany({ where: { organizationId: org.id }, select: { id: true } });
      await tx.setting.deleteMany({ where: { organizationId: org.id, scopeType: 'legal_entity', key: 'tax.proof_window_opens' } });
      await tx.setting.createMany({ data: entities.map((e) => ({ organizationId: org.id, scopeType: 'legal_entity', scopeId: e.id, key: 'tax.proof_window_opens', value: '04-01' })) });
    });
  } finally {
    await prisma.$disconnect();
  }
}
