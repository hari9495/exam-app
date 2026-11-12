import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { giveStaffRoles, rolesWithout } from './fixtures/staff-roles';

// Console C-8, YX-12, against the real database (forced RLS, app role). Staff write a nudge per feature switch; a second
// staff member approves it. A company person sees it only when the switch allows it (never when YukthiX killed it), only
// if they can act on it, and at most the weekly limit (platform setting) in 7 days.
describe('Console C-8 YX-12: nudges per feature switch', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org = { A: '', B: '' };
  let planId = '';
  let limitBefore: string | null = null;
  const made: string[] = [];
  const api = (who: string, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who] ?? who}`);
  const inOrg = <T>(id: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: id, isSuperAdmin: false }, fn);
  const setLimit = (v: number) => tenantPrisma.forTenant(SUPER, (tx) => tx.platformSetting.upsert({ where: { key: 'nudges.weekly_limit_per_person' }, create: { key: 'nudges.weekly_limit_per_person', value: String(v) }, update: { value: String(v) } }));
  const withoutKey = async (key: string, fn: () => Promise<void>) => {
    const keep = await rolesWithout(key);
    await giveStaffRoles(users.staff!, keep);
    try {
      await fn();
    } finally {
      await giveStaffRoles(users.staff!);
    }
  };
  const mine = async (who: string) => (await api(who, 'get', '/help/nudge').expect(200)).body.nudge as { id: string; heading: string; kind: string; switchHref: string | null } | null;
  const switchOn = { featureKey: 'access.requests', kind: 'switch_on', heading: `Let people ask ${run}`, body: 'Switch on access requests so people can ask for a page they cannot open.' };
  const suggest = { featureKey: 'help.tours', kind: 'suggest', heading: `Try the tours ${run}`, body: 'Each short tour starts once, the first time someone reaches its page.' };
  const approve = async (heading: string) => {
    const n = (await api('staff2', 'get', '/platform/nudges').expect(200)).body.nudges.find((x: { heading: string }) => x.heading === heading);
    made.push(n.id);
    await api('staff2', 'post', `/platform/nudges/${n.id}/review`).send({ approve: true }).expect(200);
    return n.id as string;
  };

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    limitBefore = (await tenantPrisma.forTenant(SUPER, (tx) => tx.platformSetting.findUnique({ where: { key: 'nudges.weekly_limit_per_person' } })))?.value ?? null;
    // Other runs' live copy for these two switches is taken down first (one live per switch and kind anyway).
    await tenantPrisma.forTenant(SUPER, (tx) => tx.featureNudge.updateMany({ where: { status: 'live' }, data: { status: 'retired', retiredAt: new Date() } }));
    await setLimit(2);
    const passwordHash = await argon2.hash(PASSWORD);
    for (const who of ['staff', 'staff2', 'staffNoKey']) {
      const email = `${who.toLowerCase()}-${run}@platform.test`;
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      await giveStaffRoles(users[who]!);
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
      if (who !== 'staffNoKey') await markSteppedUp(tenantPrisma, token[who]!);
    }
    planId = (await prisma.plan.create({ data: { name: `c8n-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const slug = `c8n-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `C8N ${k} ${run}`, slug, planId } })).id;
      const people = k === 'A' ? [['admin', 'org_admin'], ['admin2', 'org_admin'], ['panel', 'panel']] : [['admin', 'org_admin']];
      for (const [who, role] of people) {
        const email = `${who}-${k.toLowerCase()}-${run}@c8n.test`;
        users[`${who}${k}`] = (await inOrg(org[k], (tx) => tx.user.create({ data: { organizationId: org[k], email, name: `${who} ${k}`, passwordHash, role: role! } }))).id;
        token[`${who}${k}`] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      }
    }
    // Company A has access requests off (it can switch them on); company B keeps them on.
    await inOrg(org.A, (tx) => tx.setting.create({ data: { organizationId: org.A, scopeType: 'tenant', scopeId: org.A, key: 'access.request.allowed', value: 'off' } }));
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.featureNudge.updateMany({ where: { id: { in: made }, status: 'live' }, data: { status: 'retired', retiredAt: new Date() } });
        if (limitBefore === null) await tx.platformSetting.deleteMany({ where: { key: 'nudges.weekly_limit_per_person' } });
        else await tx.platformSetting.update({ where: { key: 'nudges.weekly_limit_per_person' }, data: { value: limitBefore } });
        await tx.featureFlag.update({ where: { key: 'access.requests' }, data: { killedAt: null, killedBy: null, killReason: null } });
        const ids = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: { in: Object.values(org).filter(Boolean) } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('who may write them', () => {
    it('a company admin and no sign-in are refused', async () => {
      await api('adminA', 'get', '/platform/nudges').expect(403);
      await api('adminA', 'post', '/platform/nudges').send(switchOn).expect(403);
      await request(server()).get('/api/v1/platform/nudges').expect(401);
    });

    it('staff without their security key, or without the nudges key, are refused', async () => {
      expect((await api('staffNoKey', 'get', '/platform/nudges').expect(403)).body.code).toBe('MFA_REQUIRED');
      await withoutKey('platform.nudges.write', async () => {
        await api('staff', 'get', '/platform/nudges').expect(403);
        await api('staff', 'post', '/platform/nudges').send(switchOn).expect(403);
      });
    });

    it('bad input is refused: an unknown switch, a short body, markup', async () => {
      await api('staff', 'post', '/platform/nudges').send({ ...switchOn, featureKey: 'no.such' }).expect(400);
      await api('staff', 'post', '/platform/nudges').send({ ...switchOn, body: 'Short' }).expect(400);
      await api('staff', 'post', '/platform/nudges').send({ ...switchOn, heading: '<b>Hi</b> there' }).expect(400);
    });
  });

  describe('write, approve, show', () => {
    it('written: nobody sees it until another staff member approves it; the writer cannot', async () => {
      const body = (await api('staff', 'post', '/platform/nudges').send(switchOn).expect(201)).body;
      const n = body.nudges.find((x: { heading: string }) => x.heading === switchOn.heading);
      expect(n).toMatchObject({ status: 'pending', mine: true });
      expect(await mine('adminA')).toBeNull();
      expect((await api('staff', 'post', `/platform/nudges/${n.id}/review`).send({ approve: true }).expect(403)).body.message).toMatch(/Another staff member approves it/);
      await api('staff2', 'post', `/platform/nudges/${n.id}/review`).send({ approve: false }).expect(400);
      await approve(switchOn.heading);
    });

    it('switch-on copy: the admin of the company with it off sees it, with where to switch it on', async () => {
      expect(await mine('adminA')).toMatchObject({ heading: switchOn.heading, kind: 'switch_on', switchHref: '/yx/settings/access-settings' });
    });

    it('never to someone who cannot act (a person without the settings keys), nor where it is already on', async () => {
      expect(await mine('panelA')).toBeNull();
      expect(await mine('adminB')).toBeNull();
    });

    it('hidden while the feature is killed, back when it is not', async () => {
      await tenantPrisma.forTenant(SUPER, (tx) => tx.featureFlag.update({ where: { key: 'access.requests' }, data: { killedAt: new Date(), killedBy: users.staff!, killReason: 'e2e kill switch' } }));
      try {
        expect(await mine('admin2A')).toBeNull();
        expect(await mine('adminA')).toBeNull();
      } finally {
        await tenantPrisma.forTenant(SUPER, (tx) => tx.featureFlag.update({ where: { key: 'access.requests' }, data: { killedAt: null, killedBy: null, killReason: null } }));
      }
      expect(await mine('admin2A')).toMatchObject({ heading: switchOn.heading });
    });

    it('one company never sees another company’s views (RLS)', async () => {
      expect(await inOrg(org.B, (tx) => tx.nudgeView.findMany({ where: { organizationId: org.A } }))).toEqual([]);
      expect((await inOrg(org.A, (tx) => tx.nudgeView.findMany({ where: { userId: users.adminA! } }))).length).toBe(1);
    });
  });

  describe('the weekly limit (platform setting)', () => {
    beforeAll(async () => {
      await api('staff', 'post', '/platform/nudges').send(suggest).expect(201);
      await approve(suggest.heading);
    });

    it('Not now puts it away; with a limit of 1 a second one waits for next week', async () => {
      const n = (await mine('adminA'))!;
      expect(n.heading).toBe(switchOn.heading);
      await api('adminA', 'post', `/help/nudge/${n.id}/dismiss`).expect(200);
      await api('adminA', 'post', `/help/nudge/${n.id}/dismiss`).expect(404);
      await setLimit(1);
      expect(await mine('adminA')).toBeNull();
    });

    it('with the default 2 the next one shows; a suggestion goes to anyone who can use it', async () => {
      await setLimit(2);
      expect(await mine('adminA')).toMatchObject({ heading: suggest.heading, kind: 'suggest', switchHref: null });
      expect(await mine('panelA')).toMatchObject({ heading: suggest.heading });
    });

    it('a limit of 0 shows nothing to someone who has not seen it', async () => {
      await setLimit(0);
      expect(await mine('adminB')).toBeNull();
      await setLimit(2);
      expect(await mine('adminB')).toMatchObject({ heading: suggest.heading });
    });

    it('the limit is a platform setting from 0 to 7', async () => {
      const list = (await api('staff', 'get', '/platform/settings').expect(200)).body as { key: string; default: string; allowed: string }[];
      expect(list.find((s) => s.key === 'nudges.weekly_limit_per_person')).toMatchObject({ default: '2', allowed: 'a whole number from 0 to 7' });
    });

    it('every step is audited', async () => {
      const rows = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { entityId: { in: made } }, select: { action: true } }));
      expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(['platform.nudge.written', 'platform.nudge.approved']));
    });
  });
});
