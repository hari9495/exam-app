import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { RecycleBinRetentionService } from '../src/recycle-bin/recycle-bin-retention.service';

// Batch B item 3 (admin B2, answers 2367-2369), against the real database (forced RLS, app role): a deleted designation
// lands in the company's recycle bin, comes back with its own id, refuses to come back over a new record of the same
// name, is deleted for good only after a step-up, and goes after the company's keep days; other roles and other
// companies are refused; bad input is a 400 and changes nothing.
describe('Batch B: the YukthiX recycle bin', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org: Record<string, string> = {};
  let planId = '';
  const api = (who: string, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  type Item = { id: string; source: string; kind: string; label: string; deletedBy: string | null; purgeOn: string };
  const items = async (who: string) => (await api(who, 'get', '/recycle-bin/items').expect(200)).body as { keepDays: number; items: Item[] };
  const designation = async (who: string, name: string) => (await api(who, 'post', '/org/masters/designations').send({ name }).expect(201)).body.id as string;
  const binOf = async (who: string, label: string) => (await items(who)).items.find((i) => i.label === label);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A!, isSuperAdmin: false }, fn);

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `rb-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B']) {
      const slug = `rb-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `RB ${k} ${run}`, slug, planId } })).id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k]!, isSuperAdmin: false }, fn);
      const people: [string, string[]][] = k === 'A' ? [['hr', ['org.settings.manage', 'org.structure.view']], ['plain', ['org.structure.view']]] : [['hr', ['org.settings.manage', 'org.structure.view']]];
      for (const [who, keys] of people) {
        const permissionProfileId = (await at((tx) => tx.permissionProfile.create({ data: { organizationId: org[k]!, name: `${who}-${k}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
        const email = `${who}-${k.toLowerCase()}-${run}@rb.test`;
        const id = `${who}${k}`;
        users[id] = (await at((tx) => tx.user.create({ data: { organizationId: org[k]!, email, name: `${who} ${k} ${run}`, passwordHash, role: 'panel', permissionProfileId } }))).id;
        token[id] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      }
    }
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const u = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: u } } });
        await tx.session.deleteMany({ where: { userId: { in: u } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('a deleted designation is in the bin (who, when it goes) and comes back with its own id', async () => {
    const id = await designation('hrA', 'Line lead');
    await api('hrA', 'delete', `/org/masters/designations/${id}`).expect(204);
    expect(await inA((tx) => tx.designation.findFirst({ where: { id } }))).toBeNull();
    const bin = await items('hrA');
    expect(bin.keepDays).toBe(180);
    const item = bin.items.find((i) => i.label === 'Line lead')!;
    expect(item).toEqual(expect.objectContaining({ source: 'bin', kind: 'designation', deletedBy: `hr A ${run}` }));
    expect(new Date(item.purgeOn).getTime() - Date.now()).toBeGreaterThan(179 * 86_400_000);
    await api('hrA', 'post', `/recycle-bin/items/${item.id}/restore`).expect(200);
    expect((await inA((tx) => tx.designation.findFirst({ where: { id } })))?.name).toBe('Line lead');
    expect(await binOf('hrA', 'Line lead')).toBeUndefined();
    await api('hrA', 'post', `/recycle-bin/items/${item.id}/restore`).expect(404);
    const audited = await inA((tx) => tx.auditLog.count({ where: { action: 'designation.restored', entityId: id } }));
    expect(audited).toBe(1);
  });

  it('refuses to come back over a new record of the same name (409), and stays in the bin', async () => {
    const id = await designation('hrA', 'Shift supervisor');
    await api('hrA', 'delete', `/org/masters/designations/${id}`).expect(204);
    await designation('hrA', 'Shift supervisor');
    const item = (await binOf('hrA', 'Shift supervisor'))!;
    expect((await api('hrA', 'post', `/recycle-bin/items/${item.id}/restore`).expect(409)).body.message).toMatch(/same name or code/);
    expect(await binOf('hrA', 'Shift supervisor')).toBeDefined();
  });

  it('deleting for good needs a step-up, is audited and cannot be undone', async () => {
    const item = (await binOf('hrA', 'Shift supervisor'))!;
    expect((await api('hrA', 'delete', `/recycle-bin/items/${item.id}`).expect(403)).body.code).toBe('STEP_UP_REQUIRED');
    await markSteppedUp(tenantPrisma, token.hrA!);
    await api('hrA', 'delete', `/recycle-bin/items/${item.id}`).expect(200);
    expect(await binOf('hrA', 'Shift supervisor')).toBeUndefined();
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'recycle_bin.purged' } }))).toBe(1);
  });

  it('the wrong role is refused and nothing changes', async () => {
    const id = await designation('hrA', 'Store keeper');
    await api('hrA', 'delete', `/org/masters/designations/${id}`).expect(204);
    const item = (await binOf('hrA', 'Store keeper'))!;
    await api('plainA', 'get', '/recycle-bin/items').expect(403);
    await api('plainA', 'post', `/recycle-bin/items/${item.id}/restore`).expect(403);
    await api('plainA', 'delete', `/recycle-bin/items/${item.id}`).expect(403);
    expect(await binOf('hrA', 'Store keeper')).toBeDefined();
  });

  it('another company sees none of it and cannot restore or delete it', async () => {
    const item = (await binOf('hrA', 'Store keeper'))!;
    expect((await items('hrB')).items).toEqual([]);
    await api('hrB', 'post', `/recycle-bin/items/${item.id}/restore`).expect(404);
    await markSteppedUp(tenantPrisma, token.hrB!);
    await api('hrB', 'delete', `/recycle-bin/items/${item.id}`).expect(404);
    expect(await binOf('hrA', 'Store keeper')).toBeDefined();
  });

  it('bad input is a 400 and changes nothing', async () => {
    await api('hrA', 'post', '/recycle-bin/items/not-an-id/restore').expect(400);
    await api('hrA', 'put', '/org/settings').send({ key: 'recycle_bin.keep_days', value: '45', scopeType: 'tenant' }).expect(400);
    expect((await items('hrA')).keepDays).toBe(180);
  });

  it('keep days is a company setting; the nightly job removes items older than it (and only those)', async () => {
    await api('hrA', 'put', '/org/settings').send({ key: 'recycle_bin.keep_days', value: '30', scopeType: 'tenant' }).expect(200);
    expect((await items('hrA')).keepDays).toBe(30);
    const id = await designation('hrA', 'Old role');
    await api('hrA', 'delete', `/org/masters/designations/${id}`).expect(204);
    await inA((tx) => tx.recycleBinItem.updateMany({ where: { label: 'Old role' }, data: { deletedAt: new Date(Date.now() - 31 * 86_400_000) } }));
    await app.get(RecycleBinRetentionService).prune();
    expect(await binOf('hrA', 'Old role')).toBeUndefined();
    expect(await binOf('hrA', 'Store keeper')).toBeDefined();
  });
});
