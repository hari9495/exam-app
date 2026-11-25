import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';

// Recycle bin wave 2 (answer 2439), against the real database (forced RLS, app role): a deleted user group and a deleted
// candidate survey wait in the bin with their child rows (members, responses) and come back whole, with their own ids.
// Without the settings key, from another company, or over a new record of the same name, nothing comes back, not even
// part of it.
describe('Recycle bin wave 2: records come back with their child rows', () => {
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
  const api = (who: string, method: 'get' | 'post' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  type Item = { id: string; kind: string; label: string; area: string };
  const binOf = async (label: string) => ((await api('adminA', 'get', '/recycle-bin/items').expect(200)).body.items as Item[]).find((i) => i.label === label);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A!, isSuperAdmin: false }, fn);

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `rb2-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B']) {
      const slug = `rb2-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `RB2 ${k} ${run}`, slug, planId } })).id;
      const people: [string, string][] = k === 'A' ? [['admin', 'org_admin'], ['plain', 'panel']] : [['admin', 'org_admin']];
      for (const [who, role] of people) {
        const email = `${who}-${k.toLowerCase()}-${run}@rb2.test`;
        const id = `${who}${k}`;
        users[id] = (await tenantPrisma.forTenant({ organizationId: org[k]!, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: org[k]!, email, name: `${who} ${k} ${run}`, passwordHash, role } }))).id;
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

  it('a deleted user group comes back with its members, same ids, audited', async () => {
    const name = `Campus panel ${run}`;
    const group = await inA((tx) => tx.userGroup.create({ data: { organizationId: org.A!, name } }));
    const members = await inA((tx) => Promise.all([users.adminA!, users.plainA!].map((userId) => tx.userGroupMember.create({ data: { organizationId: org.A!, groupId: group.id, userId } }))));
    await api('adminA', 'delete', `/user-groups/${group.id}`).expect(200);
    expect(await inA((tx) => tx.userGroupMember.count({ where: { groupId: group.id } }))).toBe(0);
    const item = (await binOf(name))!;
    expect(item).toMatchObject({ kind: 'user_group', area: 'Access' });
    await api('adminA', 'post', `/recycle-bin/items/${item.id}/restore`).expect(200);
    expect((await inA((tx) => tx.userGroup.findFirst({ where: { id: group.id } })))?.name).toBe(name);
    const back = await inA((tx) => tx.userGroupMember.findMany({ where: { groupId: group.id }, orderBy: { id: 'asc' } }));
    expect(back.map((m) => m.id).sort()).toEqual(members.map((m) => m.id).sort());
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'user_group.restored', entityId: group.id } }))).toBe(1);
    expect(await binOf(name)).toBeUndefined();
  });

  it('a deleted candidate survey comes back with its responses (same token)', async () => {
    const name = `Experience ${run}`;
    const survey = await inA((tx) => tx.surveyDefinition.create({ data: { organizationId: org.A!, name, questionsJson: '[{"id":"q1","type":"rating","text":"How was it?"}]' } }));
    const tok = `tok-${run}`;
    await inA((tx) => tx.surveyResponse.create({ data: { organizationId: org.A!, surveyId: survey.id, candidateId: randomUUID(), entryId: randomUUID(), token: tok, status: 'submitted', answersJson: '{"q1":5}', submittedAt: new Date() } }));
    await api('adminA', 'delete', `/surveys/${survey.id}`).expect(200);
    expect(await inA((tx) => tx.surveyResponse.count({ where: { surveyId: survey.id } }))).toBe(0);
    const item = (await binOf(name))!;
    expect(item.kind).toBe('survey');
    await api('adminA', 'post', `/recycle-bin/items/${item.id}/restore`).expect(200);
    const responses = await inA((tx) => tx.surveyResponse.findMany({ where: { surveyId: survey.id } }));
    expect(responses).toEqual([expect.objectContaining({ token: tok, status: 'submitted', answersJson: '{"q1":5}' })]);
  });

  it('nothing comes back without the settings key, from another company, or over a group of the same name (not even members)', async () => {
    const name = `Night shift ${run}`;
    const group = await inA((tx) => tx.userGroup.create({ data: { organizationId: org.A!, name } }));
    await inA((tx) => tx.userGroupMember.create({ data: { organizationId: org.A!, groupId: group.id, userId: users.plainA! } }));
    await api('plainA', 'delete', `/user-groups/${group.id}`).expect(403);
    await api('adminA', 'delete', `/user-groups/${group.id}`).expect(200);
    const item = (await binOf(name))!;
    await api('plainA', 'post', `/recycle-bin/items/${item.id}/restore`).expect(403);
    await api('adminB', 'post', `/recycle-bin/items/${item.id}/restore`).expect(404);
    await api('adminA', 'post', '/recycle-bin/items/not-a-uuid/restore').expect(400);
    const again = await inA((tx) => tx.userGroup.create({ data: { organizationId: org.A!, name } }));
    expect((await api('adminA', 'post', `/recycle-bin/items/${item.id}/restore`).expect(409)).body.message).toMatch(/same name/);
    expect(await inA((tx) => tx.userGroupMember.count({ where: { groupId: group.id } }))).toBe(0);
    expect(await inA((tx) => tx.userGroup.findFirst({ where: { id: group.id } }))).toBeNull();
    expect(await binOf(name)).toBeDefined();
    await inA((tx) => tx.userGroup.delete({ where: { id: again.id } }));
  });
});
