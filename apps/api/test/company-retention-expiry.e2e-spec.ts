import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { AuditService, PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { CompanyDeletionService } from '../src/platform/company-deletion.service';

// Answer 1976, against the real database, on throwaway companies only: a purged company's kept statutory records are
// removed group by group once each group's day has passed (the audit years may be longer than pay or filings), then
// the company and its people once nothing else is left, each with a second certificate. release_company_records
// refuses before the day, under a legal hold, and for an open or never-purged company; the app role still cannot
// remove kept rows itself, nor forge the groups or the permit.
describe('Removing kept records after their day (1976)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let deletions: CompanyDeletionService;
  let owner: PrismaClient;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const run = randomUUID().slice(0, 8);
  const org: Record<'A' | 'H' | 'O' | 'N', string> = { A: '', H: '', O: '', N: '' };
  const users: string[] = [];
  let planId = '';
  // Purging and removing walk every company table: a long transaction, as in the service.
  const sup = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => tenantPrisma.forTenant(SUPER, fn, { timeout: 300_000 });
  const releaseDirect = (id: string) => sup((tx) => tx.$queryRaw<{ out: unknown }[]>`SELECT release_company_records(${id}::uuid) AS out`);
  /** As operations would: the owner's own connection, past the read-only rule. Only the test moves days. */
  const asOwner = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
    owner.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true), set_config('app.retention_release', 'on', true)`;
      return fn(tx);
    }, { timeout: 60_000 });
  const dayAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
  const setGroupDay = (id: string, group: string, day: Date) => asOwner((tx) => tx.$executeRaw`UPDATE company_record_groups SET kept_until = ${day}::date WHERE organization_id = ${id}::uuid AND record_group = ${group}`);
  // Pay and filings rows are seen only with the company's legal entities set (the pay guards).
  const count = (table: string, id: string) =>
    sup(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org', ${id}, true), set_config('app.pay_entities', coalesce((SELECT '{' || string_agg(e.id::text, ',') || '}' FROM legal_entities e WHERE e.organization_id = ${id}::uuid), '{}'), true)`;
      return Number((await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${table}" WHERE organization_id = $1::uuid`, id))[0]!.n);
    });
  const groups = (id: string) => sup((tx) => tx.companyRecordGroup.findMany({ where: { organizationId: id }, orderBy: { recordGroup: 'asc' } }));

  /** A company with a kept audit row (audit), a TDS challan (filings), a legal entity and a person (company). */
  async function company(k: string): Promise<string> {
    const id = (await prisma.organization.create({ data: { name: `Kept ${k} ${run}`, slug: `kept-${k.toLowerCase()}-${run}`, planId } })).id;
    const ctx = { organizationId: id, isSuperAdmin: false };
    const le = await tenantPrisma.forTenant(ctx, async (tx) => {
      const e = await tx.legalEntity.create({ data: { organizationId: id, name: `Entity ${k}`, shortName: `E${k}`, isDefault: true } });
      const u = await tx.user.create({ data: { organizationId: id, email: `admin-${k.toLowerCase()}-${run}@kept.test`, name: `Admin ${k}`, passwordHash: await argon2.hash('Corr3ct-Horse-Battery'), role: 'org_admin' } });
      users.push(u.id);
      await tx.setting.create({ data: { organizationId: id, scopeType: 'tenant', scopeId: id, key: 'leave.send_back', value: 'on' } });
      await AuditService.recordIn(tx, ctx, { actorUserId: u.id, action: 'organization.settings_changed', entityType: 'organization', entityId: id });
      return { entity: e.id, user: u.id };
    });
    await sup(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org', ${id}, true), set_config('app.pay_entities', ${`{${le.entity}}`}, true)`;
      await tx.tdsChallan.create({ data: { organizationId: id, legalEntityId: le.entity, depositMonth: new Date('2026-04-01'), lawVersion: 'v1', tds: 100, updatedBy: le.user } });
    });
    return id;
  }
  /** Closed 60 days ago, a deletion confirmed by a second person, purged: its statutory records are now kept. */
  async function purge(id: string) {
    await sup((tx) => tx.organization.update({ where: { id }, data: { lifecycle: 'closed' } }));
    await sup((tx) => tx.organization.update({ where: { id }, data: { lifecycleChangedAt: dayAgo(60) } }));
    await sup((tx) => tx.companyDeletion.create({ data: { organizationId: id, companyName: id, companySlug: id, reason: 'Kept-records test', requestedBy: randomUUID(), approvedBy: randomUUID() } }));
    await sup((tx) => tx.$queryRaw`SELECT purge_company(${id}::uuid)`);
  }

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    deletions = app.get(CompanyDeletionService);
    owner = new PrismaClient({ datasources: { db: { url: process.env.MIGRATION_DATABASE_URL } } });
    planId = (await prisma.plan.create({ data: { name: `kept-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'H', 'O', 'N'] as const) org[k] = await company(k);
    await purge(org.A);
    await purge(org.H);
    await sup((tx) => tx.organization.update({ where: { id: org.N }, data: { lifecycle: 'closed' } }));
  }, 240_000);

  afterAll(async () => {
    await owner
      .$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true), set_config('app.retention_release', 'on', true), set_config('app.audit_archive', 'on', true)`;
        const ids = Object.values(org);
        await tx.auditLog.deleteMany({ where: { organizationId: { in: ids } } });
        await tx.companyRecordGroup.deleteMany({ where: { organizationId: { in: ids } } });
        await tx.companyDeletion.deleteMany({ where: { organizationId: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: { in: ids } } });
        await tx.user.deleteMany({ where: { id: { in: users } } });
      }, { timeout: 120_000 })
      .catch((e: Error) => console.warn(`cleanup: ${e.message}`));
    await owner.$disconnect();
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('purging writes each kept group with its own day (audit, filings, company), at least 8 years on', async () => {
    const g = await groups(org.A);
    expect(g.map((x) => x.recordGroup)).toEqual(['audit', 'company', 'filings']);
    const in8 = new Date(Date.now() + 8 * 365.25 * 86_400_000).toISOString().slice(0, 7);
    for (const x of g) expect([x.keptUntil.toISOString().slice(0, 7), x.releasedAt]).toEqual([in8, null]);
  });

  it('negative: refused before the day, nothing removed', async () => {
    await expect(releaseDirect(org.A)).rejects.toThrow(/Nothing is due: the kept records stay until/);
    expect(await deletions.releaseExpired(org.A)).toBeNull();
    expect([await count('audit_logs', org.A), await count('tds_challans', org.A), await count('users', org.A)]).toEqual([expect.any(Number), 1, 1]);
    expect(await count('audit_logs', org.A)).toBeGreaterThan(0);
  });

  it('negative: refused under a legal hold, even past the day', async () => {
    await setGroupDay(org.H, 'audit', dayAgo(2));
    await sup((tx) => tx.auditLegalHold.create({ data: { organizationId: org.H, caseRef: 'CASE-K', fromAt: dayAgo(1), toAt: new Date(Date.now() + 365 * 86_400_000), reason: 'Litigation', setBy: randomUUID() } }));
    const before = await count('audit_logs', org.H);
    await expect(releaseDirect(org.H)).rejects.toThrow(/legal hold/);
    expect(await deletions.releaseExpired(org.H)).toBeNull();
    expect(await count('audit_logs', org.H)).toBe(before);
  });

  it('negative: refused for an open company, and for a closed one never purged', async () => {
    await expect(releaseDirect(org.O)).rejects.toThrow(/Only a closed company/);
    await expect(releaseDirect(org.N)).rejects.toThrow(/was not deleted/);
  });

  it('negative: the app role cannot remove kept rows itself, write the groups or the permit, or mark a deletion done by hand', async () => {
    const hold = (sql: Prisma.Sql) => sup(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.retention_release', 'on', true), set_config('app.audit_archive', 'on', true)`;
      return tx.$executeRaw(sql);
    });
    await expect(hold(Prisma.sql`DELETE FROM users WHERE organization_id = ${org.A}::uuid`)).rejects.toThrow(/kept read-only until/);
    // Filings are never deletable by the app at all.
    await expect(hold(Prisma.sql`DELETE FROM tds_challans WHERE organization_id = ${org.A}::uuid`)).rejects.toThrow(/kept read-only until|permission denied/);
    await expect(hold(Prisma.sql`DELETE FROM audit_logs WHERE organization_id = ${org.A}::uuid`)).rejects.toThrow(/kept read-only until|permission denied/);
    await expect(hold(Prisma.sql`INSERT INTO retention_release_grants (txid, organization_id) VALUES (txid_current(), ${org.A}::uuid)`)).rejects.toThrow(/permission denied/);
    await expect(hold(Prisma.sql`UPDATE company_record_groups SET kept_until = '2000-01-01' WHERE organization_id = ${org.A}::uuid`)).rejects.toThrow(/permission denied/);
    await expect(hold(Prisma.sql`INSERT INTO company_record_groups (organization_id, record_group, kept_until) VALUES (${org.N}::uuid, 'audit', '2000-01-01')`)).rejects.toThrow(/permission denied/);
    // A done deletion written by hand (a forged certificate) is refused: only purge_company may write the groups.
    const forged = JSON.stringify({ kept: [{ table: 'audit_logs', keptUntil: '2000-01-01' }] });
    await expect(sup((tx) => tx.companyDeletion.create({ data: { organizationId: org.N, companyName: 'N', companySlug: 'n', reason: 'forged', requestedBy: randomUUID(), approvedBy: randomUUID(), status: 'done', deletedAt: new Date(), certificate: forged, certificateSha256: '0'.repeat(64) } }))).rejects.toThrow(/permission denied/);
    expect([await count('users', org.A), await count('tds_challans', org.A)]).toEqual([1, 1]);
    expect(await groups(org.N)).toEqual([]);
  });

  it('removes only the group whose day has passed, with a second certificate, audited; the next run has nothing due', async () => {
    await setGroupDay(org.A, 'audit', dayAgo(1));
    const out = await deletions.releaseExpired(org.A);
    expect(out).toMatchObject({ released: [{ group: 'audit' }], waiting: [], companyRemoved: false });
    expect(await count('audit_logs', org.A)).toBe(0);
    expect([await count('tds_challans', org.A), await count('users', org.A), await count('legal_entities', org.A)]).toEqual([1, 1, 1]);
    const audit = (await groups(org.A)).find((g) => g.recordGroup === 'audit')!;
    const cert = JSON.parse(audit.certificate!) as { group: string; rows: number; tables: Record<string, number>; company: { id: string }; deletionCertificateSha256: string };
    expect(cert).toMatchObject({ group: 'audit', company: { id: org.A }, deletionCertificateSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(cert.tables.audit_logs).toBeGreaterThan(0);
    expect(audit.certificateSha256).toBe(createHash('sha256').update(audit.certificate!).digest('hex'));
    expect(out!.released[0]!.sha256).toBe(audit.certificateSha256);
    expect(Number(audit.rows)).toBe(cert.rows);
    const logged = await sup((tx) => tx.auditLog.findFirst({ where: { action: 'platform.company.kept_records_removed', entityId: org.A }, orderBy: { createdAt: 'desc' } }));
    expect(logged).toMatchObject({ organizationId: null, actorUserId: null });
    await expect(releaseDirect(org.A)).rejects.toThrow(/Nothing is due/);
  });

  it('two workers at once: the filings group is removed once', async () => {
    await setGroupDay(org.A, 'filings', dayAgo(1));
    const [a, b] = await Promise.all([deletions.releaseExpired(org.A), deletions.releaseExpired(org.A)]);
    const done = [a, b].filter(Boolean);
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ released: [{ group: 'filings', rows: 1 }] });
    expect(await count('tds_challans', org.A)).toBe(0);
    expect(await count('users', org.A)).toBe(1);
  });

  it('the nightly sweep removes the company and its people last, once its own day has passed', async () => {
    await setGroupDay(org.A, 'company', dayAgo(1));
    await asOwner((tx) => tx.organization.update({ where: { id: org.A }, data: { recordsKeptUntil: dayAgo(1) } }));
    const swept = await deletions.releaseSweep();
    expect(swept.released).toBeGreaterThanOrEqual(1);
    expect(await sup((tx) => tx.organization.findUnique({ where: { id: org.A } }))).toBeNull();
    expect([await count('users', org.A), await count('legal_entities', org.A)]).toEqual([0, 0]);
    const g = await groups(org.A);
    expect(g.every((x) => x.releasedAt && x.certificateSha256)).toBe(true);
    const last = JSON.parse(g.find((x) => x.recordGroup === 'company')!.certificate!) as { tables: Record<string, number> };
    expect(last.tables).toMatchObject({ organizations: 1, users: 1, legal_entities: 1 });
    // The deletion's own record outlives the company; H (legal hold) was left alone by the sweep.
    expect(await sup((tx) => tx.companyDeletion.count({ where: { organizationId: org.A, status: 'done' } }))).toBe(1);
    expect(await count('audit_logs', org.H)).toBeGreaterThan(0);
    await expect(releaseDirect(org.A)).rejects.toThrow(/No such company/);
  });
});
